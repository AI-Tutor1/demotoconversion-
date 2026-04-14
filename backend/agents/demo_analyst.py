"""Demo Analyst agent — takes a demo transcript and produces a structured quality assessment.

Pure: does not touch Supabase. Caller fetches the demo, persists the draft to
demo_drafts, and records the task in task_queue.

Async throughout so it doesn't block the FastAPI event loop during the 5-15s
LLM call (corrects Phase-3 planning issue #1).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from pydantic import ValidationError

from app.config import settings
from app.models import DraftOutput

AGENT_NAME = "demo_analyst"
MODEL = "claude-sonnet-4-20250514"
TEMPERATURE = 0.3
MAX_TOKENS = 2000

# Strips ```json ... ``` or ``` ... ``` fences Claude occasionally emits despite instructions.
_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)

SYSTEM_PROMPT = """You are the Session QA Analyst for Tuitional, a tutoring company. You evaluate demo tutoring sessions by scoring a structured QA Scorecard based ONLY on evidence from the transcript.

CRITICAL RULES:
- Do NOT decide scores before reading the full transcript
- Every Q1-Q8 score must be grounded in what you actually observed
- If you did not observe something, score it at the LOWEST level, not a middle estimate
- The scorecard rewards evidence, not impressions
- Cite specific timestamps or quotes as evidence for each score

## QA SCORECARD — 8 Questions, Max 32 Points

### Q1 — Teaching Methodology (Likert 1-5)
What you're scoring: Variety of teaching methods + use of examples and analogies

1 = Monotone lecture, no examples, reads from notes/slides with zero adaptation
2 = Mostly lecture with one or two examples, minimal variety in approach
3 = Mix of explanation and examples, some attempt at analogies, basic scaffolding
4 = Good variety: explains, gives examples, uses analogies, checks understanding, scaffolds from simple to complex
5 = Exceptional: multiple teaching strategies (Socratic questioning, worked examples, visual aids, real-world connections, scaffolded progression), adapts method when student struggles

### Q2 — Curriculum Alignment (Likert 1-5)
What you're scoring: How precisely the session aligns with the student's specific syllabus and board

1 = Content is off-topic or wrong level entirely (teaching A-Level content to IGCSE student)
2 = Broadly correct subject but not aligned to specific syllabus requirements
3 = Content matches the subject and level, but no explicit reference to syllabus/board
4 = Content clearly aligned to the stated level, mentions syllabus expectations or exam format
5 = Precisely targeted: references specific syllabus points, past paper patterns, board-specific requirements, exam technique

### Q3 — Student Interactivity (Frequency 0-3)
What you're scoring: How actively and consistently the student participated during the session

0 = Student silent throughout, no participation, teacher monologue
1 = Student responds only when directly asked (yes/no answers, minimal engagement)
2 = Student participates regularly — answers questions, attempts problems, asks occasional questions
3 = Student is highly active — initiates questions, works through problems independently, discusses approaches, demonstrates understanding verbally

### Q4 — Differentiated Teaching (Likert 1-5)
What you're scoring: Whether and how effectively the teacher adapted to the student's needs in real time

1 = No adaptation — teacher follows a rigid script regardless of student responses
2 = Minimal adaptation — notices student confusion but continues without adjusting
3 = Some adaptation — slows down or repeats when student is confused, but doesn't change approach
4 = Good adaptation — changes explanation style, provides additional examples, adjusts difficulty based on student performance
5 = Excellent differentiation — proactively assesses level, adjusts in real time, provides scaffolding, varies difficulty, recognizes and builds on student's strengths

### Q5 — Psychological Safety (Likert 1-5)
What you're scoring: Warmth, encouragement, and emotional safety of the classroom environment

1 = Cold, dismissive, criticizes mistakes, creates anxiety
2 = Neutral/indifferent — no explicit negativity but no encouragement either
3 = Generally positive — says "good" occasionally, doesn't react negatively to mistakes
4 = Warm and encouraging — praises effort, normalizes mistakes ("that's a common error"), creates comfort asking questions
5 = Exceptional environment — enthusiastic praise, celebrates attempts, explicitly encourages questions, makes student feel safe to be wrong, builds confidence

### Q6 — Rapport & Session Opening (Binary 0 or 1)
What you're scoring: Whether the teacher opened with a check-in and set a session agenda

0 = Jumped straight into content with no greeting, no check-in, no agenda
1 = Opened with a personal check-in (how are you, how was school, any questions from last time) AND set an agenda or stated what the session will cover

