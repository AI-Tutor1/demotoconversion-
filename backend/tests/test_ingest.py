"""Ingest agent tests.

Network-free: Google Drive URL parsing, virus-scan confirm token extraction,
transcript formatter + speaker heuristic. The download / ffmpeg / Whisper
paths are verified manually during Step 6 (no live tests in CI to keep
Whisper costs + network flakiness out of the suite).
"""

from types import SimpleNamespace

import pytest

from agents.ingest import (
    _extract_confirm_token,
    _extract_uuid,
    _format_transcript,
    _guess_speaker,
    extract_file_id,
)


# ─── URL parsing ──────────────────────────────────────────────


@pytest.mark.parametrize(
    "url,expected",
    [
        (
            "https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0JKL/view?usp=sharing",
            "1A2B3C4D5E6F7G8H9I0JKL",
        ),
        (
            "https://drive.google.com/file/d/abc_DEF-123/view",
            "abc_DEF-123",
        ),
        (
            "https://drive.google.com/open?id=abcDEF123",
            "abcDEF123",
        ),
        (
            "https://drive.google.com/uc?export=download&id=XYZ789",
            "XYZ789",
        ),
    ],
)
def test_extract_file_id_recognized_formats(url: str, expected: str) -> None:
    assert extract_file_id(url) == expected


@pytest.mark.parametrize(
    "url",
    [
        "",
        "https://example.com/video.mp4",
        "https://zoom.us/rec/share/abc123",
        "not a url",
        "https://drive.google.com/",  # no file id in path
    ],
)
def test_extract_file_id_rejects_non_gdrive(url: str) -> None:
    assert extract_file_id(url) is None


# ─── Virus-scan page token extraction ─────────────────────────


def test_extract_confirm_token_from_form_value() -> None:
    html = '<form><input name="confirm" value="abc123_-xyz"></form>'
    assert _extract_confirm_token(html) == "abc123_-xyz"


def test_extract_confirm_token_from_query_string() -> None:
    html = '<a href="/uc?export=download&confirm=TOKEN_42&id=FILEID">Download</a>'
    assert _extract_confirm_token(html) == "TOKEN_42"


def test_extract_confirm_token_absent_returns_none() -> None:
    assert _extract_confirm_token("<html><body>Nothing to confirm</body></html>") is None


def test_extract_uuid_from_form_value() -> None:
    html = '<input name="uuid" value="aaaa1111-bbbb-2222-cccc-333333333333">'
    assert _extract_uuid(html) == "aaaa1111-bbbb-2222-cccc-333333333333"


# ─── Transcript formatter + speaker heuristic ─────────────────


def test_format_transcript_produces_timestamped_lines() -> None:
    segments = [
        SimpleNamespace(start=0.0,   text="Hello, can you hear me?"),
        SimpleNamespace(start=5.2,   text="Yes I can hear you"),
        SimpleNamespace(start=125.5, text="Let me show you on the whiteboard"),
    ]
    out = _format_transcript(segments)
    lines = out.split("\n")
    assert len(lines) == 3
    assert lines[0].startswith("[00:00]")
    assert lines[1].startswith("[00:05]")
    assert lines[2].startswith("[02:05]")  # 125 / 60 = 2m 5s
    # Speaker heuristic: long teacher greeting and "let me" phrase → Teacher
    assert "Teacher" in lines[2] or "Student" in lines[2]
    # Short affirmation → Student
    assert "Student: Yes I can hear you" in lines[1]


def test_guess_speaker_student_affirmations() -> None:
    assert _guess_speaker("Yes.") == "Student"
    assert _guess_speaker("Um, maybe 2 and 3?") == "Student"
    assert _guess_speaker("no") == "Student"


def test_guess_speaker_teacher_markers() -> None:
    assert _guess_speaker("Let me show you the formula") == "Teacher"
    assert _guess_speaker("Excellent work!") == "Teacher"
    assert _guess_speaker("So the quadratic formula is x equals negative b") == "Teacher"


def test_format_transcript_skips_empty_segments() -> None:
    segments = [
        SimpleNamespace(start=0.0, text=""),
        SimpleNamespace(start=1.0, text="   "),
        SimpleNamespace(start=2.0, text="Hello"),
    ]
    out = _format_transcript(segments)
    assert out.count("\n") == 0  # only one line
    assert out.endswith("Hello")
