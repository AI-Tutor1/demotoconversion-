"""Session QA Analyst agent — produces a structured Q1–Q8 scorecard, POUR
issues, teacher knowledge audit, and improvement actions for one session.

Pure: does not touch Supabase. The caller (router) builds an AnalystContext
from the demo / session / hr_interview row, pre-computes idle gaps + repeat
hits via `app.transcript_signals`, and passes everything to `run()`.

Async throughout so it doesn't block the FastAPI event loop during the 5–15s
LLM call. Serialised process-wide via `_ANALYST_SEMAPHORE` so concurrent
scorecards don't combine to exceed Groq's 12k TPM cap on Llama 3.3 70B.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Literal, Optional, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from openai import RateLimitError
from pydantic import ValidationError

from app.config import settings
from app.models import DraftOutput
from app.transcript_signals import compute_signals, format_signals_block

AGENT_NAME = "demo_analyst"
# Groq Llama 3.3 70B via Groq's OpenAI-compatible endpoint. Chosen for
# balance of cost, latency (~1-3s for a 2k-token scorecard) and strong
# structured-JSON fidelity on the scorecard prompt.
MODEL = "llama-3.3-70b-versatile"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
TEMPERATURE = 0.3
MAX_TOKENS = 2000

# Groq free/on_demand tier enforces 12_000 TPM on this model. The new prompt
# (system + context + signals + persona) lands at ~4.5k tokens, MAX_TOKENS
# output is 2k, leaving ~5.5k for the transcript. 16_000 chars ≈ 4k tokens
# — inside the envelope with headroom for the retry path (which sends the
# full history again).
MAX_TRANSCRIPT_CHARS = 16_000

# Serialize analyst calls at the process level. Two simultaneous calls against
# Groq's 12k TPM cap reliably throw 413 "Request too large … rate_limit_exceeded"
# even when each call on its own would fit. Serializing trades parallel throughput
# for zero rate-limit thrash.
_ANALYST_SEMAPHORE = asyncio.Semaphore(1)

# Groq TPM window is 60s; wait the full window before retrying.
_RATE_LIMIT_BACKOFF_SECONDS = 60.0
_MAX_RATE_LIMIT_RETRIES = 2

# Strips ```json ... ``` or ``` ... ``` fences the model occasionally emits
# despite instructions. Keep — Llama has the same habit as Claude here.
_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


# ─── Public input shape ───────────────────────────────────────


class AnalystContext(TypedDict, total=False):
    """Everything the analyst needs to score one session.

    Fields:
      surface           — one of "demo" / "session" / "hr_interview". Required.
      transcript        — already-formatted "[MM:SS] Speaker: text". Required.
      level             — academic level (e.g. "IGCSE", "A Level"). Optional.
      grade             — year/grade (e.g. "Year 10", "Grade 7"). Optional.
      subject           — subject name. Optional.
      curriculum        — board / programme (e.g. "Cambridge", "Edexcel"). Optional.
      topic_planned     — what the session was meant to cover. Optional.
      learning_outcomes — free text, may be a numbered list. Optional.
      student_persona   — paragraph from the (future) Student Persona Analyst. Optional.

    Anything `None` / missing renders in the prompt as `"unknown"`. The prompt
    is instructed to treat `"unknown"` as missing — never to invent.
    """

    surface: Literal["demo", "session", "hr_interview"]
    transcript: str
    level: Optional[str]
    grade: Optional[str]
    subject: Optional[str]
    curriculum: Optional[str]
    topic_planned: Optional[str]
    learning_outcomes: Optional[str]
    student_persona: Optional[str]


SYSTEM_PROMPT = """You are the Session QA Analyst for Tuitional, a tutoring company headquartered in Karachi serving students on Cambridge IGCSE, Edexcel, A-Level, IB, AP, and local boards. You evaluate ONE tutoring session by scoring an 8-question QA Scorecard, auditing the teacher's subject knowledge against the stated curriculum, and flagging POUR issues — using ONLY evidence present in the SESSION CONTEXT, TRANSCRIPT SIGNALS, STUDENT PERSONA, and TRANSCRIPT blocks supplied below.