### Q7 — Technical Quality (Likert 1-5)
What you're scoring: Audio, video, platform stability, and absence of technical disruptions

1 = Major technical issues throughout — audio cutting out, video frozen, platform crashes, session significantly impacted
2 = Multiple noticeable disruptions — internet drops, audio lag, screen share failures, some lesson time lost
3 = Minor technical issues — brief audio glitch, one reconnection, but session mostly unaffected
4 = Smooth with negligible issues — perhaps one brief interruption, quickly resolved
5 = Flawless technical delivery — clear audio, stable video, screen sharing works perfectly, no disruptions

Note: If the transcript alone doesn't reveal technical issues, score based on what IS observable (e.g., "can you hear me now?" suggests issues, seamless flow suggests no issues). If no evidence either way, score 3.

### Q8 — Formative Assessment (Frequency 0-3)
What you're scoring: How often the teacher checked for understanding and whether a session summary was given

0 = No checks for understanding at all, no summary, teacher never verified if student grasped the content
1 = One or two basic comprehension checks ("do you understand?") with no substantive verification
2 = Regular comprehension checks — asks student to solve problems, explain concepts back, or demonstrate understanding. OR gives a session summary at the end.
3 = Frequent and varied assessment — has student work through problems independently, asks "explain this back to me", checks understanding at multiple points, AND provides a session summary or sets homework to reinforce learning

## SCORING SUMMARY
Total Score = Q1 + Q2 + Q3 + Q4 + Q5 + Q6 + Q7 + Q8 (Max 32)

Score Interpretation:
- 28-32 → Excellent session. Teacher performing at platform standard.
- 22-27 → Good session. Minor areas for coaching noted.
- 15-21 → Below standard. Structured feedback required. Follow-up within 2 weeks.
- 0-14  → Significant concerns. Formal review conversation and improvement plan needed.

## POUR ISSUES
In addition to the scorecard, flag any of these 7 categories if observed:
- Video: Camera problems, visual quality issues
- Interaction: One-directional teaching, no student engagement
- Technical: Internet drops, audio problems, platform crashes
- Cancellation: Session cancelled or rescheduled
- Resources: No materials shared, inappropriate for level
- Time: Session ended early, started late, poor time management
- No Show: Teacher or student absent

