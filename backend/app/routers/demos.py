"""Demo Analyst HTTP surface.

POST /api/v1/demos/{id}/analyze — fetch the demo, run the Demo Analyst agent
against its transcript, persist the draft to demo_drafts, track the run in
task_queue, and return the draft.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from openai import OpenAIError

from agents import base, demo_analyst
from app.auth import AuthUser, require_auth
from app.models import AnalysisResponse

router = APIRouter()

# Upper bound on a single Demo Analyst call (LLM + retry + parse).
# Typical run is 1-3s against Groq Llama 3.3 70B; 60s gives headroom for
# network/rate-limit backoff / long transcripts without leaving a request hanging.
AGENT_TIMEOUT_SECONDS = 60.0


@router.post(
    "/{demo_id}/analyze",
    response_model=AnalysisResponse,
    summary="Run the Demo Analyst agent against a demo's transcript",
)
async def analyze(
    demo_id: int,
    user: AuthUser = Depends(require_auth),
) -> AnalysisResponse:
    # 1. Fetch demo — 404 if missing
    demo = await base.fetch_demo(demo_id)
    if demo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Demo {demo_id} not found",
        )

    # 1a. Authorise — analyst/manager/sales_agent allowed.
    # Sales agents own their demos (RLS-scoped); the role gate rejects
    # any other unanticipated role at the application layer.
    if user.role not in ("analyst", "manager", "sales_agent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only analysts, managers, and sales agents may trigger demo analysis",
        )

    # 2. Reject if transcript is missing/empty — 400, and do NOT start a task row
    if not demo.transcript or not demo.transcript.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No transcript available for this demo",
        )

    # 3. Idempotency: if a task is already running/queued, return 409.
    existing_task_id = await base.fetch_running_task(demo_id, demo_analyst.AGENT_NAME)
    if existing_task_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Analysis already in progress (task_id={existing_task_id}). Wait for it to complete before retrying.",
        )

    # 3a. Also block if a pending_review draft already exists for this demo.
    existing_draft = await base.fetch_pending_draft(demo_id)
    if existing_draft is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A pending draft already exists for demo {demo_id} (draft_id={existing_draft}). Approve or reject it first.",
        )

    # 4. Record task start (from here on, every failure path updates this row)
    started_at = datetime.now(timezone.utc)
    task_id = await base.record_task_start(demo_id, demo_analyst.AGENT_NAME)

    # 4. Run agent — wrap in timeout; catch every recoverable error and mark the task
    try:
        result = await asyncio.wait_for(
            demo_analyst.run(demo_id, demo.transcript),
            timeout=AGENT_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        await base.record_task_failed(
            task_id, f"Agent timed out after {AGENT_TIMEOUT_SECONDS}s"
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Demo Analyst agent timed out after {AGENT_TIMEOUT_SECONDS}s",
        )
    except ValueError as exc:
        # Raised by demo_analyst.run when JSON is unparseable after one retry
        await base.record_task_failed(task_id, f"Agent JSON parse failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Demo Analyst returned invalid output: {exc}",
        )
    except OpenAIError as exc:
        # API-side failures: auth, rate limit, Groq 5xx (openai SDK is used against Groq's OpenAI-compatible endpoint)
        await base.record_task_failed(task_id, f"Groq API error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Upstream LLM API error: {exc}",
        )
    except Exception as exc:  # noqa: BLE001 — truly unexpected paths must still update the task row
        await base.record_task_failed(task_id, f"Unexpected error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent run failed: {exc}",
        )

    # 5. Persist draft — if this fails, the task is marked failed and the run is lost
    try:
        draft_row = await base.write_draft(
            demo_id=demo_id,
            agent_name=demo_analyst.AGENT_NAME,
            draft_data=result.draft.model_dump(),
        )
    except Exception as exc:  # noqa: BLE001
        await base.record_task_failed(task_id, f"Supabase draft write failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save draft: {exc}",
        )

    # 6. Record task completion — best effort; draft is already saved
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
        # Draft is written; cost-tracking row update failure is not fatal.
        pass

    # 7. Shape the response from the inserted draft row + the agent's output.
    # Field `id` (not `draft_id`) so the response matches the frontend DemoDraft type.
    return AnalysisResponse(
        id=str(draft_row["id"]),
        demo_id=demo_id,
        agent_name=demo_analyst.AGENT_NAME,
        status=draft_row["status"],
        draft_data=result.draft,
        created_at=draft_row["created_at"],
    )
