"""Ingest agent — Google Drive download + ffmpeg audio extract + Whisper transcription.

Transcription uses Groq's OpenAI-compatible Whisper endpoint (whisper-large-v3) —
drop-in for the OpenAI Whisper API, faster and cheaper.

Pure: does not touch Supabase. Caller orchestrates: take the returned transcript,
UPDATE demos.transcript immediately, THEN chain into Demo Analyst.

Temp files (video + audio) are unlinked as soon as they're no longer needed,
and the whole run is inside a TemporaryDirectory for last-resort cleanup.
"""

from __future__ import annotations

import asyncio
import re
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx
from openai import AsyncOpenAI

from app.config import settings
from app.models import IngestResult

AGENT_NAME = "ingest"

# Groq Whisper API free-tier file-size ceiling (paid tier raises it, but
# 25 MB keeps us compatible across plans).
WHISPER_MAX_BYTES = 25 * 1024 * 1024

# Groq's OpenAI-compatible endpoint + model. Using whisper-large-v3 for
# highest accuracy; swap to whisper-large-v3-turbo for lower latency.
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_WHISPER_MODEL = "whisper-large-v3"

# ffmpeg flags: no video, mono, 16 kHz sample rate (Whisper's native), 48 kbps mp3.
# ~22 MB for a 60-minute recording — well under the 25 MB ceiling.
FFMPEG_FLAGS = ["-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-f", "mp3"]

# Google Drive URL formats we try to match.
_GDRIVE_ID_PATTERNS = [
    re.compile(r"/file/d/([a-zA-Z0-9_-]+)"),          # /file/d/FILE_ID/view
    re.compile(r"[?&]id=([a-zA-Z0-9_-]+)"),            # ?id=FILE_ID or &id=FILE_ID
    re.compile(r"drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)"),
]


# ─── Google Drive URL parsing ─────────────────────────────────


def extract_file_id(url: str) -> str | None:
    """Return the Google Drive file ID from a sharing URL, or None if it's not one we recognize."""
    if not url or "drive.google.com" not in url:
        return None
    for pat in _GDRIVE_ID_PATTERNS:
        m = pat.search(url)
        if m:
            return m.group(1)
    return None


def _extract_confirm_token(html: str) -> str | None:
    """Google Drive's virus-scan confirmation page carries a confirm token.
    Token appears in `confirm=XXXX` either in a form `value=` or query string.
    """
    m = re.search(r'name="confirm"\s+value="([^"]+)"', html)
    if m:
        return m.group(1)
    m = re.search(r"[?&]confirm=([0-9A-Za-z_-]+)", html)
    if m:
        return m.group(1)
    return None


def _extract_uuid(html: str) -> str | None:
    """Newer Google Drive scan pages also include a uuid token."""
    m = re.search(r'name="uuid"\s+value="([^"]+)"', html)
    if m:
        return m.group(1)
    m = re.search(r"[?&]uuid=([0-9a-f-]+)", html)
    if m:
        return m.group(1)
    return None


# ─── Download ─────────────────────────────────────────────────


async def _download_gdrive(
    file_id: str, dest_path: Path, timeout_s: float = 300.0
) -> None:
    """Stream a Google Drive file to disk, handling the virus-scan confirmation
    page for files > ~25 MB. Raises RuntimeError on failure."""
    base = "https://drive.google.com/uc"
    download_url = f"{base}?export=download&id={file_id}"

    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout_s) as client:
        async with client.stream("GET", download_url) as response:
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").lower()
            if "text/html" not in content_type:
                # Small or already-confirmed — stream directly
                with open(dest_path, "wb") as fh:
                    async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                        fh.write(chunk)
                return
            # It's the HTML scan page — pull full text so we can find the confirm token
            html = (await response.aread()).decode("utf-8", errors="replace")

        confirm_token = _extract_confirm_token(html)
        if not confirm_token:
            raise RuntimeError(
                "Google Drive returned an HTML scan page without a confirm token. "
                "The file may be private, the link may not be set to 'Anyone with the link', "
                "or the URL is not for a downloadable file."
            )
        params: dict[str, str] = {"id": file_id, "export": "download", "confirm": confirm_token}
        uuid_token = _extract_uuid(html)
        if uuid_token:
            params["uuid"] = uuid_token

        async with client.stream("GET", base, params=params) as response:
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").lower()
            if "text/html" in content_type:
                raise RuntimeError(
                    "Google Drive still returning HTML after confirmation — file may be inaccessible "
                    "or require sign-in."
                )
            with open(dest_path, "wb") as fh:
                async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                    fh.write(chunk)


# ─── ffmpeg ───────────────────────────────────────────────────


async def _extract_audio(
    video_path: Path, audio_path: Path, timeout_s: float = 120.0
) -> None:
    """Run ffmpeg to produce a mono 48-kbps mp3. Raises on non-zero exit or timeout."""
    cmd = ["ffmpeg", "-y", "-i", str(video_path), *FFMPEG_FLAGS, str(audio_path)]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError(f"ffmpeg timed out after {timeout_s}s")
    if proc.returncode != 0:
        tail = stderr.decode("utf-8", errors="replace").strip().splitlines()
        # Keep the last few lines — ffmpeg writes progress to stderr; errors are at the bottom
        snippet = "\n".join(tail[-6:]) if tail else "(no stderr)"
        raise RuntimeError(f"ffmpeg failed (exit {proc.returncode}): {snippet}")


