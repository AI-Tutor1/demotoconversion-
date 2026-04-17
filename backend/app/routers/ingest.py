"""Ingest HTTP surface.

POST /api/v1/demos/{id}/process-recording — download the recording from its
Google Drive URL, extract audio, transcribe via Whisper, save the transcript
to demos.transcript, then auto-chain into the Demo Analyst agent.

Transcript save happens IMMEDIATELY after Whisper returns, before the analysis
chain — that way if analysis crashes, the (expensive) transcription is safe
and the analyst can manually retry Analyze from the dashboard.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from openai import OpenAIError

from agents import base, demo_analyst, ingest
from app.auth import AuthUser, require_auth
from app.models import ProcessRecordingResponse
from app.supabase_client import get_supabase

router = APIRouter()

# Whole-endpoint ceiling: download (up to 5min) + ffmpeg (~2min) + Whisper (~3min)
# + optional Demo Analyst chain (~0.5min) fits comfortably under 10min for a 60-min recording.
INGEST_TIMEOUT_SECONDS = 600.0


def _update_transcript_sync(demo_id: int, transcript: str) -> None:
    sb = get_supabase()
    sb.table("demos").update({"transcript": transcript}).eq("id", demo_id).execute()


async def _update_transcript(demo_id: int, transcript: str) -> None:
    """Persist transcript to demos.transcript — called the instant Whisper finishes,
    before any chained analysis work, so a downstream failure can't lose it."""
    await asyncio.to_thread(_update_transcript_sync, demo_id, transcript)


@router.post(
    "/{demo_id}/process-recording",
    response_model=ProcessRecordingResponse,
    summary="Download the recording, transcribe via Whisper, auto-chain into Demo Analyst",
)
async def process_recording(
    demo_id: int,
    user: AuthUser = Depends(require_auth),
) -> ProcessRecordingResponse:
    # 1. Fetch demo
    demo = await base.fetch_demo(demo_id)
    if demo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Demo {demo_id} not found",
        )

    # 1a. Authorise — analysts, managers, and sales agents may trigger ingestion.
    # RLS already scopes sales agents to their own demos; this gate rejects
    # any other unanticipated role (e.g. "viewer") at the application layer.
    if user.role not in ("analyst", "manager", "sales_agent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only analysts, managers, and sales agents may trigger recording processing",
        )

    # 2. Validate recording URL format BEFORE starting a task row
    if not demo.recording or not demo.recording.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Demo has no recording URL — paste a Google Drive link first.",
        )
    if not ingest.extract_file_id(demo.recording):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recording URL is not a recognized Google Drive sharing link.",
        )

    # 3. Idempotency: if an ingest task is already running/queued, return 409.
    existing_ingest_id = await base.fetch_running_task(demo_id, ingest.AGENT_NAME)
    if existing_ingest_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Recording ingest already in progress (task_id={existing_ingest_id}). Wait for it to complete.",
        )

    # Also block if a pending_review draft already exists — the analyst has
    # an unresolved scorecard. Don't stack a second pipeline run on top of it.
    existing_draft = await base.fetch_pending_draft(demo_id)
    if existing_draft is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A pending draft already exists for demo {demo_id} (draft_id={existing_draft}). Approve or reject it before re-processing.",
        )

    # 4. Start task (ingest). Every failure path below updates this row.
    ingest_started_at = datetime.now(timezone.utc)
    ingest_task_id = await base.record_task_start(demo_id, ingest.AGENT_NAME)

    # 4. Run ingest with overall timeout
    try:
        result = await asyncio.wait_for(
            ingest.run(demo_id, demo.recording),
            timeout=INGEST_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        await base.record_task_failed(
            ingest_task_id, f"Ingest timed out after {INGEST_TIMEOUT_SECONDS}s"
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Recording ingest timed out after {INGEST_TIMEOUT_SECONDS}s",
        )
    except ValueError as exc:
        # Shouldn't happen — we pre-validated the URL, but guard anyway
        await base.record_task_failed(ingest_task_id, f"Invalid input: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except httpx.HTTPError as exc:
        await base.record_task_failed(ingest_task_id, f"Download failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to download recording: {exc}",
        )
    except RuntimeError as exc:
        # ingest.run raises RuntimeError for download/ffmpeg/whisper failures
        await base.record_task_failed(ingest_task_id, f"Ingest failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    except Exception as exc:  # noqa: BLE001
        await base.record_task_failed(ingest_task_id, f"Unexpected ingest error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Recording ingest failed: {exc}",
        )

    # 5. ✦ SAVE TRANSCRIPT IMMEDIATELY ✦ — before attempting auto-chain.
    # If the analysis chain below fails, the transcript survives on the demo row.
    try:
        await _update_transcript(demo_id, result.transcript)
    except Exception as exc:  # noqa: BLE001
        await base.record_task_failed(
            ingest_task_id, f"Transcript save to Supabase failed: {exc}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcript completed but could not be saved: {exc}",
        )

    # 6. Record ingest task as completed
    ingest_completed_at = datetime.now(timezone.utc)
    ingest_duration_ms = int(
        (ingest_completed_at - ingest_started_at).total_seconds() * 1000
    )
    try:
        await base.record_task_complete(
            task_id=ingest_task_id,
            duration_ms=ingest_duration_ms,
            # Ingest has no LLM token counts in the traditional sense —
            # reuse input_tokens for audio bytes, output_tokens for transcript chars
            input_tokens=result.audio_size_bytes,
            output_tokens=len(result.transcript),
        )
    except Exception:  # noqa: BLE001
        pass  # ingest succeeded; logging failure is non-fatal

    # 7. Auto-chain: Demo Analyst runs against the fresh transcript.
    # Failure here is non-fatal — transcript is already saved; analyst can
    # retry manually from the dashboard.
    analysis_task_id = await base.record_task_start(demo_id, demo_analyst.AGENT_NAME)
    analysis_started_at = datetime.now(timezone.utc)
    analysis_draft_id: str | None = None
    analysis_status = "transcription_only"

    try:
        agent_result = await asyncio.wait_for(
            demo_analyst.run(demo_id, result.transcript),
            timeout=60.0,
        )
        draft_row = await base.write_draft(
            demo_id=demo_id,
            agent_name=demo_analyst.AGENT_NAME,
            draft_data=agent_result.draft.model_dump(),
        )
        analysis_draft_id = str(draft_row["id"])
        analysis_status = "transcribed_and_analyzed"
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

        # 8. Auto-approve: write flat scorecard fields onto the demo row and
        # flip is_draft=False so the demo becomes visible on the Sales page.
        # Non-fatal — if this fails the draft remains in pending_review and an
        # analyst can approve manually from /drafts.
        try:
            await base.auto_approve_draft(
                demo_id=demo_id,
                draft_id=analysis_draft_id,
                draft=agent_result.draft,
            )
        except Exception:  # noqa: BLE001
            pass
    except (
        asyncio.TimeoutError,
        ValueError,
        OpenAIError,
        Exception,
    ) as exc:
        # Every analysis failure falls through to "transcription_only" — the
        # transcript is already persisted, so the analyst can retry manually.
        await base.record_task_failed(
            analysis_task_id, f"Auto-chained analysis failed: {exc}"
        )

    return ProcessRecordingResponse(
        demo_id=demo_id,
        transcript_length=len(result.transcript),
        duration_seconds=result.duration_seconds,
        analysis_draft_id=analysis_draft_id,
        status=analysis_status,
    )
