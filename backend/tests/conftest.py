from pathlib import Path

import pytest


@pytest.fixture
def sample_transcript_path() -> Path:
    """Absolute path to the IGCSE Maths sample transcript used across agent tests."""
    return Path(__file__).parent.parent / "transcripts" / "sample_igcse_math.txt"


@pytest.fixture
def sample_transcript_text(sample_transcript_path: Path) -> str:
    return sample_transcript_path.read_text(encoding="utf-8")
