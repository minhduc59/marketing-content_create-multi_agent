"""LangGraph node: orchestrates the full video clipping pipeline."""
from __future__ import annotations

import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

import structlog
from sqlalchemy import select

from app.agents.video_clipper.state import VideoClipperState
from app.agents.video_clipper.steps import (
    caption,
    cut,
    download,
    persist,
    select as select_step,
    transcribe,
    upload,
)
from app.core.progress import publish_video_progress
from app.db.models.enums import VideoTaskStatus
from app.db.models.video_task import VideoTask
from app.db.session import async_session_factory
from app.utils.async_helpers import run_in_thread

logger = structlog.get_logger()


async def _update_task(task_id: str, status: str, progress: int, message: str = "") -> None:
    async with async_session_factory() as db:
        result = await db.execute(select(VideoTask).where(VideoTask.id == uuid.UUID(task_id)))
        task = result.scalar_one_or_none()
        if task:
            task.status = status
            task.progress = progress
            task.progress_message = message
            if status == VideoTaskStatus.DOWNLOADING.value:
                task.started_at = datetime.now(timezone.utc)
        await db.commit()


async def video_clipper_node(state: VideoClipperState) -> dict:
    """Single LangGraph node that runs the entire video clipping pipeline.

    Steps:
      1. Download / retrieve source video
      2. Transcribe with AssemblyAI
      3. LLM segment selection
      4. ffmpeg cut + 9:16 reframe
      5. ASS subtitle burn
      6. Cloudinary upload
      7. DB persist (VideoClip rows + task completion)
    """
    task_id = state["task_id"]
    user_id = state["user_id"]

    from app.config import get_settings
    settings = get_settings()
    task_temp_dir = str(Path(settings.VIDEO_TEMP_DIR) / task_id)
    Path(task_temp_dir).mkdir(parents=True, exist_ok=True)

    try:
        # ── Step 1: Download ────────────────────────────────────────────────
        await _update_task(task_id, VideoTaskStatus.DOWNLOADING.value, 5, "Downloading video…")
        await publish_video_progress(task_id, "downloading", 5)
        local_video_path = await run_in_thread(
            download.run, task_temp_dir, state["source_type"], state["source_ref"]
        )

        # ── Step 2: Transcribe ──────────────────────────────────────────────
        await _update_task(task_id, VideoTaskStatus.TRANSCRIBING.value, 20, "Transcribing audio…")
        await publish_video_progress(task_id, "transcribing", 20)
        transcript_data = await run_in_thread(transcribe.run, local_video_path)

        # ── Step 3: LLM segment selection ──────────────────────────────────
        await _update_task(task_id, VideoTaskStatus.ANALYZING.value, 40, "Analyzing content…")
        await publish_video_progress(task_id, "analyzing", 40)
        selected_segments = await select_step.run(transcript_data, state["max_clips"])

        # ── Step 4: Cut + reframe ───────────────────────────────────────────
        await _update_task(task_id, VideoTaskStatus.CLIPPING.value, 55, "Cutting clips…")
        await publish_video_progress(task_id, "clipping", 55)
        framed_paths = await run_in_thread(
            cut.run, local_video_path, task_temp_dir, selected_segments
        )

        # ── Step 5: Caption ─────────────────────────────────────────────────
        await _update_task(task_id, VideoTaskStatus.CAPTIONING.value, 70, "Adding captions…")
        await publish_video_progress(task_id, "captioning", 70)
        clip_local_paths = await run_in_thread(
            caption.run, framed_paths, task_temp_dir, selected_segments, transcript_data
        )

        # ── Step 6: Upload ──────────────────────────────────────────────────
        await _update_task(task_id, VideoTaskStatus.UPLOADING.value, 85, "Uploading clips…")
        await publish_video_progress(task_id, "uploading", 85)
        cloudinary_objects = await run_in_thread(
            upload.run, clip_local_paths, task_id, user_id
        )

        # ── Step 7: Persist ─────────────────────────────────────────────────
        clip_ids = await persist.run(task_id, selected_segments, cloudinary_objects)

        await publish_video_progress(task_id, "completed", 100, status="completed")
        logger.info("video_clipper_node: completed", task_id=task_id, clips=len(clip_ids))

        return {
            "task_temp_dir": task_temp_dir,
            "local_video_path": local_video_path,
            "transcript_data": transcript_data,
            "selected_segments": selected_segments,
            "clip_local_paths": clip_local_paths,
            "clip_cloudinary_objects": cloudinary_objects,
            "clip_ids": clip_ids,
            "errors": [],
        }

    except Exception as exc:
        error_msg = str(exc)
        logger.error("video_clipper_node: failed", task_id=task_id, error=error_msg)
        try:
            await publish_video_progress(task_id, "error", 0, status="error", message=error_msg)
            await _update_task(task_id, VideoTaskStatus.ERROR.value, 0, error_msg)
        except Exception:
            pass
        raise

    finally:
        shutil.rmtree(task_temp_dir, ignore_errors=True)
        logger.info("video_clipper_node: temp dir cleaned up", task_id=task_id)
