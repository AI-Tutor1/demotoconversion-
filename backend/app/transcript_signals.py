"""Pre-computed transcript signals for the Session QA Analyst prompt.

The transcript reaches the LLM as `[MM:SS] Speaker: text` lines (see
`backend/agents/ingest.py:_format_transcript`). Two patterns are too brittle
to leave to the LLM on a 4–5k-token transcript:

  - long idle gaps (no speech for > 10 min) — LLMs miscount minute arithmetic.
  - explicit "repeat that / can you hear me / breaking up" cues — easy to
    miss when scattered through hundreds of lines.

We extract both deterministically here and pass them into the prompt as
TRANSCRIPT SIGNALS the LLM treats as ground truth. Pure functions, no I/O.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

# Matches "[MM:SS] Speaker: text" — MM may exceed 60 for long sessions
# because ingest does `int(start) // 60` without wrapping further.
_LINE_RE = re.compile(r"^\[(\d+):(\d{2})\]\s+([^:]+):\s*(.*)$")

# Phrases that signal an audio breakdown or comprehension failure. Word-
# boundary matched, case-insensitive. Keep the list short and high-signal —
# false positives bleed into the Q7 score.
_REPEAT_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\bsay that again\b",
        r"\brepeat (that|please|it)\b",
        r"\bcome again\b",
        r"\bone more time\b",
        r"\b(didn'?t|did not) catch (that|it)\b",
        r"\bcan you repeat\b",
        r"\bcould you say that\b",
        r"\bsorry,? what\b",
        r"\bpardon\?",
        r"\byou(?:'re| are) breaking up\b",
        r"\bcan you hear me\b",
        r"\byou(?:'re| are) frozen\b",
        r"\bfrozen,? can you\b",
        r"\baudio(?:'s| is) cutting\b",
        r"\baudio cut(?:ting)? out\b",
        r"\bis (this|the audio) lagging\b",
        r"\blagging\b",
    )
)

DEFAULT_IDLE_THRESHOLD_SECONDS = 600  # 10 minutes


@dataclass(frozen=True)
class Segment:
    start_seconds: int
    speaker: str
    text: str


@dataclass(frozen=True)
class IdleGap:
    start: str         # "[MM:SS]" — last spoken line before the gap
    end: str           # "[MM:SS]" — first spoken line after the gap
    duration_seconds: int


@dataclass(frozen=True)
class RepeatHit:
    timestamp: str     # "[MM:SS]"
    speaker: str
    quote: str
    matched: str       # which pattern fired (helps debugging false positives)


def _fmt(seconds: int) -> str:
    return f"[{seconds // 60:02d}:{seconds % 60:02d}]"


def parse_segments(transcript: str) -> list[Segment]:
    """Parse `[MM:SS] Speaker: text` lines. Lines that don't match are skipped
    silently — the transcript may include truncation markers or stray text."""
    out: list[Segment] = []
    for line in transcript.splitlines():
        m = _LINE_RE.match(line)
        if not m:
            continue
        mm, ss, speaker, text = m.groups()
        seconds = int(mm) * 60 + int(ss)
        out.append(Segment(start_seconds=seconds, speaker=speaker.strip(), text=text.strip()))
    return out


def find_idle_gaps(
    segments: list[Segment],
    threshold_seconds: int = DEFAULT_IDLE_THRESHOLD_SECONDS,
) -> list[IdleGap]:
    """Return every gap between consecutive segments longer than the threshold.

    Whisper segments segment on speech boundaries, so a gap between
    segment[i].start and segment[i+1].start that exceeds the threshold is a
    long silence (no speech recognised in that window). We don't have segment
    end-times here — using start-to-start is conservative (slightly
    overstates gaps), which is fine for a > 10 min flag.
    """
    if len(segments) < 2:
        return []
    gaps: list[IdleGap] = []
    for prev, curr in zip(segments, segments[1:]):
        delta = curr.start_seconds - prev.start_seconds
        if delta > threshold_seconds:
            gaps.append(
                IdleGap(
                    start=_fmt(prev.start_seconds),
                    end=_fmt(curr.start_seconds),
                    duration_seconds=delta,
                )
            )
    return gaps


def find_repeat_hits(segments: list[Segment]) -> list[RepeatHit]:
    """Return every line whose text matches a repeat / breakdown pattern."""
    hits: list[RepeatHit] = []
    for seg in segments:
        for pat in _REPEAT_PATTERNS:
            m = pat.search(seg.text)
            if m:
                hits.append(
                    RepeatHit(
                        timestamp=_fmt(seg.start_seconds),
                        speaker=seg.speaker,
                        quote=seg.text,
                        matched=m.group(0),
                    )
                )
                break  # one hit per line is enough — don't double-count
    return hits


def compute_signals(
    transcript: str,
    threshold_seconds: int = DEFAULT_IDLE_THRESHOLD_SECONDS,
) -> tuple[list[IdleGap], list[RepeatHit], int]:
    """One-shot: parse → gaps + repeats + duration. Returns (gaps, repeats,
    duration_seconds). duration_seconds is the start time of the last
    segment (best estimate without segment end-times)."""
    segments = parse_segments(transcript)
    if not segments:
        return [], [], 0
    gaps = find_idle_gaps(segments, threshold_seconds=threshold_seconds)
    repeats = find_repeat_hits(segments)
    duration = segments[-1].start_seconds
    return gaps, repeats, duration


def format_signals_block(
    gaps: list[IdleGap],
    repeats: list[RepeatHit],
    duration_seconds: int,
) -> str:
    """Render the TRANSCRIPT SIGNALS block the prompt expects.

    Compact JSON keeps token cost low; the prompt names every key so the LLM
    can read it without further help. Returned string ends with a single
    newline; callers concatenate it directly."""
    payload = {
        "duration_seconds": duration_seconds,
        "idle_gaps": [
            {
                "start": g.start,
                "end": g.end,
                "duration_seconds": g.duration_seconds,
            }
            for g in gaps
        ],
        "repeat_hits": [
            {
                "timestamp": r.timestamp,
                "speaker": r.speaker,
                "quote": r.quote,
            }
            for r in repeats
        ],
    }
    return json.dumps(payload, separators=(",", ":"))
