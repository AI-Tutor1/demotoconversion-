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
from typing import Any, Optional

from app.models import DemoRow
from app.supabase_client import get_supabase


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
