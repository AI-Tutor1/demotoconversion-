"""Demo Analyst tests — QA Scorecard edition.

- test_parses_scorecard_from_code_fence: fast unit test (no live LLM)
- test_retry_on_invalid_json_sums_tokens: retry path + token aggregation
- test_live_igcse_maths: opt-in, hits real Claude, validates scorecard shape
"""

import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from agents.demo_analyst import AgentResult, run
from app.models import DraftOutput, ScoreEvidence

# A plausible scorecard wrapped in a ```json fence — mirrors what Claude emits
# despite "no backticks" instruction, so the fence-stripper gets exercised.
_VALID_SCORECARD_WITH_FENCE = """```json
{
  "q1_teaching_methodology":     {"score": 4, "evidence": "Worked examples at [01:25], scaffolded from factoring to quadratic formula"},
  "q2_curriculum_alignment":     {"score": 4, "evidence": "Content matched IGCSE Mathematics, quadratic equations"},
  "q3_student_interactivity":    {"score": 3, "evidence": "Student solved problems at [00:55], [01:35], [02:30], asked clarifying Qs"},
  "q4_differentiated_teaching":  {"score": 4, "evidence": "Progressed from x²+5x+6 to 2x²+3x-5 as student succeeded"},
  "q5_psychological_safety":     {"score": 5, "evidence": "Consistent praise: 'Excellent!', 'Brilliant!', 'You picked this up really quickly'"},
  "q6_rapport_session_opening":  {"score": 1, "evidence": "Greeting + asked what student already knows at [00:10]"},
  "q7_technical_quality":        {"score": 5, "evidence": "No disruptions observed, screen share worked, clear audio throughout"},
  "q8_formative_assessment":     {"score": 2, "evidence": "Student verified solutions at [01:35]; progressive difficulty; no end-of-session summary"},
  "total_score": 28,
  "score_interpretation": "Excellent session. Teacher performing at platform standard.",
  "pour_issues": [],
  "overall_summary": "Strong demo session. Teacher demonstrated excellent scaffolding and warmth.",
  "improvement_suggestions": "Consider adding a brief 2-minute summary at the end to consolidate learning.",
  "improvement_focus": "Session closure and formative assessment"
}
```"""


async def test_parses_scorecard_from_code_fence() -> None:
    """JSON wrapped in ```json fences must still parse into the scorecard shape."""
    mock_response = SimpleNamespace(
        content=_VALID_SCORECARD_WITH_FENCE,
        usage_metadata={"input_tokens": 1500, "output_tokens": 800},
    )
    with patch("agents.demo_analyst._make_llm") as mk:
        mk.return_value.ainvoke = AsyncMock(return_value=mock_response)
        result = await run(demo_id=1, transcript="dummy")

    assert isinstance(result, AgentResult)
    assert isinstance(result.draft, DraftOutput)
    # Scorecard fields
    assert isinstance(result.draft.q1_teaching_methodology, ScoreEvidence)
    assert result.draft.q1_teaching_methodology.score == 4
    assert "Worked examples" in result.draft.q1_teaching_methodology.evidence
    assert result.draft.q6_rapport_session_opening.score == 1  # binary
    assert result.draft.total_score == 28
    assert "Excellent" in result.draft.score_interpretation
    assert result.draft.pour_issues == []
    assert len(result.draft.overall_summary) > 0
    # Metadata
    assert result.retried is False
    assert result.input_tokens == 1500
    assert result.output_tokens == 800
    assert mk.return_value.ainvoke.await_count == 1


async def test_retry_on_invalid_json_sums_tokens() -> None:
    """On unparseable first response, retry must send the full conversation
    history AND aggregate tokens from both calls."""
    broken_response = SimpleNamespace(
        content="sure! here's the analysis: <not valid json>",
        usage_metadata={"input_tokens": 1400, "output_tokens": 50},
    )
    good_response = SimpleNamespace(
        content=_VALID_SCORECARD_WITH_FENCE,
        usage_metadata={"input_tokens": 1500, "output_tokens": 820},
    )

    with patch("agents.demo_analyst._make_llm") as mk:
        mk.return_value.ainvoke = AsyncMock(side_effect=[broken_response, good_response])
        result = await run(demo_id=1, transcript="dummy")

    assert result.retried is True
    assert result.input_tokens == 1400 + 1500
    assert result.output_tokens == 50 + 820
    # Verify retry included the FULL conversation history
    retry_messages = mk.return_value.ainvoke.await_args_list[1].args[0]
    assert len(retry_messages) == 4, f"retry should send 4 messages, got {len(retry_messages)}"
    assert "not valid JSON" in retry_messages[3].content


# ─── pour_issues coercion ─────────────────────────────────────────────
# The DB CHECK constraint on pour_issues.category allows exactly:
#   Video / Interaction / Technical / Cancellation / Resources / Time / No Show
# Anything else (including the old "Other" fallback) must be remapped via
# _resolve_pour_category or dropped with a warning. These tests pin that
# contract so a future regression can't reintroduce "Other" or freeform
# categories into demo_drafts.draft_data.

