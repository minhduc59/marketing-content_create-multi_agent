"""Step 1: Download or retrieve the source video file."""
from __future__ import annotations

from pathlib import Path

import structlog

logger = structlog.get_logger()


def _download_youtube(url: str, output_path: Path) -> None:
    """Download a YouTube video using yt-dlp."""
    import yt_dlp  # optional dep — installed in worker container

    ydl_opts: dict = {
        # Write to the path without the extension; yt-dlp adds .mp4 automatically
        "outtmpl": str(output_path.with_suffix("")),
        "format": (
            "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]"
            "/best[height<=1080][ext=mp4]"
            "/best[height<=1080]"
        ),
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])


def _retrieve_upload(cloudinary_public_id: str, output_path: Path) -> None:
    """Download a previously uploaded video from Cloudinary."""
    from app.core.storage import get_cloudinary_storage

    storage = get_cloudinary_storage()
    storage.download_file(cloudinary_public_id, str(output_path))


def run(task_temp_dir: str, source_type: str, source_ref: str) -> str:
    """Download or retrieve the source video. Returns its local path."""
    output_path = Path(task_temp_dir) / "source.mp4"

    if source_type == "url":
        _download_youtube(source_ref, output_path)
    elif source_type == "upload":
        _retrieve_upload(source_ref, output_path)
    else:
        raise ValueError(f"Unknown source_type: {source_type!r}")

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError(f"Video not found at {output_path} after download")

    logger.info(
        "download: done",
        path=str(output_path),
        size_mb=round(output_path.stat().st_size / 1_048_576, 2),
    )
    return str(output_path)
