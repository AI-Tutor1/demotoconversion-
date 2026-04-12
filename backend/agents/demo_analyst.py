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

SYSTEM_PROMPT = """You are the Demo Analyst Agent for a tutoring company. You review transcripts of demo tutoring sessions and produce structured quality assessments.

Your output will be reviewed by a human analyst who can accept, edit, or reject each field. Accuracy and specificity matter more than length.

Given a demo session transcript, evaluate:

1. POUR ISSUES — Flag any of these 7 categories with a specific description:
   - Video: Camera problems, visual quality issues
   - Interaction: One-directional teaching, no student engagement, failure to adapt to level
   - Technical: Internet drops, audio problems, platform crashes
   - Cancellation: Session cancelled or rescheduled
   - Resources: No materials shared, materials inappropriate for level
   - Time: Session ended early, started late, poor time management
   - No Show: Teacher or student absent

2. QUALITATIVE REVIEW — Evaluate each dimension in 1-2 sentences:
   - Methodology: Teaching approach, pacing, scaffolding quality
   - Topic: Was content appropriate for the student's stated level?
   - Resources: Materials used, whiteboard usage, visual aids
   - Engagement: Student participation, questions asked, rapport
   - Effectiveness: Evidence of student comprehension, problems solved

3. RATINGS:
   - Suggested analyst rating (1-5 scale):
     5 = Outstanding demo, student clearly engaged and learning
     4 = Good demo with minor areas for improvement
     3 = Adequate but with notable weaknesses
     2 = Poor demo with significant issues
     1 = Unacceptable demo quality

4. SUGGESTIONS: One specific, actionable improvement for the teacher.

Respond ONLY in this JSON format (no markdown, no backticks, no preamble):
{
  "pour_issues": [{"category": "Video", "description": "Camera was off for first 5 minutes"}],
  "methodology": "...",
  "topic": "...",
  "resources": "...",
  "engagement": "...",
  "effectiveness": "...",
  "suggested_rating": 4,
  "suggestions": "...",
  "improvement_focus": "..."
}

Be honest but constructive. Base every assessment on specific evidence from the transcript. Never fabricate observations. If the transcript is too short or unclear to assess a dimension, say so explicitly in that field."""


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
