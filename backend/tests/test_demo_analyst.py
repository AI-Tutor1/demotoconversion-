import pytest


@pytest.mark.xfail(reason="Agent body implemented in Step 2 — placeholder test for Step 1")
def test_demo_analyst_produces_valid_draft(sample_transcript_text: str) -> None:
    """Step 2 will replace this with a real agent invocation + schema validation against DraftOutput."""
    from agents import demo_analyst

    demo_analyst.run(demo_id=1)  # raises NotImplementedError in Step 1 — xfail
