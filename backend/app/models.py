import logging
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

_log = logging.getLogger(__name__)

# The 7 categories allowed by the pour_issues.category CHECK constraint and by
# POUR_CATS on the frontend. Kept as a module-level constant so the coerce
# validator stays in sync — never add a value here without also adding it to
# both `POUR_CATS` in lib/types.ts and the SQL CHECK constraint.
_VALID_POUR_CATEGORIES: tuple[str, ...] = (
    "Video",
    "Interaction",
    "Technical",
    "Cancellation",
    "Resources",
    "Time",
    "No Show",
)
_VALID_POUR_LOWER = {c.lower(): c for c in _VALID_POUR_CATEGORIES}

# Keyword → canonical-category map. When the AI improvises a category outside
# the 7 (e.g. "Pacing", "Audio", "Engagement"), we try to rescue the entry by
# matching the raw text against these substrings before falling back to a drop.
_POUR_SYNONYMS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("audio", "sound", "mic", "microphone", "connection", "lag",
      "freeze", "frozen", "internet", "glitch", "crash", "platform"),  "Technical"),
    (("camera", "visual", "screen share", "screenshare"),              "Video"),
    (("engagement", "engaged", "participation", "one-way", "one way",
      "one-directional", "passive", "interactivity"),                  "Interaction"),
    (("worksheet", "material", "homework", "resource", "textbook"),    "Resources"),
    (("pacing", "late", "rushed", "ended early", "started late",
      "time management", "ran out of time", "overran"),                "Time"),
    (("absent", "no show", "no-show", "didn't show", "did not show"),  "No Show"),
    (("cancel", "reschedul"),                                          "Cancellation"),
)


def _resolve_pour_category(raw: str) -> str | None:
    """Return a canonical POUR category for `raw`, or None if unrecognized.

    1. Case-insensitive exact match against the 7 valid categories.
    2. Substring match against the synonym map.
    3. Otherwise None — caller should drop the entry and log the original.
    """
    if not raw:
        return None
    t = raw.strip()
    lower = t.lower()
    if lower in _VALID_POUR_LOWER:
        return _VALID_POUR_LOWER[lower]
    for keywords, target in _POUR_SYNONYMS:
        for kw in keywords:
            if kw in lower:
                return target
    return None


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

    @field_validator("pour_issues", mode="before")
    @classmethod
    def coerce_pour_issues(cls, v: Any) -> Any:
        """Normalize pour_issues into the 7-category taxonomy enforced by the
        DB CHECK constraint on pour_issues.category.

        Claude occasionally returns:
          - bare strings ("Audio drops at 02:30") instead of objects
          - objects with freeform categories ("Pacing", "Engagement", "Other")

        Both paths silently produced rows the DB rejected. We now:
          1. Parse colon-separated strings into {category, description}.
          2. Run every category through _resolve_pour_category (exact match +
             keyword synonym map).
          3. Drop the entry (with a warning) if nothing resolves — rather than
             promoting to "Other", which isn't in the CHECK allowlist.
        """
        if not isinstance(v, list):
            return v
        coerced: list[Any] = []
        for item in v:
            cat_raw: str | None = None
            desc = ""
            passthrough: Any = None

            if isinstance(item, str):
                if ":" in item:
                    cat_raw, desc = item.split(":", 1)
                    cat_raw, desc = cat_raw.strip(), desc.strip()
                else:
                    # No colon — try to pattern-match the whole string into a
                    # category; otherwise drop.
                    cat_raw, desc = item.strip(), item.strip()
            elif isinstance(item, dict):
                cat_raw = str(item.get("category", "")).strip()
                desc = str(item.get("description", "")).strip()
                # Preserve any extra keys the DraftOutput doesn't care about.
                passthrough = dict(item)
            else:
                # Something unexpected (None, list, etc.) — let Pydantic reject.
                coerced.append(item)
                continue

            canonical = _resolve_pour_category(cat_raw or "")
            if canonical is None:
                _log.warning(
                    "Dropping pour_issue with unrecognized category %r (desc=%r)",
                    cat_raw,
                    desc,
                )
                continue

            if passthrough is not None:
                passthrough["category"] = canonical
                passthrough["description"] = desc
                coerced.append(passthrough)
            else:
                coerced.append({"category": canonical, "description": desc})
        return coerced


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


# ─── Product Review Workflow — Sessions ──────────────────────

class SessionRow(BaseModel):
    """Minimal shape of a sessions row the agents need."""

    id: int
    tutor_name: str
    subject: str
    grade: str
    recording_link: Optional[str] = None
    enrollment_name: str = ""


class SessionAnalysisResponse(BaseModel):
    """Response body from POST /api/v1/sessions/{id}/analyze."""

    id: str
    session_id: int
    agent_name: str
    status: str
    draft_data: DraftOutput
    created_at: datetime


class SessionProcessRecordingResponse(BaseModel):
    """Response from POST /api/v1/sessions/{id}/process-recording.

    The endpoint enqueues the ingest + analyst chain into FastAPI
    BackgroundTasks and returns 202 immediately. The pipeline runs
    asynchronously; the frontend watches processing_status updates via
    the sessions table realtime subscription.
    """

    session_id: int
    status: str  # "queued"