The `category` field MUST be one of these exact strings: "Video",
"Interaction", "Technical", "Cancellation", "Resources", "Time", "No Show".
If an issue doesn't fit any category, omit it — do not invent new categories
(no "Other", "Misc", "Pacing", "Engagement", "Audio", etc.). Each entry must
be a JSON object: {"category": "<one of the seven>", "description": "<what
you observed>"} — never a bare string.

## OUTPUT FORMAT
Respond ONLY in this JSON format (no markdown, no backticks, no preamble):
{
  "q1_teaching_methodology": { "score": 4, "evidence": "Teacher used worked examples at [01:25], Socratic questioning at [00:57], and scaffolded from simple factoring to quadratic formula" },
  "q2_curriculum_alignment": { "score": 4, "evidence": "Content was IGCSE-level quadratic equations, matched stated level" },
  "q3_student_interactivity": { "score": 3, "evidence": "Student actively solved problems at [00:55], [01:35], [02:30], asked clarifying question at [01:08]" },
  "q4_differentiated_teaching": { "score": 4, "evidence": "Progressed from simple (x²+5x+6) to harder (2x²+3x-5) based on student success" },
  "q5_psychological_safety": { "score": 5, "evidence": "Praised attempts: 'Excellent!' [00:57], 'Brilliant!' [02:50], 'You picked this up really quickly' [02:58]" },
  "q6_rapport_session_opening": { "score": 1, "evidence": "Opened with greeting and asked what student already knows [00:10]" },
  "q7_technical_quality": { "score": 5, "evidence": "No technical disruptions observed, screen share worked at [00:35], clear audio throughout" },
  "q8_formative_assessment": { "score": 2, "evidence": "Had student verify solutions at [01:35], progressive problem difficulty, but no end-of-session summary" },
  "total_score": 28,
  "score_interpretation": "Excellent session. Teacher performing at platform standard.",
  "pour_issues": [],
  "overall_summary": "Strong demo session. Teacher demonstrated excellent scaffolding...",
  "improvement_suggestions": "Consider adding a brief 2-minute summary at the end...",
  "improvement_focus": "Session closure and formative assessment"
}

Every score MUST include a specific evidence field citing timestamps or direct observations. Do not score based on assumptions."""


@dataclass
class AgentResult:
    """Return value of `run()`. Includes token aggregation across any retry (corrects planning issue #3)."""

    draft: DraftOutput
    input_tokens: int
    output_tokens: int
    retried: bool


class _AgentState(TypedDict):
    transcript: str
    result: AgentResult | None


# ─── helpers ──────────────────────────────────────────────────


def _strip_code_fences(text: str) -> str:
    return _FENCE_RE.sub("", text).strip()


def _parse_draft(text: str) -> DraftOutput:
    """Parse JSON (possibly fenced) into a validated DraftOutput. Raises on any failure."""
    cleaned = _strip_code_fences(text)
    data = json.loads(cleaned)  # raises json.JSONDecodeError
    return DraftOutput.model_validate(data)  # raises pydantic.ValidationError


def _tokens(response) -> tuple[int, int]:
    """Extract (input, output) from a LangChain AIMessage-style response. Missing counts → 0."""
    usage = getattr(response, "usage_metadata", None) or {}
    return (
        int(usage.get("input_tokens", 0) or 0),
        int(usage.get("output_tokens", 0) or 0),
    )


def _message_text(response) -> str:
    """Normalize response.content to a plain string (langchain returns str | list[dict])."""
    content = getattr(response, "content", "")
    return content if isinstance(content, str) else str(content)


def _make_llm() -> ChatAnthropic:
    return ChatAnthropic(
        model=MODEL,
        temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        api_key=settings.anthropic_api_key,
    )


# ─── LangGraph node ───────────────────────────────────────────


async def _analyze_node(state: _AgentState) -> _AgentState:
    llm = _make_llm()
    transcript = state["transcript"]

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Transcript:\n\n{transcript}"),
    ]

    # First attempt
    first = await llm.ainvoke(messages)
    first_in, first_out = _tokens(first)
    first_text = _message_text(first)

    try:
        draft = _parse_draft(first_text)
        return {
            "transcript": transcript,
            "result": AgentResult(
                draft=draft,
                input_tokens=first_in,
                output_tokens=first_out,
                retried=False,
            ),
        }
    except (json.JSONDecodeError, ValidationError):
        pass  # fall through to retry

    # Retry with FULL conversation history (corrects planning issue #2).
    # Without the original system prompt + transcript + Claude's broken attempt
    # in the message chain, Claude has no context to produce the correct JSON.
    retry_messages = [
        *messages,
        AIMessage(content=first_text),
        HumanMessage(
            content=(
                "Your previous response was not valid JSON. "
                "Return ONLY the JSON object with no markdown, no backticks, no preamble."
            )
        ),
    ]
    retry = await llm.ainvoke(retry_messages)
    retry_in, retry_out = _tokens(retry)
    retry_text = _message_text(retry)

    # Aggregate tokens across both calls (corrects planning issue #3).
    total_in = first_in + retry_in
    total_out = first_out + retry_out

    try:
        draft = _parse_draft(retry_text)
    except (json.JSONDecodeError, ValidationError) as e:
        raise ValueError(
            f"Demo Analyst returned unparseable JSON after one retry: {e}"
        )

    return {
        "transcript": transcript,
        "result": AgentResult(
            draft=draft,
            input_tokens=total_in,
            output_tokens=total_out,
            retried=True,
        ),
    }


# ─── Graph assembly ───────────────────────────────────────────


def _build_graph():
    builder = StateGraph(_AgentState)
    builder.add_node("analyze", _analyze_node)
    builder.add_edge(START, "analyze")
    builder.add_edge("analyze", END)
    return builder.compile()


_GRAPH = _build_graph()


# ─── Public API ───────────────────────────────────────────────


async def run(demo_id: int, transcript: str) -> AgentResult:
    """Invoke the Demo Analyst on a transcript.

    Pure — does not touch Supabase. Caller orchestrates DB reads/writes.

    Args:
        demo_id: ID of the demo being analyzed (used for trace/log context only — not fetched)
        transcript: full transcript text

    Returns:
        AgentResult with validated DraftOutput + aggregate token counts across
        initial call + retry (if any).

    Raises:
        ValueError: if Claude returns unparseable JSON after one retry
        anthropic errors: propagate if the API call itself fails
    """
    del demo_id  # reserved for future logging / tracing; not needed by the graph
    final_state = await _GRAPH.ainvoke(
        {"transcript": transcript, "result": None}
    )
    result = final_state["result"]
    if result is None:
        raise RuntimeError("Demo Analyst graph completed without producing a result")
    return result
