"""HR / Teacher Onboarding — recruitment endpoints.

POST /api/v1/hr-interviews/{profile_id}/process-recording — validate,
  download the interview recording from Google Drive, transcribe via
  Whisper, auto-chain into demo_analyst to produce a scorecard draft.
  Returns 202 immediately; frontend watches teacher_profiles and
  hr_interview_drafts realtime subscriptions for progress.

POST /api/v1/hr-interviews/{profile_id}/analyze — re-run the analyst
  against an already-saved transcript (manual retry path).

Reuses existing ingest.run (pure Whisper transcription — see
backend/agents/ingest.py) and demo_analyst.run (Groq Llama-3.3 scorecard
agent — see backend/agents/demo_analyst.py). In v1 the HR interview uses
demo_analyst's existing rubric as a pragmatic bootstrap; a dedicated
hr_interview_analyst with an HR-specific prompt is a follow-up.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from openai import OpenAIError

from agents import base, demo_analyst, ingest
from app.auth import AuthUser, require_auth
from app.models import (
    HrInterviewAnalysisResponse,
    HrInterviewProcessResponse,
)

router = APIRouter()

HR_INGEST_AGENT_NAME = "hr_interview_ingest"
HR_ANALYST_AGENT_NAME = "hr_interview_analyst"

AGENT_TIMEOUT_SECONDS = 60.0
INGEST_TIMEOUT_SECONDS = 900.0
INGEST_RETRY_DELAY_SECONDS = 5.0


async def _attempt_ingest(profile_id: str, recording_link: str):
    """Run ingest.run with a timeout. ingest.run's first arg is unused
    internally (see backend/agents/ingest.py:256), so passing the profile UUID
    as a trace token is fine. We use 0 since ingest.run is typed `int`."""
    return await asyncio.wait_for(
        ingest.run(0, recording_link),
        timeout=INGEST_TIMEOUT_SECONDS,
    )


async def _run_hr_ingest_chain(profile_id: str, recording_link: str) -> None:
    """Background task: ingest (with one retry) → transcript save →
    demo_analyst (bootstrap) → hr_interview_drafts write → profile status='pending'.

    All errors are caught and written to task_queue.error_message so the
    frontend can surface them via the realtime subscription.
    """
    ingest_task_id = await base.record_hr_task_start(profile_id, HR_INGEST_AGENT_NAME)
    ingest_started_at = datetime.now(timezone.utc)
    result = None
    last_error: str | None = None

    for attempt in (1, 2):
        try:
            result = await _attempt_ingest(profile_id, recording_link)
            break
        except asyncio.TimeoutError:
            last_error = f"Ingest timed out after {INGEST_TIMEOUT_SECONDS}s (attempt {attempt})"
        except ValueError as exc:
            last_error = f"Invalid input: {exc}"
            break
        except httpx.HTTPError as exc:
            last_error = f"Download failed (attempt {attempt}): {exc}"
        except RuntimeError as exc:
            last_error = f"Ingest failed (attempt {attempt}): {exc}"
        except Exception as exc:  # noqa: BLE001
            last_error = f"Unexpected ingest error (attempt {attempt}): {exc}"

        if attempt == 1:
            await asyncio.sleep(INGEST_RETRY_DELAY_SECONDS)

    if result is None:
        await base.record_task_failed(ingest_task_id, last_error or "Unknown ingest error")
        return

    # Save transcript to hr_interview_drafts
    try:
        await base.upsert_hr_interview_draft(profile_id, transcript=result.transcript)
    except Exception as exc:  # noqa: BLE001
        await base.record_task_failed(ingest_task_id, f"Transcript save failed: {exc}")
        return

    ingest_completed_at = datetime.now(timezone.utc)
    ingest_duration_ms = int((ingest_completed_at - ingest_started_at).total_seconds() * 1000)
    try:
        await base.record_task_complete(
            task_id=ingest_task_id,
            duration_ms=ingest_duration_ms,
            input_tokens=result.audio_size_bytes,
            output_tokens=len(result.transcript),
        )
    except Exception:  # noqa: BLE001
        pass

    # Chain into analyst (v1 bootstrap uses demo_analyst's rubric)
    analysis_task_id = await base.record_hr_task_start(profile_id, HR_ANALYST_AGENT_NAME)
    analysis_started_at = datetime.now(timezone.utc)

    try:
        agent_result = await asyncio.wait_for(
            demo_analyst.run(0, result.transcript),
            timeout=AGENT_TIMEOUT_SECONDS,
        )
        await base.upsert_hr_interview_draft(
            profile_id,
            draft_data=agent_result.draft.model_dump(),
        )
        # Surface the candidate to the HR queue as 'pending' (reviewable).
        await base.update_teacher_profile_status(profile_id, "pending")

        analysis_completed_at = datetime.now(timezone.utc)
        analysis_duration_ms = int(
            (analysis_completed_at - analysis_started_at).total_seconds() * 1000
        )
        try:
            await base.record_task_complete(
                task_id=analysis_task_id,
                duration_ms=analysis_duration_ms,
                input_tokens=agent_result.input_tokens,
                output_tokens=agent_result.output_tokens,
            )
        except Exception:  # noqa: BLE001
            pass
    except (asyncio.TimeoutError, ValueError, OpenAIError, Exception) as exc:
        error_detail = f"HR analyst failed: {type(exc).__name__}: {exc!r}"
        await base.record_task_failed(analysis_task_id, error_detail)


@router.post(
    "/{profile_id}/process-recording",
    response_model=HrInterviewProcessResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Validate and enqueue interview recording ingest + analysis for a teacher candidate",
)
async def process_hr_recording(
    profile_id: str,
    background_tasks: BackgroundTasks,
    user: AuthUser = Depends(require_auth),
) -> HrInterviewProcessResponse:
    profile = await base.fetch_teacher_profile(profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Teacher profile {profile_id} not found",
        )

    if user.role not in ("hr", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only hr or manager may trigger interview processing",
        )

    recording_link = profile.get("interview_recording_link") or ""
    if not recording_link.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate has no interview recording link.",
        )
    if not ingest.extract_file_id(recording_link):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recording link is not a recognized Google Drive sharing link.",
        )

    existing_task = await base.fetch_running_hr_task(profile_id, HR_INGEST_AGENT_NAME)
    if existing_task is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Interview processing already in progress (task_id={existing_task}).",
        )

    background_tasks.add_task(_run_hr_ingest_chain, profile_id, recording_link)

    return HrInterviewProcessResponse(teacher_profile_id=profile_id, status="queued")


@router.post(
    "/{profile_id}/analyze",
    response_model=HrInterviewAnalysisResponse,
    summary="Run the analyst agent against an existing interview transcript",
)
async def analyze_hr_interview(
    profile_id: str,
    user: AuthUser = Depends(require_auth),
) -> HrInterviewAnalysisResponse:
    profile = await base.fetch_teacher_profile(profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Teacher profile {profile_id} not found",
        )

    if user.role not in ("hr", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only hr or manager may trigger interview analysis",
        )

    draft = await base.fetch_hr_interview_draft(profile_id)
    if draft is None or not (draft.get("transcript") or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No transcript available for this interview",
        )

    existing_task = await base.fetch_running_hr_task(profile_id, HR_ANALYST_AGENT_NAME)
    if existing_task is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Analysis already in progress (task_id={existing_task}).",
        )

    started_at = datetime.now(timezone.utc)
    task_id = await base.record_hr_task_start(profile_id, HR_ANALYST_AGENT_NAME)

    try:
        result = await asyncio.wait_for(
            demo_analyst.run(0, draft["transcript"]),
            timeout=AGENT_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        await base.record_task_failed(task_id, f"Agent timed out after {AGENT_TIMEOUT_SECONDS}s")
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Analysis timed out")
    except ValueError as exc:
        await base.record_task_failed(task_id, f"JSON parse failed: {exc}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Invalid output: {exc}")
    except OpenAIError as exc:
        await base.record_task_failed(task_id, f"Groq API error: {exc}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LLM API error: {exc}")
    except Exception as exc:  # noqa: BLE001
        await base.record_task_failed(task_id, f"Unexpected error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {exc}",
        )

    try:
        row = await base.upsert_hr_interview_draft(
            profile_id,
            draft_data=result.draft.model_dump(),
        )
    except Exception as exc:  # noqa: BLE001
        await base.record_task_failed(task_id, f"Draft write failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save draft: {exc}",
        )

    await base.update_teacher_profile_status(profile_id, "pending")

    completed_at = datetime.now(timezone.utc)
    duration_ms = int((completed_at - started_at).total_seconds() * 1000)
    try:
        await base.record_task_complete(
            task_id=task_id,
            duration_ms=duration_ms,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
        )
    except Exception:  # noqa: BLE001
        pass

    return HrInterviewAnalysisResponse(
        id=str(row["id"]),
        teacher_profile_id=profile_id,
        agent_name=HR_ANALYST_AGENT_NAME,
        status=row["status"],
        created_at=row["created_at"],
    )
