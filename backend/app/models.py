from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PourIssue(BaseModel):
    category: str
    description: str


class DraftOutput(BaseModel):
    """Exact shape the Demo Analyst agent produces (and what lands in demo_drafts.draft_data)."""

    pour_issues: list[PourIssue]
    methodology: str
    topic: str
    resources: str
    engagement: str
    effectiveness: str
    suggested_rating: int = Field(..., ge=1, le=5)
    suggestions: str
    improvement_focus: str


class DemoRow(BaseModel):
    """Minimal shape of a demos row the agent needs. DB has more columns; we read just what's relevant."""

    id: int
    student: str
    teacher: str
    level: str
    subject: str
    transcript: Optional[str] = None


class AnalysisResponse(BaseModel):
    """Response body from POST /api/v1/demos/{id}/analyze.

    Shape matches the frontend `DemoDraft` type exactly (field named `id`,
    not `draft_id`) so `fetch()` callers can cast the response directly.
    Same shape as `supabase.from('demo_drafts').select('*')` rows.
    """

    id: str
    demo_id: int
    agent_name: str
    status: str
    draft_data: DraftOutput
    created_at: datetime
