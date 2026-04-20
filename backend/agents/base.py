"""Shared helpers for all AI agents — Supabase reads/writes that bypass RLS via the service_role key.

supabase-py v2 is synchronous. Calling it directly from an async FastAPI endpoint
would block the event loop for the duration of each DB round-trip. Every public
helper here is `async def` and pushes the blocking call to a thread pool via
`asyncio.to_thread(...)`, so concurrent requests continue to be served while a
Supabase call is in flight.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from app.models import DemoRow, SessionRow
from app.supabase_client import get_supabase

if TYPE_CHECKING:
    from app.models import DraftOutput


def _total_to_analyst_rating(total: int) -> int:
    """Mirror of totalToAnalystRating() in lib/scorecard.ts."""
    if total >= 28:
        return 5
    if total >= 22:
        return 4
    if total >= 15:
        return 3
    if total >= 8:
        return 2
    return 1


async def fetch_demo(demo_id: int) -> Optional[DemoRow]:
    """Fetch a single demo row. Returns None if not found."""

    def _fetch() -> Optional[DemoRow]:
        sb = get_supabase()
        res = (
            sb.table("demos")
            .select("id, student, teacher, level, subject, transcript, recording")
            .eq("id", demo_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        return DemoRow(**res.data[0])

    return await asyncio.to_thread(_fetch)


async def write_draft(
    demo_id: int, agent_name: str, draft_data: dict[str, Any]
) -> dict[str, Any]:
    """Insert a row into demo_drafts and return the full inserted row (id, status, created_at, ...)."""

    def _write() -> dict[str, Any]:
        sb = get_supabase()
        res = (
            sb.table("demo_drafts")
            .insert(
                {
                    "demo_id": demo_id,
                    "agent_name": agent_name,
                    "draft_data": draft_data,
                    "status": "pending_review",
                }
            )
            .execute()
        )
        if not res.data:
            raise RuntimeError("demo_drafts insert returned no data")
        return res.data[0]

    return await asyncio.to_thread(_write)


async def record_task_start(demo_id: int, agent_name: str) -> str:
    """Insert a running task_queue row and return its id."""

    def _insert() -> str:
        sb = get_supabase()
        res = (
            sb.table("task_queue")
            .insert(
                {
                    "demo_id": demo_id,
                    "agent_name": agent_name,
                    "status": "running",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        )
        return res.data[0]["id"]

    return await asyncio.to_thread(_insert)


async def record_task_complete(
    task_id: str,
    duration_ms: int,
    input_tokens: int,
    output_tokens: int,
) -> None:
    def _update() -> None:
        sb = get_supabase()
        sb.table("task_queue").update(
            {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "duration_ms": duration_ms,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            }
        ).eq("id", task_id).execute()

    await asyncio.to_thread(_update)


async def record_task_failed(task_id: str, error_message: str) -> None:
    def _update() -> None:
        sb = get_supabase()
        sb.table("task_queue").update(
            {
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": error_message[:500],  # task_queue.error_message is TEXT but cap for sanity
            }
        ).eq("id", task_id).execute()

    await asyncio.to_thread(_update)


async def fetch_pending_draft(demo_id: int) -> Optional[str]:
    """Return the id of any pending_review demo_drafts row for this demo, or None."""

    def _fetch() -> Optional[str]:
        sb = get_supabase()
        res = (
            sb.table("demo_drafts")
            .select("id")
            .eq("demo_id", demo_id)
            .eq("status", "pending_review")
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]["id"]
        return None

    return await asyncio.to_thread(_fetch)


async def auto_approve_draft(
    demo_id: int,
    draft_id: str,
    draft: "DraftOutput",
) -> None:
    """Write flat scorecard fields onto the demo row and mark the draft auto-approved.

    Mirrors what components/draft-review.tsx does when an analyst manually approves,
    but runs server-side so sales-submitted demos appear on the Sales page as soon
    as AI analysis completes — no analyst intervention required.

    Steps:
      1. Update flat demo columns (review, suggestions, improvement, analyst_rating,
         is_draft=False).
      2. Advance workflow_stage to 'pending_sales' only when currently 'new'
         (safe-guard: don't clobber a stage set manually while ingest was running).
      3. Atomic POUR swap: DELETE existing pour_issues then INSERT fresh ones.
      4. Mark the demo_drafts row as 'approved' with approval_rate=1.0.

    Failures here are non-fatal — the caller wraps this in a try/except and the
    draft remains in 'pending_review' for manual analyst fallback.
    """

    def _apply() -> None:
        sb = get_supabase()
        analyst_rating = _total_to_analyst_rating(draft.total_score)

        # 1. Flat scorecard fields + flip is_draft
        sb.table("demos").update(
            {
                "review": draft.overall_summary,
                "suggestions": draft.improvement_suggestions,
                "improvement": draft.improvement_focus,
                "analyst_rating": analyst_rating,
                "is_draft": False,
            }
        ).eq("id", demo_id).execute()

        # 2. Advance workflow_stage only if still at initial 'new' stage
        sb.table("demos").update(
            {"workflow_stage": "pending_sales"}
        ).eq("id", demo_id).eq("workflow_stage", "new").execute()

        # 3. Atomic POUR swap
        sb.table("pour_issues").delete().eq("demo_id", demo_id).execute()
        if draft.pour_issues:
            sb.table("pour_issues").insert(
                [
                    {
                        "demo_id": demo_id,
                        "category": p.category,
                        "description": p.description,
                    }
                    for p in draft.pour_issues
                ]
            ).execute()

        # 4. Mark draft approved
        sb.table("demo_drafts").update(
            {
                "status": "approved",
                "approval_rate": 1.0,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", draft_id).execute()

    await asyncio.to_thread(_apply)


async def fetch_running_task(demo_id: int, agent_name: str) -> Optional[str]:
    """Return the id of any running/queued task_queue row for this demo+agent, or None."""

    def _fetch() -> Optional[str]:
        sb = get_supabase()
        res = (
            sb.table("task_queue")
            .select("id")
            .eq("demo_id", demo_id)
            .eq("agent_name", agent_name)
            .in_("status", ["running", "queued"])
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]["id"]
        return None

    return await asyncio.to_thread(_fetch)


# ─── Product Review Workflow — Session helpers ───────────────


async def fetch_session(session_id: int) -> Optional[SessionRow]:
    """Fetch a single session row. Returns None if not found."""

    def _fetch() -> Optional[SessionRow]:
        sb = get_supabase()
        res = (
            sb.table("sessions")
            .select("id, tutor_name, subject, grade, recording_link, enrollment_name")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        return SessionRow(**res.data[0])

    return await asyncio.to_thread(_fetch)


async def write_session_draft(
    session_id: int, agent_name: str, draft_data: dict[str, Any]
) -> dict[str, Any]:
    """Insert a row into session_drafts and return the full inserted row."""

    def _write() -> dict[str, Any]:
        sb = get_supabase()
        res = (
            sb.table("session_drafts")
            .insert(
                {
                    "session_id": session_id,
                    "agent_name": agent_name,
                    "draft_data": draft_data,
                    "status": "pending_review",
                }
            )
            .execute()
        )
        if not res.data:
            raise RuntimeError("session_drafts insert returned no data")
        return res.data[0]

    return await asyncio.to_thread(_write)


async def fetch_pending_session_draft(session_id: int) -> Optional[str]:
    """Return the id of any pending_review session_drafts row, or None."""

    def _fetch() -> Optional[str]:
        sb = get_supabase()
        res = (
            sb.table("session_drafts")
            .select("id")
            .eq("session_id", session_id)
            .eq("status", "pending_review")
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]["id"]
        return None

    return await asyncio.to_thread(_fetch)


async def fetch_running_session_task(session_id: int, agent_name: str) -> Optional[str]:
    """Return the id of any running/queued task_queue row for this session+agent, or None."""

    def _fetch() -> Optional[str]:
        sb = get_supabase()
        res = (
            sb.table("task_queue")
            .select("id")
            .eq("session_id", session_id)
            .eq("agent_name", agent_name)
            .in_("status", ["running", "queued"])
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]["id"]
        return None

    return await asyncio.to_thread(_fetch)


async def record_session_task_start(session_id: int, agent_name: str) -> str:
    """Insert a running task_queue row for a session and return its id."""

    def _insert() -> str:
        sb = get_supabase()
        res = (
            sb.table("task_queue")
            .insert(
                {
                    "session_id": session_id,
                    "agent_name": agent_name,
                    "status": "running",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        )
        return res.data[0]["id"]

    return await asyncio.to_thread(_insert)


# ─── HR / Teacher Onboarding helpers ─────────────────────────


async def fetch_teacher_profile(profile_id: str) -> Optional[dict[str, Any]]:
    """Fetch a teacher_profiles row. Returns None if not found."""

    def _fetch() -> Optional[dict[str, Any]]:
        sb = get_supabase()
        res = (
            sb.table("teacher_profiles")
            .select(
                "id, first_name, last_name, status, interview_recording_link, teaching_matrix, phone_number"
            )
            .eq("id", profile_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        return res.data[0]

    return await asyncio.to_thread(_fetch)


async def record_hr_task_start(profile_id: str, agent_name: str) -> str:
    """Insert a running task_queue row for an HR interview and return its id."""

    def _insert() -> str:
        sb = get_supabase()
        res = (
            sb.table("task_queue")
            .insert(
                {
                    "teacher_profile_id": profile_id,
                    "agent_name": agent_name,
                    "status": "running",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        )
        return res.data[0]["id"]

    return await asyncio.to_thread(_insert)


async def fetch_running_hr_task(profile_id: str, agent_name: str) -> Optional[str]:
    """Return the id of any running/queued task_queue row for this profile+agent."""

    def _fetch() -> Optional[str]:
        sb = get_supabase()
        res = (
            sb.table("task_queue")
            .select("id")
            .eq("teacher_profile_id", profile_id)
            .eq("agent_name", agent_name)
            .in_("status", ["running", "queued"])
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]["id"]
        return None

    return await asyncio.to_thread(_fetch)


async def upsert_hr_interview_draft(
    profile_id: str,
    transcript: Optional[str] = None,
    draft_data: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Insert or update the hr_interview_drafts row for this profile.

    One draft per profile (enforced logically — the Scorecard tab re-opens
    the same row if it exists). Transcript is set once by the ingest stage;
    draft_data is populated by the analyst stage.
    """

    def _upsert() -> dict[str, Any]:
        sb = get_supabase()
        existing = (
            sb.table("hr_interview_drafts")
            .select("id, transcript, draft_data")
            .eq("teacher_profile_id", profile_id)
            .limit(1)
            .execute()
        )
        patch: dict[str, Any] = {}
        if transcript is not None:
            patch["transcript"] = transcript
        if draft_data is not None:
            patch["draft_data"] = draft_data
        if existing.data:
            row_id = existing.data[0]["id"]
            if patch:
                sb.table("hr_interview_drafts").update(patch).eq("id", row_id).execute()
            res = (
                sb.table("hr_interview_drafts")
                .select("*")
                .eq("id", row_id)
                .limit(1)
                .execute()
            )
            return res.data[0]
        insert_body = {
            "teacher_profile_id": profile_id,
            "transcript": transcript,
            "draft_data": draft_data or {},
            "status": "pending_review",
        }
        res = sb.table("hr_interview_drafts").insert(insert_body).execute()
        if not res.data:
            raise RuntimeError("hr_interview_drafts insert returned no data")
        return res.data[0]

    return await asyncio.to_thread(_upsert)


async def fetch_hr_interview_draft(profile_id: str) -> Optional[dict[str, Any]]:
    """Fetch the hr_interview_drafts row for a profile (or None)."""

    def _fetch() -> Optional[dict[str, Any]]:
        sb = get_supabase()
        res = (
            sb.table("hr_interview_drafts")
            .select("id, transcript, draft_data, status, created_at")
            .eq("teacher_profile_id", profile_id)
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]
        return None

    return await asyncio.to_thread(_fetch)


def _update_teacher_profile_status_sync(profile_id: str, status_value: str) -> None:
    sb = get_supabase()
    sb.table("teacher_profiles").update({"status": status_value}).eq(
        "id", profile_id
    ).execute()


async def update_teacher_profile_status(profile_id: str, status_value: str) -> None:
    await asyncio.to_thread(_update_teacher_profile_status_sync, profile_id, status_value)