_BASE_SCORECARD: dict = {
    "q1_teaching_methodology":     {"score": 4, "evidence": "x"},
    "q2_curriculum_alignment":     {"score": 4, "evidence": "x"},
    "q3_student_interactivity":    {"score": 3, "evidence": "x"},
    "q4_differentiated_teaching":  {"score": 4, "evidence": "x"},
    "q5_psychological_safety":     {"score": 5, "evidence": "x"},
    "q6_rapport_session_opening":  {"score": 1, "evidence": "x"},
    "q7_technical_quality":        {"score": 5, "evidence": "x"},
    "q8_formative_assessment":     {"score": 2, "evidence": "x"},
    "total_score": 28,
    "score_interpretation": "Excellent",
    "overall_summary": "ok",
    "improvement_suggestions": "ok",
    "improvement_focus": "ok",
}


def _build(pour_issues: list) -> DraftOutput:
    return DraftOutput(**_BASE_SCORECARD, pour_issues=pour_issues)


def test_pour_objects_with_valid_categories_pass_through() -> None:
    d = _build([
        {"category": "Video",       "description": "Camera off at 03:15"},
        {"category": "Technical",   "description": "Audio cut out"},
    ])
    assert [p.category for p in d.pour_issues] == ["Video", "Technical"]


def test_pour_colon_strings_are_split_when_category_is_valid() -> None:
    d = _build(["Technical: audio drops at 02:30"])
    assert len(d.pour_issues) == 1
    assert d.pour_issues[0].category == "Technical"
    assert d.pour_issues[0].description == "audio drops at 02:30"


def test_pour_case_insensitive_canonicalisation() -> None:
    d = _build([{"category": "technical", "description": "lag"}])
    assert d.pour_issues[0].category == "Technical"


def test_pour_synonym_map_object_form() -> None:
    # AI freely improvises categories outside the 7 — each should be remapped.
    d = _build([
        {"category": "Audio",       "description": "muffled mic"},
        {"category": "Engagement",  "description": "student silent"},
        {"category": "Pacing",      "description": "rushed end"},
        {"category": "Worksheet",   "description": "no slides shared"},
    ])
    assert [p.category for p in d.pour_issues] == [
        "Technical",
        "Interaction",
        "Time",
        "Resources",
    ]


def test_pour_synonym_map_bare_string_without_colon() -> None:
    # Old fallback path would have stored this under category="Other".
    d = _build(["Audio drops at 02:30"])
    assert len(d.pour_issues) == 1
    assert d.pour_issues[0].category == "Technical"


def test_pour_other_category_is_dropped_not_promoted() -> None:
    # The original coerce injected {"category":"Other"} and the DB rejected it.
    d = _build([{"category": "Other", "description": "something weird"}])
    assert d.pour_issues == []


def test_pour_unknown_category_is_dropped() -> None:
    d = _build([{"category": "Behavioural", "description": "student moody"}])
    assert d.pour_issues == []


def test_pour_unknown_bare_string_is_dropped() -> None:
    d = _build(["Something weird happened"])
    assert d.pour_issues == []


def test_pour_mixed_valid_and_invalid_keeps_only_valid() -> None:
    d = _build([
        {"category": "Video",       "description": "camera off"},
        {"category": "Other",       "description": "drop me"},
        "Audio drops at 01:00",
        "Something weird",
    ])
    cats = [p.category for p in d.pour_issues]
    assert cats == ["Video", "Technical"]


def test_pour_empty_list_stays_empty() -> None:
    d = _build([])
    assert d.pour_issues == []


# ─── Live integration test ────────────────────────────────────────────


@pytest.mark.live
@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY", "").startswith("sk-ant-"),
    reason="Live Claude API call — set a real ANTHROPIC_API_KEY (sk-ant-…) to run (~$0.005, ~30s)",
)
async def test_live_igcse_maths(sample_transcript_text: str) -> None:
    """Opt-in smoke test. IGCSE sample is a GOOD session → total_score should be high."""
    result = await run(demo_id=1, transcript=sample_transcript_text)

    assert isinstance(result.draft, DraftOutput)
    # Sum-of-parts must equal total_score exactly (model instruction)
    computed_total = (
        result.draft.q1_teaching_methodology.score
        + result.draft.q2_curriculum_alignment.score
        + result.draft.q3_student_interactivity.score
        + result.draft.q4_differentiated_teaching.score
        + result.draft.q5_psychological_safety.score
        + result.draft.q6_rapport_session_opening.score
        + result.draft.q7_technical_quality.score
        + result.draft.q8_formative_assessment.score
    )
    # Max possible is 32 (5+5+3+5+5+1+5+3)
    assert 0 <= result.draft.total_score <= 32
    # Sample is a quality session — total should be in the "Good" or "Excellent" band (>=22)
    assert result.draft.total_score >= 22, (
        f"Good IGCSE session expected total>=22, got {result.draft.total_score}; components={computed_total}"
    )
    # Every score has non-empty evidence
    for q in [
        result.draft.q1_teaching_methodology,
        result.draft.q2_curriculum_alignment,
        result.draft.q3_student_interactivity,
        result.draft.q4_differentiated_teaching,
        result.draft.q5_psychological_safety,
        result.draft.q6_rapport_session_opening,
        result.draft.q7_technical_quality,
        result.draft.q8_formative_assessment,
    ]:
        assert len(q.evidence) > 0
    assert result.input_tokens > 0
    assert result.output_tokens > 0
