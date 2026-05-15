"""Step 4: Cut segments and reframe to 9:16 vertical with ffmpeg."""
from __future__ import annotations

import subprocess
from pathlib import Path

import structlog

logger = structlog.get_logger()

_FFMPEG_TIMEOUT_S = 600


def _ffprobe_dimensions(video_path: Path) -> tuple[int, int]:
    """Return (width, height) via ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr[-300:]}")
    parts = result.stdout.strip().split(",")
    return int(parts[0]), int(parts[1])


def _cut_segment(video_path: Path, start_s: float, end_s: float, output_path: Path) -> None:
    """Fast stream-copy cut from source video."""
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-ss", f"{start_s:.3f}",
            "-to", f"{end_s:.3f}",
            "-i", str(video_path),
            "-c", "copy",
            "-movflags", "+faststart",
            str(output_path),
        ],
        capture_output=True,
        text=True,
        timeout=_FFMPEG_TIMEOUT_S,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg cut failed: {result.stderr[-500:]}")


def _reframe_to_vertical(input_path: Path, output_path: Path) -> None:
    """Crop and scale to 1080×1920 (9:16) using centre-crop + lanczos scale."""
    src_w, src_h = _ffprobe_dimensions(input_path)

    target_aspect = 9 / 16
    src_aspect = src_w / src_h

    if src_aspect > target_aspect:
        # Source is wider → crop width
        crop_h = src_h
        crop_w = int(src_h * target_aspect)
        crop_x = (src_w - crop_w) // 2
        crop_y = 0
    else:
        # Source is taller → crop height
        crop_w = src_w
        crop_h = int(src_w / target_aspect)
        crop_x = 0
        crop_y = (src_h - crop_h) // 2

    # Ensure even dimensions required by libx264
    crop_w -= crop_w % 2
    crop_h -= crop_h % 2

    vf = f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y},scale=1080:1920:flags=lanczos,setsar=1"

    result = subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(input_path),
            "-vf", vf,
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
        raise RuntimeError(f"ffmpeg reframe failed: {result.stderr[-500:]}")


def run(
    local_video_path: str,
    task_temp_dir: str,
    selected_segments: list[dict],
) -> list[str]:
    """Cut and reframe all segments. Returns list of local reframed clip paths."""
    video_path = Path(local_video_path)
    temp = Path(task_temp_dir)
    output_paths: list[str] = []

    for i, seg in enumerate(selected_segments):
        start_s = seg["start_ms"] / 1000.0
        end_s = seg["end_ms"] / 1000.0
        raw_path = temp / f"clip_{i:02d}_raw.mp4"
        framed_path = temp / f"clip_{i:02d}_framed.mp4"

        _cut_segment(video_path, start_s, end_s, raw_path)
        _reframe_to_vertical(raw_path, framed_path)
        output_paths.append(str(framed_path))
        logger.info("cut: segment done", index=i, start_s=round(start_s, 2), end_s=round(end_s, 2))

    return output_paths
