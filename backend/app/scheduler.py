"""Auto-retry of failed sessions.

Background scheduler (APScheduler AsyncIOScheduler) that fires every N minutes
and retries sessions stuck at `processing_status = 'failed'` if their most
recent failure is classifiable as transient. Reuses the same ingest /
demo_analyst pipeline that /process-recording and /analyze use, via fire-and-
forget asyncio tasks that serialize through the existing Drive + Whisper
semaphores in agents/ingest.py.

Design choices (see memory/project_auto_retry_system.md for the long form):

  * Error classification is string-match on task_queue.error_message:
      - ASPH / rate_limit_exceeded          → transient, 60-min backoff
      - TimeoutError / httpx / Server disc. → transient, 5-min backoff
      - JSON parse / OpenAIError            → transient, 5-min backoff
      - "Auto-chained analysis failed"      → transient, 5-min backoff (empty
        str(exc) from Groq — still worth retrying; post-07da3dc deploys also
        have real exception text so classifier improves over time)
      - Invalid input / not a recognized Google Drive / Transcript too short
                                            → permanent, never retried
  * Max attempts per session: counts the number of failed task_queue rows for
    the session across ingest + demo_analyst. Once >= AUTO_RETRY_MAX_ATTEMPTS,
    the session is skipped forever (analyst handles manually).
  * Idempotency: job holds a single module-level asyncio.Lock so overlapping
    ticks don't double-fire. Per-session idempotency reuses
    base.fetch_running_session_task() — if a task is already running (manual
    retry click or a previous tick still in flight), skip.
  * Kill switch: AUTO_RETRY_ENABLED=false at env level disables the tick.
    The scheduler still registers so /health stays symmetrical, but the job
    no-ops.

Runtime: single asyncio loop inside the FastAPI uvicorn process. If pm2
restarts the backend, APScheduler restarts with it; any in-flight retry's
asyncio task is cancelled but the session's processing_status is set via
the existing ingest/analyst error handlers, so state stays consistent. The
next tick after restart picks up anything that reverted to `failed`.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from agents import base, demo_analyst, ingest
from app.config import settings
from app.supabase_client import get_supabase

log = logging.getLogger(__name__)

# Single scheduler instance (created at import, started by lifespan).
scheduler = AsyncIOScheduler(timezone="UTC")

# Prevents overlapping ticks — a slow tick (e.g. many retries queued) must not
# start a second one before the first drains.
_tick_lock = asyncio.Lock()

Classification = Literal[
    "transient_rate_limit",
    "transient_generic",
    "permanent",
    "unknown",
]


def classify_error(error_message: str | None) -> Classification:
    """Map a task_queue.error_message string to a retry decision.

    Conservative defaults: unknown → treated as transient_generic so we don't
    silently give up on novel error patterns. The max-attempts cap provides
    the backstop.
    """
    if not error_message:
        return "transient_generic"
    msg = error_message.lower()

    # Permanent — pointless to retry, classify them explicitly.
    if "invalid input" in msg:
        return "permanent"
    if "not a recognized google drive" in msg:
        return "permanent"
    if "transcript too short" in msg:
        return "permanent"
    if "no recording link" in msg:
        return "permanent"

    # Transient — rate limit specifically, for longer backoff.
    if "asph" in msg or "rate_limit_exceeded" in msg or "rate-limited" in msg:
        return "transient_rate_limit"

    # Transient — everything else worth retrying.
    if any(needle in msg for needle in (
        "timeout", "timed out", "httpx", "server disconnected",
        "json parse", "openaierror", "groq api error", "analyst failed",
        "auto-chained analysis failed", "unexpected",
    )):
        return "transient_generic"

    # Novel error — retry as generic, the max-attempts cap will stop us.
    return "unknown"


def _backoff_for(classification: Classification) -> timedelta:
    if classification == "transient_rate_limit":
        return timedelta(minutes=settings.auto_retry_rate_limit_backoff_minutes)
    return timedelta(minutes=settings.auto_retry_generic_backoff_minutes)


async def _run_analyze_only(session_id: int, transcript: str) -> None:
    """Fire-and-forget analyst rerun against an existing transcript.

    Mirrors the /analyze HTTP handler's core work but without HTTP response,
    auth, or HTTPException raises — designed to be spawned via
    asyncio.create_task() from the scheduler. Always writes a task_queue
    row so operators can audit the attempt.
    """
    task_id = await base.record_session_task_start(session_id, demo_analyst.AGENT_NAME)
    started = datetime.now(timezone.utc)
    try:
        result = await asyncio.wait_for(
            demo_analyst.run(session_id, transcript),
            timeout=60.0,
        )
        await base.write_session_draft(
            session_id=session_id,
            agent_name=demo_analyst.AGENT_NAME,
            draft_data=result.draft.model_dump(),
        )
        _set_session_status(session_id, "scored")
        duration_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        try:
            await base.record_task_complete(
                task_id=task_id,
                duration_ms=duration_ms,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
            )
        except Exception:  # noqa: BLE001
            pass
    except Exception as exc:  # noqa: BLE001
        error_detail = f"Auto-retry analyst failed: {type(exc).__name__}: {exc!r}"
        await base.record_task_failed(task_id, error_detail)
        _set_session_status(session_id, "failed")


def _set_session_status(session_id: int, status: str) -> None:
    """Sync status flip (called from async via to_thread when needed)."""
    sb = get_supabase()
    sb.table("sessions").update({"processing_status": status}).eq("id", session_id).execute()


def _fetch_retry_candidates() -> list[dict]:
    """Return sessions eligible for consideration (failed in last 24hr).

    Eligibility is a simple window so we don't sweep the whole table every
    tick. Per-session retry cap + backoff are applied in the caller.
    """
    sb = get_supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    res = (
        sb.table("sessions")
        .select("id, session_id, recording_link, transcript, updated_at")
        .eq("processing_status", "failed")
        .gte("updated_at", cutoff)
        .order("updated_at", desc=True)
        .limit(100)
        .execute()
    )
    return list(res.data or [])


def _fetch_session_failure_count(session_id: int) -> int:
    """Count failed task_queue rows for a session across all agents."""
    sb = get_supabase()
    res = (
        sb.table("task_queue")
        .select("id", count="exact")
        .eq("session_id", session_id)
        .eq("status", "failed")
        .execute()
    )
    return res.count or 0


def _fetch_latest_failure(session_id: int) -> dict | None:
    """Most recent failed task_queue row for a session."""
    sb = get_supabase()
    res = (
        sb.table("task_queue")
        .select("agent_name, status, error_message, completed_at")
        .eq("session_id", session_id)
        .eq("status", "failed")
        .order("completed_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    return res.data[0]


async def auto_retry_failed_sessions() -> dict[str, int]:
    """Single tick. Returns a summary of what it did, for the admin endpoint.

    Scheduled via APScheduler AND callable directly from POST /auto-retry-failed.
    Holds the module-level lock so only one tick runs at a time.
    """
    if not settings.auto_retry_enabled:
        log.info("auto_retry: disabled via AUTO_RETRY_ENABLED=false")
        return {"disabled": 1, "considered": 0, "retried": 0, "skipped": 0}

    if _tick_lock.locked():
        log.info("auto_retry: previous tick still running, skipping")
        return {"already_running": 1, "considered": 0, "retried": 0, "skipped": 0}

    async with _tick_lock:
        candidates = await asyncio.to_thread(_fetch_retry_candidates)
        retried = 0
        skipped = 0
        now = datetime.now(timezone.utc)
        max_attempts = settings.auto_retry_max_attempts

        for sess in candidates:
            session_id = sess["id"]

            # Skip if we're at the max-attempts cap
            failure_count = await asyncio.to_thread(
                _fetch_session_failure_count, session_id
            )
            if failure_count >= max_attempts:
                skipped += 1
                continue

            # Skip if another task is already running for this session
            ingest_running = await base.fetch_running_session_task(
                session_id, ingest.AGENT_NAME
            )
            analyst_running = await base.fetch_running_session_task(
                session_id, demo_analyst.AGENT_NAME
            )
            if ingest_running or analyst_running:
                skipped += 1
                continue

            latest = await asyncio.to_thread(_fetch_latest_failure, session_id)
            classification = classify_error(
                latest.get("error_message") if latest else None
            )
            if classification == "permanent":
                skipped += 1
                continue

            # Honour backoff window
            if latest and latest.get("completed_at"):
                last_fail = datetime.fromisoformat(
                    str(latest["completed_at"]).replace("Z", "+00:00")
                )
                if (now - last_fail) < _backoff_for(classification):
                    skipped += 1
                    continue

            # Dispatch: analyst-only if transcript already saved, else full ingest
            transcript = sess.get("transcript") or ""
            recording_link = sess.get("recording_link") or ""
            if transcript.strip():
                log.info(
                    "auto_retry: session %s (lms %s) → /analyze (attempt %s)",
                    session_id, sess.get("session_id"), failure_count + 1,
                )
                # Import here to avoid a circular import at module load
                asyncio.create_task(_run_analyze_only(session_id, transcript))
            elif recording_link.strip():
                log.info(
                    "auto_retry: session %s (lms %s) → /process-recording (attempt %s)",
                    session_id, sess.get("session_id"), failure_count + 1,
                )
                from app.routers.sessions import _run_ingest_chain
                asyncio.create_task(_run_ingest_chain(session_id, recording_link))
            else:
                # No transcript, no recording link — genuinely can't retry.
                skipped += 1
                continue

            retried += 1

        log.info(
            "auto_retry: tick complete — considered=%s retried=%s skipped=%s",
            len(candidates), retried, skipped,
        )
        return {
            "considered": len(candidates),
            "retried": retried,
            "skipped": skipped,
        }


def start_scheduler() -> None:
    """Register the recurring job and start the scheduler.

    Idempotent — if already running, does nothing.
    """
    if scheduler.running:
        return
    scheduler.add_job(
        auto_retry_failed_sessions,
        trigger="interval",
        minutes=settings.auto_retry_interval_minutes,
        id="auto_retry_failed_sessions",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    log.info(
        "auto_retry: scheduler started, interval=%s min, enabled=%s, max_attempts=%s",
        settings.auto_retry_interval_minutes,
        settings.auto_retry_enabled,
        settings.auto_retry_max_attempts,
    )


def shutdown_scheduler() -> None:
    """Gracefully stop the scheduler (called from FastAPI lifespan on shutdown)."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        log.info("auto_retry: scheduler stopped")
