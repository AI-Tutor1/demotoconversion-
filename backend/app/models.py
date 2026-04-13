from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PourIssue(BaseModel):
    category: str
    description: str


class ScoreEvidence(BaseModel):
    """A single QA-scorecard question result: the numeric score + the transcript
    evidence that grounds it. Every score must cite observable evidence; if not
    observed, score at the lowest level, not a middle estimate."""

    score: int
    evidence: str


class DraftOutput(BaseModel):
    """Enhanced QA Scorecard output from the Demo Analyst agent.

    Replaces the old freeform methodology/topic/... shape. Stored as-is in
    demo_drafts.draft_data (JSONB) so analytics can aggregate over any subset.
    """

    q1_teaching_methodology: ScoreEvidence
    q2_curriculum_alignment: ScoreEvidence
    q3_student_interactivity: ScoreEvidence
    q4_differentiated_teaching: ScoreEvidence
    q5_psychological_safety: ScoreEvidence
    q6_rapport_session_opening: ScoreEvidence
    q7_technical_quality: ScoreEvidence
    q8_formative_assessment: ScoreEvidence
    # Sum of Q1..Q8. Per-question scales are 5+5+3+5+5+1+5+3 = 32.
    # Interpretation bands in the prompt: 28-32 Excellent, 22-27 Good,
    # 15-21 Below, 0-14 Concerns.
    total_score: int = Field(..., ge=0, le=32)
    score_interpretation: str
    pour_issues: list[PourIssue]
    overall_summary: str
    improvement_suggestions: str
    improvement_focus: str


class DemoRow(BaseModel):
    """Minimal shape of a demos row the agents need. DB has more columns."""

    id: int
    student: str
    teacher: str
    level: str
    subject: str
    transcript: Optional[str] = None
    recording: Optional[str] = None


class AnalysisResponse(BaseModel):
    """Response body from POST /api/v1/demos/{id}/analyze.

    Shape matches the frontend `DemoDraft` type exactly (field named `id`,
    not `draft_id`) so `fetch()` callers can cast the response directly.
    """

    id: str
    demo_id: int
    agent_name: str
    status: str
    draft_data: DraftOutput
    created_at: datetime


# ─── Ingest agent ─────────────────────────────────────────────

class IngestResult(BaseModel):
    """Internal return from the ingest agent's `run()` — not serialized to HTTP."""

    transcript: str
    duration_seconds: int
    audio_size_bytes: int
    whisper_language: str
    whisper_duration: float  # seconds of processing time on OpenAI's side


class ProcessRecordingResponse(BaseModel):
    """Response from POST /api/v1/demos/{id}/process-recording."""

    demo_id: int
    transcript_length: int
    duration_seconds: int
    analysis_draft_id: Optional[str] = None
    # "transcribed_and_analyzed" — happy path
    # "transcription_only"       — transcript saved but auto-chained analysis failed
    status: str
