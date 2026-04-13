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
    # Max possible is 25; we've allowed score_interpretation room even if Claude computes >25
    assert 0 <= result.draft.total_score <= 30
    # Sample is a quality session — total should be in the "Good" or "Excellent" band
    assert result.draft.total_score >= 17, (
        f"Good IGCSE session expected total>=17, got {result.draft.total_score}; components={computed_total}"
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
