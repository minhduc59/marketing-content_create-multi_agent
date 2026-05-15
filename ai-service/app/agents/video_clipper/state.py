"""LangGraph state for the Video Clipper Agent pipeline."""
from __future__ import annotations

from typing import TypedDict


class VideoClipperState(TypedDict):
    # Input
    task_id: str
    user_id: str
    source_type: str         # "url" | "upload"
    source_ref: str          # YouTube URL or Cloudinary public_id
    font_id: str             # "" means use default
    caption_template_id: str  # "" means use default
    max_clips: int

    # Runtime — set during execution
    task_temp_dir: str        # e.g. /tmp/marketing-video-clipper/{task_id}
    local_video_path: str     # local path after download / retrieval
    transcript_data: dict     # {words:[{text,start,end,confidence}], text:str, duration_ms:int}
    selected_segments: list[dict]  # [{start_ms,end_ms,text,score,rationale,virality:{...}}]
    clip_local_paths: list[str]    # per-clip final local paths (post-caption)
    clip_cloudinary_objects: list[dict]  # [{url,public_id}] per clip after upload

    # Output
    clip_ids: list[str]   # DB UUIDs of created VideoClip rows
    errors: list[str]
