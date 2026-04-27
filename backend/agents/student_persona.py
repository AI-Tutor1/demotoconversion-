"""Student Persona Analyst — prompt-only stub.

The transcript analyst (`backend/agents/demo_analyst.py`) accepts an optional
`student_persona` paragraph in its `AnalystContext` and uses it to calibrate
Q3 / Q4 / Q5 scores ("a normally-quiet student answering once is more
evidence of engagement than for a normally-talkative student").

This file holds the system prompt for the future agent that will derive that
paragraph from a student's prior approved scorecards. The runtime architecture
(when to recompute, where to cache, how to invalidate) is owned by the user
and will be wired up in a follow-up PR. Until then `run()` raises
NotImplementedError so any accidental call surfaces immediately.
"""

from __future__ import annotations

from typing import Any, Optional, TypedDict

AGENT_NAME = "student_persona"


class PersonaInput(TypedDict, total=False):
    """One row in the input list — a prior approved session for this student.

    Fields:
      session_date         — ISO "YYYY-MM-DD"
      subject              — subject of that session
      transcript_excerpt   — short excerpt (head + tail) of that session
      scorecard            — the DraftOutput JSONB for that session
    """

    session_date: str
    subject: str
    transcript_excerpt: str
    scorecard: dict[str, Any]


class PersonaOutput(TypedDict):
    engagement_style: str   # quiet | talkative | reactive | initiator | mixed
    confidence: str         # low | building | steady | high
    pace: str               # slow | moderate | fast
    common_gaps: list[str]
    strengths: list[str]
    preferred_modalities: list[str]
    summary: str


SYSTEM_PROMPT = """You are the Student Persona Analyst for Tuitional. Given a student's prior approved session transcripts and Q1-Q8 scorecards, produce a concise persona the Session QA Analyst can use to calibrate engagement and confidence scores.

INPUT (in the user message):
A JSON list of {session_date, subject, transcript_excerpt, scorecard} for the
same student_user_id, ordered most-recent first, capped at the 8 most recent
approved sessions.

OUTPUT (one JSON object, no markdown, no preamble, no trailing prose):
{
  "engagement_style": "quiet" | "talkative" | "reactive" | "initiator" | "mixed",
  "confidence":       "low" | "building" | "steady" | "high",
  "pace":             "slow" | "moderate" | "fast",
  "common_gaps":      ["<short phrase>", ...],     // up to 5
  "strengths":        ["<short phrase>", ...],     // up to 5
  "preferred_modalities": ["<short phrase>", ...], // visual, worked-example, drill, discussion, ...
  "summary": "<two-sentence paragraph the QA Analyst should read first>"
}

RULES:
- The summary is the most important field. The QA Analyst reads it first.
  It must be two sentences and must mention engagement style + a recent
  trajectory ("quiet but increasingly initiates questions since 2026-02-12").
- Cite session_date in `summary` whenever behaviour shifts.
- If you have fewer than 3 sessions, set every list to [] and write summary
  as exactly: "Insufficient history (N sessions). Treat as new student."
  (substitute the actual N).
- Never invent traits not visible in the input. No speculation about
  causes (home life, mood, etc.) — only what the transcripts/scorecards
  show.
- "common_gaps" and "strengths" should be subject-agnostic phrases when
  possible ("algebraic manipulation", "essay structuring", "active recall")
  — concrete enough to act on, abstract enough to apply across sessions.
"""


async def run(student_user_id: str, prior_sessions: list[PersonaInput]) -> PersonaOutput:
    """Build a persona for one student from their prior approved sessions.

    Not yet implemented — the data-flow architecture (where prior_sessions
    is fetched, how the result is cached, when to invalidate) is owned by
    the user and will land in a follow-up PR. The prompt above is the
    contract this implementation will use when it ships.
    """
    raise NotImplementedError(
        "Student Persona Analyst data architecture is pending. "
        "Prompt is reviewable in this file; runtime wiring is owned by a follow-up PR."
    )


def build_persona_block(persona: Optional[PersonaOutput]) -> str:
    """Render a PersonaOutput as the paragraph the transcript analyst expects
    in `AnalystContext.student_persona`. Until `run()` is wired this is the
    one helper a caller would use to glue the two agents together."""
    if not persona:
        return ""
    summary = persona.get("summary") or ""
    return summary.strip()