# ─── Whisper ──────────────────────────────────────────────────


async def _transcribe(audio_path: Path) -> tuple[Any, float]:
    """Call Groq Whisper via its OpenAI-compatible endpoint.
    Returns (VerboseTranscription response, wall-clock seconds)."""
    client = AsyncOpenAI(api_key=settings.groq_api_key, base_url=GROQ_BASE_URL)
    started = time.monotonic()
    with open(audio_path, "rb") as f:
        response = await client.audio.transcriptions.create(
            model=GROQ_WHISPER_MODEL,
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    elapsed = time.monotonic() - started
    return response, elapsed


# ─── Transcript formatting + speaker heuristic ────────────────

_TEACHER_PHRASES = (
    "let me", "can you", "so the", "so if", "now let's", "now try",
    "what do you think", "what does that tell", "exactly!", "perfect",
    "excellent", "great work", "great job", "brilliant", "let's", "okay, so",
    "here's", "for homework", "i'll", "remember,", "good question",
    "that's right", "correct,", "well done", "try this", "explain",
)
# "Okay" intentionally NOT in the student-starts list — teachers say "Okay so…"
# at the start of explanations. Default for "Okay" alone → Teacher.
_STUDENT_SHORT_STARTS = ("yes", "no", "maybe", "um ", "uh ", "yeah", "i think", "i don't")


def _guess_speaker(text: str) -> str:
    """Imperfect keyword heuristic — tags each segment as Teacher or Student.

    TODO(phase4): replace with pyannote diarization or AssemblyAI/Deepgram
    word-level speaker labels. This current approach gets ~70-80% right on
    tutoring sessions but will mislabel mid-conversation turns.
    """
    t = text.strip().lower()
    if not t:
        return "Teacher"
    # Teacher marker phrases anywhere take precedence (they're specific)
    if any(p in t for p in _TEACHER_PHRASES):
        return "Teacher"
    # Short- to medium-length utterances starting with a student affirmation
    if len(t.split()) <= 8 and any(t.startswith(p) for p in _STUDENT_SHORT_STARTS):
        return "Student"
    # Short trailing question → Student
    if t.endswith("?") and len(t.split()) <= 8:
        return "Student"
    return "Teacher"


def _format_transcript(segments: list[Any]) -> str:
    lines: list[str] = []
    for seg in segments:
        start = float(seg.start if hasattr(seg, "start") else seg["start"])
        text = (seg.text if hasattr(seg, "text") else seg["text"]).strip()
        if not text:
            continue
        mm = int(start) // 60
        ss = int(start) % 60
        speaker = _guess_speaker(text)
        lines.append(f"[{mm:02d}:{ss:02d}] {speaker}: {text}")
    return "\n".join(lines)


# ─── Public API ───────────────────────────────────────────────


async def run(demo_id: int, recording_url: str) -> IngestResult:
    """Download → ffmpeg → Whisper for a single demo. Pure: does not touch Supabase.

    Raises:
        ValueError: recording_url isn't a recognized Google Drive link
        RuntimeError: any stage failed (download / ffmpeg / audio-too-large / Whisper)
    """
    del demo_id  # reserved for future trace/logging
    file_id = extract_file_id(recording_url)
    if not file_id:
        raise ValueError(
            f"Recording URL is not a recognized Google Drive sharing link: {recording_url}"
        )

    with tempfile.TemporaryDirectory(prefix="ingest_") as tmpdir_str:
        tmpdir = Path(tmpdir_str)
        video_path = tmpdir / "recording.mp4"
        audio_path = tmpdir / "recording.mp3"

        # 1. Download
        await _download_gdrive(file_id, video_path)
        if not video_path.exists() or video_path.stat().st_size < 1024:
            raise RuntimeError(
                "Downloaded file is empty or <1 KB — the sharing link may not grant download access."
            )

        # 2. ffmpeg → audio
        await _extract_audio(video_path, audio_path)

        # 3. Free the big video file immediately
        try:
            video_path.unlink()
        except FileNotFoundError:
            pass

        if not audio_path.exists():
            raise RuntimeError("ffmpeg produced no output file")
        audio_size = audio_path.stat().st_size
        if audio_size > WHISPER_MAX_BYTES:
            raise RuntimeError(
                f"Audio {audio_size // (1024 * 1024)} MB exceeds Groq Whisper 25 MB limit. "
                f"Recording is too long — transcript chunking is a Phase 4 feature."
            )

        # 4. Whisper
        response, wall_seconds = await _transcribe(audio_path)

        # 5. Drop the audio file (TemporaryDirectory will also clean up on exit)
        try:
            audio_path.unlink()
        except FileNotFoundError:
            pass

    # 6. Format transcript
    segments = response.segments if hasattr(response, "segments") else response.get("segments", [])
    transcript = _format_transcript(segments)
    duration_seconds = int(getattr(response, "duration", 0) or 0)
    language = getattr(response, "language", "") or "unknown"

    return IngestResult(
        transcript=transcript,
        duration_seconds=duration_seconds,
        audio_size_bytes=audio_size,
        whisper_language=language,
        whisper_duration=wall_seconds,
    )
