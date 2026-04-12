"""Shared helpers for all AI agents — Supabase reads/writes that bypass RLS via the service_role key."""

from datetime import datetime, timezone
from typing import Any, Optional

from app.models import DemoRow
from app.supabase_client import get_supabase


def fetch_demo(demo_id: int) -> Optional[DemoRow]:
    """Fetch a single demo row. Returns None if not found."""
    sb = get_supabase()
    res = (
        sb.table("demos")
        .select("id, student, teacher, level, subject, transcript")
        .eq("id", demo_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        return None
    return DemoRow(**res.data)


def write_draft(demo_id: int, agent_name: str, draft_data: dict[str, Any]) -> str:
    """Insert a row into demo_drafts and return the new row's id."""
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
    return res.data[0]["id"]


def record_task_start(demo_id: int, agent_name: str) -> str:
    """Insert a running task_queue row and return its id."""
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


def record_task_complete(
    task_id: str,
    duration_ms: int,
    input_tokens: int,
    output_tokens: int,
) -> None:
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


def record_task_failed(task_id: str, error_message: str) -> None:
    sb = get_supabase()
    sb.table("task_queue").update(
        {
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "error_message": error_message,
        }
    ).eq("id", task_id).execute()
