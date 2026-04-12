"""Demo Analyst agent — takes a demo transcript and produces a structured quality assessment.

Step 1: module stub.
Step 2 will implement the LangGraph node, Claude Sonnet call, JSON parsing, and retry.
Step 3 will wire it to POST /api/v1/demos/{id}/analyze in app/routers/demos.py.
"""

AGENT_NAME = "demo_analyst"
MODEL = "claude-sonnet-4-20250514"
TEMPERATURE = 0.3
MAX_TOKENS = 2000


def run(demo_id: int) -> dict:
    """Placeholder — implemented in Step 2."""
    raise NotImplementedError("Demo Analyst agent will be wired in Step 2.")
