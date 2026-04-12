"""Demo Analyst tests.

- test_parses_json_from_code_fence: fast unit test with mocked LLM response (runs by default)
- test_live_igcse_maths: hits the real Claude API (skipped unless ANTHROPIC_API_KEY is set)
"""

import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from agents.demo_analyst import AgentResult, run
from app.models import DraftOutput

# A valid draft wrapped in a ```json fence — the exact annoying thing Claude sometimes does.
_VALID_RESPONSE_WITH_FENCE = """```json
{
  "pour_issues": [],
  "methodology": "Clear factoring approach with good scaffolding.",
  "topic": "Quadratic equations — appropriate for IGCSE Mathematics.",
  "resources": "Digital whiteboard used effectively for worked examples.",
  "engagement": "Student asked clarifying questions and attempted problems.",
  "effectiveness": "Student solved factoring and quadratic formula problems correctly.",
  "suggested_rating": 5,
  "suggestions": "Consider providing printed practice problems for homework.",
  "improvement_focus": "Resource diversity beyond whiteboard"
}
```"""


async def test_parses_json_from_code_fence() -> None:
    """JSON wrapped in ```json ...``` fences must still parse. Single call, no retry."""
    mock_response = SimpleNamespace(
        content=_VALID_RESPONSE_WITH_FENCE,
        usage_metadata={"input_tokens": 1200, "output_tokens": 400},
    )

    with patch("agents.demo_analyst._make_llm") as mk:
        mk.return_value.ainvoke = AsyncMock(return_value=mock_response)
        result = await run(demo_id=1, transcript="dummy transcript")

    assert isinstance(result, AgentResult)
    assert isinstance(result.draft, DraftOutput)
    assert result.draft.suggested_rating == 5
    assert result.draft.pour_issues == []
    assert len(result.draft.methodology) > 0
    # Mocked LLM invoked exactly once — no retry path
    assert mk.return_value.ainvoke.await_count == 1
    assert result.retried is False
    assert result.input_tokens == 1200
    assert result.output_tokens == 400


async def test_retry_on_invalid_json_sums_tokens() -> None:
    """If the first response is unparseable, retry with full history and aggregate tokens."""
    broken_response = SimpleNamespace(
        content="sure! here's the analysis: <not valid json>",
        usage_metadata={"input_tokens": 1200, "output_tokens": 50},
    )
    good_response = SimpleNamespace(
        content=_VALID_RESPONSE_WITH_FENCE,
        usage_metadata={"input_tokens": 1300, "output_tokens": 420},
    )

    with patch("agents.demo_analyst._make_llm") as mk:
        mk.return_value.ainvoke = AsyncMock(side_effect=[broken_response, good_response])
        result = await run(demo_id=1, transcript="dummy transcript")

    assert result.retried is True
    # Tokens aggregated across both calls — the whole point of planning correction #3
    assert result.input_tokens == 1200 + 1300
    assert result.output_tokens == 50 + 420
    # Verify retry sent the full history: system + user + ai(broken) + user(correction)
    retry_messages = mk.return_value.ainvoke.await_args_list[1].args[0]
    assert len(retry_messages) == 4, f"retry should send 4 messages, got {len(retry_messages)}"
    # 4th message is the correction prompt; 3rd is Claude's broken response echoed back
    assert "not valid JSON" in retry_messages[3].content


@pytest.mark.live
@pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY", "").startswith("sk-ant-"),
    reason="Live Claude API call — set a real ANTHROPIC_API_KEY (sk-ant-…) to run (~$0.005, ~30s)",
)
async def test_live_igcse_maths(sample_transcript_text: str) -> None:
    """Opt-in smoke test against real Claude. The sample is a good session → rating >= 4, no major POUR."""
    result = await run(demo_id=1, transcript=sample_transcript_text)

    assert isinstance(result.draft, DraftOutput)
    assert 1 <= result.draft.suggested_rating <= 5
    assert len(result.draft.methodology) > 0
    assert len(result.draft.suggestions) > 0
    # Sample is a quality session — Claude should agree
    assert result.draft.suggested_rating >= 4, (
        f"Good session expected rating>=4, got {result.draft.suggested_rating}"
    )
    assert result.input_tokens > 0
    assert result.output_tokens > 0
