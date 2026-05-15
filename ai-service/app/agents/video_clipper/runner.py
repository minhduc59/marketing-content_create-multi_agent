"""Entry point for the Video Clipper Agent pipeline."""
from __future__ import annotations

import structlog

from app.agents.video_clipper.graph import build_video_clipper_graph
from app.agents.video_clipper.state import VideoClipperState

logger = structlog.get_logger()


async def run_video_clipper(
    task_id: str,
    user_id: str,
    source_type: str,
    source_ref: str,
    font_id: str = "",
    caption_template_id: str = "",
    max_clips: int = 5,
) -> dict:
    """Run the Video Clipper Agent pipeline.

    Args:
        task_id: UUID of the VideoTask row (already created by the API handler).
        user_id: UUID of the requesting user (used for Cloudinary path namespacing).
        source_type: "url" (YouTube) or "upload" (Cloudinary public_id).
        source_ref: YouTube URL or Cloudinary public_id of the uploaded video.
        font_id: Optional BrandFont UUID to apply. "" means default (Arial).
        caption_template_id: Optional CaptionTemplate UUID. "" means built-in default.
        max_clips: Maximum number of clips to generate (1–10).

    Returns:
        {"task_id": str, "clip_ids": list[str], "error": str}
    """
    initial_state = VideoClipperState(
        task_id=task_id,
        user_id=user_id,
        source_type=source_type,
        source_ref=source_ref,
        font_id=font_id,
        caption_template_id=caption_template_id,
        max_clips=max_clips,
        task_temp_dir="",
        local_video_path="",
        transcript_data={},
        selected_segments=[],
        clip_local_paths=[],
        clip_cloudinary_objects=[],
        clip_ids=[],
        errors=[],
    )

    logger.info(
        "video_clipper: starting",
        task_id=task_id,
        source_type=source_type,
        max_clips=max_clips,
    )
    graph = build_video_clipper_graph()
    result = await graph.ainvoke(initial_state)

    clip_ids: list[str] = result.get("clip_ids", [])
    logger.info("video_clipper: finished", task_id=task_id, clip_count=len(clip_ids))

    return {
        "task_id": task_id,
        "clip_ids": clip_ids,
        "error": "",
    }
