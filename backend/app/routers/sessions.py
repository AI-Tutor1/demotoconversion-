"""Product Review Workflow — Session HTTP surface.

POST /api/v1/sessions/{id}/process-recording — validate, enqueue background
  task, return 202 immediately. The background task downloads the recording
  (serialized across the process via a Drive semaphore in ingest.py),
  transcribes via Whisper, saves transcript, auto-chains into Demo Analyst.
  Retries ingest once (5s delay) on transient failure before marking failed.

POST /api/v1/sessions/{id}/analyze — run the Demo Analyst agent against an
  existing transcript (manual retry path). Stays synchronous.

Both endpoints reuse the same AI agents as the demo pipeline (ingest + demo_analyst).
The only difference is they read/write sessions + session_drafts tables.
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
    AutoRetryResponse,
    SessionAnalysisResponse,
    SessionProcessRecordingResponse,
)
from app.scheduler import auto_retry_failed_sessions
from app.supabase_client import get_supabase

router = APIRouter()

AGENT_TIMEOUT_SECONDS = 60.0
# Budget covers: Drive-semaphore wait + gdown download + ffmpeg + Whisper-
# semaphore wait + Whisper call + internal 429 backoffs. 900s accommodates
# a 30-min recording behind 3 other sessions in the Whisper queue.
INGEST_TIMEOUT_SECONDS = 900.0
INGEST_RETRY_DELAY_SECONDS = 5.0


def _update_session_transcript_sync(session_id: int, transcript: str) -> None:
    sb = get_supabase()
    sb.table("sessions").update({"transcript": transcript}).eq("id", session_id).execute()


def _update_session_status_sync(session_id: int, processing_status: str) -> None:
    sb = get_supabase()
    sb.table("sessions").update({"processing_status": processing_status}).eq("id", session_id).execute()


def _fetch_session_transcript_sync(session_id: int) -> str | None:
    sb = get_supabase()
    res = sb.table("sessions").select("transcript").eq("id", session_id).limit(1).execute()
    if res.data:
        return res.data[0].get("transcript")
    return None


async def _attempt_ingest(session_id: int, recording_link: str):
    """Run ingest.run() with a 600s wrapper. Returns the IngestResult on
    success, or the Exception if it failed for a transient reason worth
    retrying (download, ffmpeg, timeout). ValueError is not retryable."""
    return await asyncio.wait_for(
        ingest.run(session_id, recording_link),
        timeout=INGEST_TIMEOUT_SECONDS,
    )


async def _run_ingest_chain(session_id: int, recording_link: str) -> None:
    """Background task: ingest (with one retry) → transcript save → demo_analyst
    → draft write → session status='scored'. All errors are caught and written
    to task_queue + sessions.processing_status so the frontend can surface them
    via the realtime subscription.
    """
    # ─── Ingest, with one retry on transient failure ──────────────
    ingest_task_id = await base.record_session_task_start(session_id, ingest.AGENT_NAME)
    ingest_started_at = datetime.now(timezone.utc)
    result = None
    last_error: str | None = None

    for attempt in (1, 2):
        try:
            result = await _attempt_ingest(session_id, recording_link)
            break
        except asyncio.TimeoutError:
            last_error = f"Ingest timed out after {INGEST_TIMEOUT_SECONDS}s (attempt {attempt})"
        except ValueError as exc:
            # Unrecoverable — bad recording URL. Don't retry.
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
        await asyncio.to_thread(_update_session_status_sync, session_id, "failed")
        return

    # ─── Save transcript ───────────────────────────────────────────
    try:
        await asyncio.to_thread(_update_session_transcript_sync, session_id, result.transcript)
    except Exception as exc:  # noqa: BLE001
        await base.record_task_failed(ingest_task_id, f"Transcript save failed: {exc}")
        await asyncio.to_thread(_update_session_status_sync, session_id, "failed")
        return

    # ─── Record ingest completion ─────────────────────────────────
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

    # ─── Auto-chain: Demo Analyst ─────────────────────────────────
    analysis_task_id = await base.record_session_task_start(session_id, demo_analyst.AGENT_NAME)
    analysis_started_at = datetime.now(timezone.utc)

    try:
        agent_result = await asyncio.wait_for(
            demo_analyst.run(session_id, result.transcript),
            timeout=AGENT_TIMEOUT_SECONDS,
        )
        await base.write_session_draft(
            session_id=session_id,
            agent_name=demo_analyst.AGENT_NAME,
            draft_data=agent_result.draft.model_dump(),
        )
        # Session moves to "scored" now that transcript + draft both exist.
        await asyncio.to_thread(_update_session_status_sync, session_id, "scored")

        analysis_completed_at = datetime.now(timezone.utc)
        analysis_duration_ms = int((analysis_completed_at - analysis_started_at).total_seconds() * 1000)
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
        # str(exc) is frequently empty for Groq parse errors / bare Exceptions —
        # capture type name + repr so task_queue.error_message has real diagnostic.
        error_detail = f"Analyst failed: {type(exc).__name__}: {exc!r}"
        await base.record_task_failed(analysis_task_id, error_detail)
        # Flip status to 'failed' so the UI surfaces its Retry button. The
        # frontend Retry handler detects the existing transcript and calls
        # /analyze (not /process-recording), so this recovery path does NOT
        # re-download the recording or burn Whisper quota.
        await asyncio.to_thread(_update_session_status_sync, session_id, "failed")


@router.post(
    "/{session_id}/process-recording",
    response_model=SessionProcessRecordingResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Validate and enqueue recording ingest + analysis for a session",
)
async def process_session_recording(
    session_id: int,
    background_tasks: BackgroundTasks,
    user: AuthUser = Depends(require_auth),
) -> SessionProcessRecordingResponse:
    # 1. Fetch session
    session = await base.fetch_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    # 1a. Authorise — analyst/manager only
    if user.role not in ("analyst", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only analysts and managers may trigger session processing",
        )

    # 2. Validate recording URL
    if not session.recording_link or not session.recording_link.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session has no recording link.",
        )
    if not ingest.extract_file_id(session.recording_link):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recording link is not a recognized Google Drive sharing link.",
        )

    # 3. Idempotency checks
    existing_task = await base.fetch_running_session_task(session_id, ingest.AGENT_NAME)
    if existing_task is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Recording processing already in progress (task_id={existing_task}).",
        )
    existing_draft = await base.fetch_pending_session_draft(session_id)
    if existing_draft is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A pending draft already exists for session {session_id}.",
        )

    # 4. Mark session as processing so UI flips immediately
    await asyncio.to_thread(_update_session_status_sync, session_id, "processing")

    # 5. Enqueue the ingest + analyst chain into FastAPI's background tasks.
    #    FastAPI runs these after the response is sent, on the same event loop.
    #    The Drive semaphore in ingest.py serializes concurrent jobs at the
    #    Drive bottleneck; Whisper + demo_analyst can run concurrently.
    background_tasks.add_task(_run_ingest_chain, session_id, session.recording_link)

    # 6. Return 202 immediately
    return SessionProcessRecordingResponse(session_id=session_id, status="queued")


@router.post(
    "/{session_id}/analyze",
    response_model=SessionAnalysisResponse,
    summary="Run the Demo Analyst agent against a session's transcript",
)
async def analyze_session(
    session_id: int,
    user: AuthUser = Depends(require_auth),
) -> SessionAnalysisResponse:
    # 1. Fetch session
    session = await base.fetch_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    # 1a. Authorise
    if user.role not in ("analyst", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only analysts and managers may trigger session analysis",
        )

    # 2. Validate transcript exists
    transcript = await asyncio.to_thread(_fetch_session_transcript_sync, session_id)
    if not transcript or not transcript.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No transcript available for this session",
        )

    # 3. Idempotency
    existing_task = await base.fetch_running_session_task(session_id, demo_analyst.AGENT_NAME)
    if existing_task is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Analysis already in progress (task_id={existing_task}).",
        )
    existing_draft = await base.fetch_pending_session_draft(session_id)
    if existing_draft is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A pending draft already exists for session {session_id}.",
        )

    # 4. Record task start
    started_at = datetime.now(timezone.utc)
    task_id = await base.record_session_task_start(session_id, demo_analyst.AGENT_NAME)

    # 5. Run agent
    try:
        result = await asyncio.wait_for(
            demo_analyst.run(session_id, transcript),
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
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Analysis failed: {exc}")

    # 6. Persist draft
    try:
        draft_row = await base.write_session_draft(
            session_id=session_id,
            agent_name=demo_analyst.AGENT_NAME,
            draft_data=result.draft.model_dump(),
        )
    except Exception as exc:  # noqa: BLE001
        await base.record_task_failed(task_id, f"Draft write failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to save draft: {exc}")

    # 7. Update session status to scored
    await asyncio.to_thread(_update_session_status_sync, session_id, "scored")

    # 8. Record task completion
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

    return SessionAnalysisResponse(
        id=str(draft_row["id"]),
        session_id=session_id,
        agent_name=demo_analyst.AGENT_NAME,
        status=draft_row["status"],
        draft_data=result.draft,
        created_at=draft_row["created_at"],
    )


@router.post(
    "/auto-retry-failed",
    response_model=AutoRetryResponse,
    summary="Manually trigger one tick of the auto-retry scheduler",
)
async def auto_retry_failed_endpoint(
    user: AuthUser = Depends(require_auth),
) -> AutoRetryResponse:
    """On-demand equivalent of the scheduled tick.

    Same code path as the APScheduler job in app/scheduler.py — this just
    lets an analyst or manager fire a scan immediately after a big CSV
    upload instead of waiting up to AUTO_RETRY_INTERVAL_MINUTES.

    Returns the summary of what the tick did. Retries are dispatched as
    fire-and-forget asyncio tasks; actual session state updates arrive
    via the existing sessions + session_drafts realtime subscriptions.
    """
    if user.role not in ("analyst", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only analysts and managers may trigger auto-retry",
        )
    summary = await auto_retry_failed_sessions()
    return AutoRetryResponse(**summary)
