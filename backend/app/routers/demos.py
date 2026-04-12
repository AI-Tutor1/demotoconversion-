from fastapi import APIRouter, HTTPException, status

router = APIRouter()


@router.post(
    "/{demo_id}/analyze",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    summary="Run the Demo Analyst agent against a demo's transcript (stub)",
)
async def analyze(demo_id: int) -> dict:
    """Step 1 stub.

    In Step 2 this endpoint will:
      1. Fetch the demo from Supabase
      2. Reject if transcript is missing (HTTP 400)
      3. Invoke the Demo Analyst LangGraph agent
      4. Persist the draft to `demo_drafts` with status='pending_review'
      5. Record the task in `task_queue`
      6. Return AnalysisResponse with the draft_id

    For now, it returns 501 so Swagger + routing can be verified in isolation.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"Demo Analyst agent not yet wired. demo_id={demo_id}",
    )
