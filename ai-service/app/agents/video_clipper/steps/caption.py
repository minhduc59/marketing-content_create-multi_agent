"""Step 5: Build ASS subtitle files and burn them into each clip with ffmpeg."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import structlog

logger = structlog.get_logger()

_FFMPEG_TIMEOUT_S = 600
_WORDS_PER_GROUP = 3


def _ms_to_ass(ms: int) -> str:
    """Convert milliseconds to ASS timecode H:MM:SS.cc"""
    ms = max(0, ms)
    cs = (ms // 10) % 100
    total_s = ms // 1000
    s = total_s % 60
    m = (total_s // 60) % 60
    h = total_s // 3600
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _hex_to_ass_color(hex_color: str) -> str:
    """Convert #RRGGBB to ASS &H00BBGGRR (BGR order, 00 alpha = fully opaque)."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return "&H00FFFFFF"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}"


def _build_ass(
    words: list[dict],
    clip_start_ms: int,
    clip_end_ms: int,
    font_size: int,
    color: str,
    outline_color: str,
    outline_width: int,
) -> str:
    """Build an ASS subtitle string from word timestamps, shifted to clip-relative time."""
    # Filter words that fall within this clip's range
    relevant = [
        w for w in words
        if w["start"] >= clip_start_ms and w["end"] <= clip_end_ms + 500
    ]

    ass_color = _hex_to_ass_color(color)
    ass_outline = _hex_to_ass_color(outline_color)

    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        "PlayResX: 1080\n"
        "PlayResY: 1920\n"
        "ScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,Arial,{font_size},{ass_color},&H000000FF,"
        f"{ass_outline},&H00000000,"
        f"0,0,0,0,100,100,0,0,1,{outline_width},0,2,20,20,80,1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    dialogue_lines: list[str] = []
    for i in range(0, len(relevant), _WORDS_PER_GROUP):
        group = relevant[i : i + _WORDS_PER_GROUP]
        start_ms = group[0]["start"] - clip_start_ms
        end_ms = group[-1]["end"] - clip_start_ms
        text = " ".join(w["text"] for w in group)
        dialogue_lines.append(
            f"Dialogue: 0,{_ms_to_ass(start_ms)},{_ms_to_ass(end_ms)},"
            f"Default,,0,0,0,,{text}"
        )

    return header + "\n".join(dialogue_lines)


def _ffmpeg_escape_path(path: str) -> str:
    """Escape a file path for use in an ffmpeg filtergraph value."""
    # Only characters that need escaping in the subtitles= filter value
    for char in ("\\", ":", "'"):
        path = path.replace(char, "\\" + char)
    return path


def run(
    framed_paths: list[str],
    task_temp_dir: str,
    selected_segments: list[dict],
    transcript_data: dict,
    font_size: int = 40,
    color: str = "#FFFFFF",
    outline_color: str = "#000000",
    outline_width: int = 2,
) -> list[str]:
    """Burn ASS subtitles into each reframed clip. Returns list of captioned clip paths."""
    words: list[dict] = transcript_data.get("words", [])
    temp = Path(task_temp_dir)
    output_paths: list[str] = []

    for i, (framed_path, seg) in enumerate(zip(framed_paths, selected_segments)):
        clip_start_ms = seg["start_ms"]
        clip_end_ms = seg["end_ms"]
        ass_path = temp / f"clip_{i:02d}.ass"
        output_path = temp / f"clip_{i:02d}_final.mp4"

        ass_content = _build_ass(
            words, clip_start_ms, clip_end_ms, font_size, color, outline_color, outline_width
        )
        ass_path.write_text(ass_content, encoding="utf-8")

        subtitles_filter = (
            f"subtitles=filename={_ffmpeg_escape_path(str(ass_path))},setsar=1"
        )
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", framed_path,
                "-vf", subtitles_filter,
                "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=_FFMPEG_TIMEOUT_S,
        )
        if result.returncode != 0:
            # Caption burn failed — fall back to the framed clip without subtitles
            logger.warning(
                "caption: subtitle burn failed, using framed clip",
                index=i,
                stderr=result.stderr[-300:],
            )
            shutil.copy(framed_path, output_path)

        output_paths.append(str(output_path))
        logger.info("caption: done", index=i)

    return output_paths