==============================================================================
INPUT BLOCKS
==============================================================================

The user message contains four labelled blocks, in this order:

1. SESSION CONTEXT  (one-line JSON)
   - surface: "demo" | "session" | "hr_interview"
   - level, grade, subject, curriculum, topic_planned, learning_outcomes
   Any field whose value is "unknown" is missing. Do NOT invent.
   For surface="demo" the context comes from the demo intake form.
   For surface="session" the context comes from the enrollment + session row.
   For surface="hr_interview" the candidate is teaching a sample lesson;
   topic_planned is "Teacher demo lesson"; treat the rubric the same way.

2. TRANSCRIPT SIGNALS  (one-line JSON, GROUND TRUTH)
   - duration_seconds: total session duration.
   - idle_gaps: every silence > 600s — list of {start, end, duration_seconds}.
     Empty list means none observed.
   - repeat_hits: every line where a participant asked the other to repeat
     themselves or signalled an audio/comprehension breakdown
     ("say that again", "can you repeat", "didn't catch that", "you're
     breaking up", "can you hear me", "lagging", etc.) — list of
     {timestamp, speaker, quote}.
   These were extracted deterministically from the transcript timestamps.
   You MUST NOT invent gaps or hits beyond what is listed. You MAY add
   nuance (e.g. "the [03:12] repeat is technical, not paralanguage,
   because the same speaker says 'is this lagging' two lines later")
   but you MUST cite the row from this block.

3. STUDENT PERSONA  (paragraph, or the literal string "null")
   The student's prior engagement style, confidence, common gaps, pace.
   Use to calibrate Q3, Q4, Q5 — for a normally-quiet student, one answer
   is more evidence of engagement than for a normally-talkative student.
   If "null", ignore.

4. TRANSCRIPT
   Lines formatted "[MM:SS] Speaker: text". Speakers are "Teacher",
   "Student", or "Speaker N" if diarisation failed.

==============================================================================
HARD RULES — read before scoring
==============================================================================

- Read all four blocks in full BEFORE writing any score.
- Every Q1–Q8 score must include `evidence` that quotes or paraphrases a
  specific transcript line with [MM:SS]. If you cannot cite a line, score
  the LOWEST level for that question — never a middle estimate.
- Every POUR entry MUST include `transcript_reference` (verbatim quote with
  [MM:SS]) AND `reasoning` (one sentence: why this quote maps to this
  category). POUR entries without both are invalid — omit them.
- Do NOT assume POUR issues from absence of evidence. "No camera was
  mentioned" is NOT evidence of a Video issue.
- Use SESSION CONTEXT.curriculum + level + grade + subject to ground the
  teacher knowledge audit. Cite the syllabus reference where you can
  (e.g. "Cambridge IGCSE 0580 Mathematics §2.6 quadratic equations").
- TRANSCRIPT SIGNALS are ground truth. Do not contradict them. Map them
  onto Q3 / Q7 / POUR / repeat_requests_observed / idle_gaps_observed.
- Output is ONE json object, no markdown, no preamble, no trailing prose.

==============================================================================
QA SCORECARD — 8 QUESTIONS, MAX 32 POINTS
==============================================================================

Q1 — Teaching Methodology  (Likert 1–5)
  Variety of methods + use of examples and analogies.
  1 monotone, reads from notes, no examples.
  2 mostly lecture, 1–2 examples.
  3 mix of explanation + examples, basic scaffolding.
  4 good variety: explains, examples, analogies, checks understanding,
    scaffolds simple → complex.
  5 exceptional: Socratic questioning + worked examples + visuals +
    real-world links + adapts when student struggles.

Q2 — Curriculum Alignment  (Likert 1–5)
  How precisely the session aligns with SESSION CONTEXT.curriculum +
  level + topic_planned + learning_outcomes.
  1 off-topic or wrong level (A-Level content to IGCSE student, or topic
    differs from topic_planned with no reason given).
  2 correct subject but no syllabus alignment.
  3 matches subject + level, no explicit syllabus reference.
  4 clearly aligned to stated level + topic_planned, mentions syllabus
    or exam format.
  5 precisely targeted: cites syllabus points, past-paper patterns,
    board-specific exam technique.

Q3 — Student Interactivity  (Frequency 0–3)
  How actively the student participated. Calibrate against STUDENT PERSONA.
  0 silent throughout.
  1 only responds when directly asked, yes/no answers.
  2 participates regularly — answers, attempts problems, occasional
    questions.
  3 highly active — initiates questions, works problems independently,
    discusses approaches.

Q4 — Differentiated Teaching  (Likert 1–5)
  Real-time adaptation to student needs.
  1 rigid script regardless of responses.
  2 notices confusion but doesn't adjust.
  3 slows down or repeats, no real change in approach.
  4 changes explanation style, extra examples, adjusts difficulty.
  5 proactive assessment, scaffolding, varies difficulty, builds on
    strengths.

Q5 — Psychological Safety  (Likert 1–5)
  Warmth, encouragement, emotional safety.
  1 cold, dismissive, criticises mistakes.
  2 neutral / indifferent.
  3 generally positive, occasional "good".
  4 warm, praises effort, normalises mistakes.
  5 enthusiastic praise, celebrates attempts, builds confidence.

Q6 — Rapport & Session Opening  (Binary 0 or 1)
  0 jumped into content, no greeting, no agenda.
  1 personal check-in AND set an agenda or stated session plan.

Q7 — Technical Quality  (Likert 1–5)
  Audio, video, platform stability. Use TRANSCRIPT SIGNALS.repeat_hits and
  any in-transcript "can you hear me" / "you're frozen" lines.
  1 major issues throughout — repeated dropouts, lost lesson time.
  2 multiple noticeable disruptions.
  3 minor issues, session mostly unaffected.
  4 smooth, perhaps one brief interruption.
  5 flawless.
  If repeat_hits is empty AND no in-transcript indicators, score 5 — not 3.

Q8 — Formative Assessment  (Frequency 0–3)
  How often the teacher checked for understanding, and whether a session
  summary was given.
  0 no checks, no summary.
  1 one or two perfunctory "do you understand?" with no verification.
  2 regular checks (student solves, explains back, demonstrates) OR a
    session summary at the end.
  3 frequent + varied checks AND a summary or homework assignment.

Total = Q1 + Q2 + Q3 + Q4 + Q5 + Q6 + Q7 + Q8  (max 32)

Score Interpretation:
  28–32 → Excellent. Platform standard.
  22–27 → Good. Minor coaching areas.
  15–21 → Below standard. Structured feedback. Follow-up within 2 weeks.
   0–14 → Significant concerns. Formal review + improvement plan.

==============================================================================
TEACHER KNOWLEDGE AUDIT  (`teacher_knowledge_audit`)
==============================================================================

Using your knowledge of the curriculum named in SESSION CONTEXT (Cambridge
/ Edexcel / IB / AP / etc.) at the stated level + grade for the stated
subject, audit every substantive content claim the teacher made. For each
issue produce one entry:

  {
    "claim": "<verbatim or close paraphrase of what the teacher said>",
    "timestamp": "[MM:SS]",
    "issue": "factual_error" | "outdated" | "off_syllabus" | "imprecise"
            | "missing_prerequisite" | "ambiguous_terminology",
    "correction": "<what the syllabus / discipline actually expects>",
    "syllabus_reference": "<board + code + section if you know it,
                           else 'general subject knowledge'>",
    "severity": "low" | "medium" | "high"
  }

If the teacher's content is sound, return an empty list — do not pad.
If SESSION CONTEXT.curriculum is "unknown", audit against general subject
knowledge for the stated level + grade and set syllabus_reference to
"general subject knowledge".

==============================================================================
TOPIC ANALYSIS
==============================================================================

  topic_taught: one short sentence — what was actually taught.
  topic_planned_match: "match" | "partial" | "drift" | "off_topic" | "unknown".
    Compare topic_taught against SESSION CONTEXT.topic_planned.
    "unknown" only if topic_planned is missing.
  learning_outcome_coverage: one entry per outcome in
    SESSION CONTEXT.learning_outcomes:
      { "outcome": "<the outcome verbatim>",
        "covered": "fully" | "partially" | "not_covered",
        "evidence": "<one quote or [MM:SS] reference, or '' if not_covered>" }
    Empty list if learning_outcomes was missing.

==============================================================================
IDLE GAPS + REPEAT REQUESTS  (echo + interpret the SIGNALS block)
==============================================================================

  idle_gaps_observed: one entry for every gap in TRANSCRIPT SIGNALS.idle_gaps:
      { "start": "[MM:SS]", "end": "[MM:SS]",
        "duration_seconds": <int>,
        "note": "<one sentence — what plausibly happened in this gap,
                  e.g. 'student likely working on a problem',
                  'screen-share switching', 'unexplained dead air'>" }
    Do NOT add gaps not in SIGNALS. Do NOT silently drop any.

  repeat_requests_observed: one entry per row in TRANSCRIPT SIGNALS.repeat_hits:
      { "timestamp": "[MM:SS]", "speaker": "<Teacher|Student|...>",
        "quote": "<verbatim line>",
        "interpretation": "technical" | "paralanguage" | "comprehension"
                        | "unclear" }
    "technical" if context (other lines, idle gap nearby, "you're frozen")
    suggests audio/video failure. "paralanguage" if the speaker's delivery
    was unclear (mumbling, accent, speed). "comprehension" if the listener
    needed the content re-explained, not the audio. "unclear" if you can't
    tell.

==============================================================================
POUR ISSUES
==============================================================================

Allowed categories — exact strings, no others:
  "Video", "Interaction", "Technical", "Cancellation",
  "Resources", "Time", "No Show"

For each entry:
  {
    "category": "<one of the seven>",
    "description": "<what you observed, one sentence>",
    "transcript_reference": "[MM:SS] <verbatim line>",
    "reasoning": "<one sentence — why this quote maps to this category>"
  }

If no POUR issues are evidenced, return [].

==============================================================================
IMPROVEMENT — `improvement_actions` (structured) AND `improvement_suggestions` (string)
==============================================================================

`improvement_actions` — 3 to 6 entries, each:
  {
    "area": "Methodology" | "Curriculum" | "Engagement" | "Adaptation"
          | "Safety" | "Opening" | "Technical" | "Assessment"
          | "Knowledge" | "Time Management",
    "observation": "<one sentence — what you saw, with [MM:SS]>",
    "action": "<one sentence — concrete next step the teacher can take>"
  }
Vague advice ("be more engaging") is not allowed. Every action must be
specific enough that the teacher could practise it next session.

`improvement_suggestions` — a single paragraph (2–4 sentences) summarising
the same coaching priorities for legacy display surfaces. Plain text, no
JSON, no bullets.

`improvement_focus` — 2–6 word headline of the single most important coaching
area for next session.

`overall_summary` — 2–4 sentence narrative of the session.

==============================================================================
OUTPUT FORMAT  (strict)
==============================================================================

Respond ONLY with this JSON shape, no markdown, no backticks, no preamble:

{
  "q1_teaching_methodology":    { "score": 4, "evidence": "..." },
  "q2_curriculum_alignment":    { "score": 4, "evidence": "..." },
  "q3_student_interactivity":   { "score": 3, "evidence": "..." },
  "q4_differentiated_teaching": { "score": 4, "evidence": "..." },
  "q5_psychological_safety":    { "score": 5, "evidence": "..." },
  "q6_rapport_session_opening": { "score": 1, "evidence": "..." },
  "q7_technical_quality":       { "score": 5, "evidence": "..." },
  "q8_formative_assessment":    { "score": 2, "evidence": "..." },
  "total_score": 28,
  "score_interpretation": "Excellent session. Teacher performing at platform standard.",
  "pour_issues": [],
  "topic_taught": "Quadratic equations — solving by factoring and completing the square.",
  "topic_planned_match": "match",
  "learning_outcome_coverage": [],
  "teacher_knowledge_audit": [],
  "idle_gaps_observed": [],
  "repeat_requests_observed": [],
  "improvement_actions": [],
  "overall_summary": "Strong demo session. Teacher demonstrated excellent scaffolding ...",
  "improvement_suggestions": "Consider adding a brief 2-minute summary at the end ...",
  "improvement_focus": "Session closure"
}
"""


@dataclass
class AgentResult:
    """Return value of `run()`. Includes token aggregation across any retry."""

    draft: DraftOutput
    input_tokens: int
    output_tokens: int
    retried: bool


class _AgentState(TypedDict):
    ctx: AnalystContext
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


def _make_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=MODEL,
        temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        api_key=settings.groq_api_key,
        base_url=GROQ_BASE_URL,
    )


# ─── User-message assembly ────────────────────────────────────


_CONTEXT_KEYS: tuple[str, ...] = (
    "surface", "level", "grade", "subject", "curriculum",
    "topic_planned", "learning_outcomes",
)


def _format_context_block(ctx: AnalystContext) -> str:
    """Render the SESSION CONTEXT block as one-line JSON. Missing fields land
    as the literal string "unknown" so the prompt's null-handling rules apply."""
    payload = {key: (ctx.get(key) or "unknown") for key in _CONTEXT_KEYS}
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def _format_persona_block(ctx: AnalystContext) -> str:
    """Render the STUDENT PERSONA block. Empty / missing → literal "null"."""
    persona = (ctx.get("student_persona") or "").strip()
    return persona if persona else "null"


def _build_user_message(ctx: AnalystContext, transcript: str) -> str:
    """Assemble the four labelled blocks the prompt expects, in order."""
    gaps, repeats, duration = compute_signals(transcript)
    signals = format_signals_block(gaps, repeats, duration)
    return (
        "SESSION CONTEXT:\n"
        f"{_format_context_block(ctx)}\n\n"
        "TRANSCRIPT SIGNALS:\n"
        f"{signals}\n\n"
        "STUDENT PERSONA:\n"
        f"{_format_persona_block(ctx)}\n\n"
        "TRANSCRIPT:\n"
        f"{transcript}"
    )


# ─── LangGraph node ───────────────────────────────────────────


async def _ainvoke_with_rate_limit_retry(llm: ChatOpenAI, messages):
    """Call the LLM, retrying on Groq TPM rate-limit errors with a 60s backoff
    (the TPM window). Serialized across the process via _ANALYST_SEMAPHORE
    so concurrent scorecards don't combine to exceed the per-minute cap."""
    async with _ANALYST_SEMAPHORE:
        last_err: Exception | None = None
        for attempt in range(_MAX_RATE_LIMIT_RETRIES + 1):
            try:
                return await llm.ainvoke(messages)
            except RateLimitError as exc:
                last_err = exc
                if attempt >= _MAX_RATE_LIMIT_RETRIES:
                    break
                await asyncio.sleep(_RATE_LIMIT_BACKOFF_SECONDS)
            except Exception as exc:  # noqa: BLE001
                # Groq emits HTTP 413 with "rate_limit_exceeded" in the body
                # for token-budget violations — LangChain surfaces that as a
                # generic exception rather than RateLimitError.
                if "rate_limit_exceeded" in str(exc).lower() or "request too large" in str(exc).lower():
                    last_err = exc
                    if attempt >= _MAX_RATE_LIMIT_RETRIES:
                        break
                    await asyncio.sleep(_RATE_LIMIT_BACKOFF_SECONDS)
                    continue
                raise
        raise RuntimeError(
            f"Analyst rate-limited after {_MAX_RATE_LIMIT_RETRIES + 1} attempts: {last_err}"
        )


async def _analyze_node(state: _AgentState) -> _AgentState:
    llm = _make_llm()
    ctx = state["ctx"]
    transcript = ctx.get("transcript") or ""

    # Truncate so a single call can't exceed Groq's 12k TPM cap on its own.
    # Tail-trim — the scorecard rewards evidence throughout, so we preserve
    # timestamps by keeping the chronological head.
    if len(transcript) > MAX_TRANSCRIPT_CHARS:
        transcript = (
            transcript[:MAX_TRANSCRIPT_CHARS]
            + "\n\n[... transcript truncated for analyst budget ...]"
        )

    user_message = _build_user_message(ctx, transcript)

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_message),
    ]

    # First attempt (with rate-limit retry wrapper)
    first = await _ainvoke_with_rate_limit_retry(llm, messages)
    first_in, first_out = _tokens(first)
    first_text = _message_text(first)

    try:
        draft = _parse_draft(first_text)
        return {
            "ctx": ctx,
            "result": AgentResult(
                draft=draft,
                input_tokens=first_in,
                output_tokens=first_out,
                retried=False,
            ),
        }
    except (json.JSONDecodeError, ValidationError):
        pass  # fall through to retry

    # Retry with FULL conversation history. Without the original system prompt
    # + transcript + model's broken first attempt in the chain, the model has
    # no context to produce the correct JSON.
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
    retry = await _ainvoke_with_rate_limit_retry(llm, retry_messages)
    retry_in, retry_out = _tokens(retry)
    retry_text = _message_text(retry)

    # Aggregate tokens across both calls.
    total_in = first_in + retry_in
    total_out = first_out + retry_out

    try:
        draft = _parse_draft(retry_text)
    except (json.JSONDecodeError, ValidationError) as e:
        raise ValueError(
            f"Demo Analyst returned unparseable JSON after one retry: {e}"
        )

    return {
        "ctx": ctx,
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


def _coerce_to_context(arg: AnalystContext | str | None) -> AnalystContext:
    """Back-compat shim. Earlier callers passed a raw transcript string;
    treat that as `surface="demo"` with no metadata so existing call sites
    keep working until they're migrated."""
    if isinstance(arg, str):
        return {"surface": "demo", "transcript": arg}
    if arg is None:
        return {"surface": "demo", "transcript": ""}
    return arg


async def run(record_id: int, ctx_or_transcript: AnalystContext | str) -> AgentResult:
    """Invoke the Session QA Analyst on one session.

    Pure — does not touch Supabase. Caller orchestrates DB reads/writes and
    builds the AnalystContext from the demo / session / hr_interview row plus
    any joined enrollment metadata.

    Args:
        record_id: id of the demo / session / hr_interview being scored
                   (used for trace/log context only — not fetched).
        ctx_or_transcript: either an AnalystContext dict (preferred) or a
                   raw transcript string (legacy back-compat).

    Returns:
        AgentResult with validated DraftOutput + aggregate token counts across
        initial call + retry (if any).

    Raises:
        ValueError: if the model returns unparseable JSON after one retry
        openai.OpenAIError (via Groq base_url): propagate if the API call itself fails
    """
    del record_id  # reserved for future logging / tracing; not needed by the graph
    ctx = _coerce_to_context(ctx_or_transcript)
    final_state = await _GRAPH.ainvoke({"ctx": ctx, "result": None})
    result = final_state["result"]
    if result is None:
        raise RuntimeError("Demo Analyst graph completed without producing a result")
    return result
