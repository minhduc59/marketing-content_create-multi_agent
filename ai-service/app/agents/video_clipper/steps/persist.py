"""Step 7: Persist VideoClip rows to the database and mark the task completed."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select

from app.db.models.enums import VideoTaskStatus
from app.db.models.video_clip import VideoClip
from app.db.models.video_task import VideoTask
from app.db.session import async_session_factory

logger = structlog.get_logger()


async def run(
    task_id: str,
    selected_segments: list[dict],
    cloudinary_objects: list[dict],
) -> list[str]:
    """Create VideoClip rows and advance the VideoTask to 'completed'.

    Returns list of clip UUIDs as strings.
    """
    clip_ids: list[str] = []
    task_uuid = uuid.UUID(task_id)

    async with async_session_factory() as db:
        for i, (seg, obj) in enumerate(zip(selected_segments, cloudinary_objects)):
            duration_s = (seg["end_ms"] - seg["start_ms"]) / 1000.0
            virality: dict = seg.get("virality") or {}

            clip = VideoClip(
                task_id=task_uuid,
                clip_index=i,
                storage_url=obj["url"],
                storage_public_id=obj["public_id"],
                duration_seconds=duration_s,
                start_ms=seg["start_ms"],
                end_ms=seg["end_ms"],
                transcript_segment=seg.get("text", ""),
                llm_score=seg.get("score"),
                llm_rationale=seg.get("rationale", ""),
                hook_score=virality.get("hook_score"),
                engagement_score=virality.get("engagement_score"),
            )
            db.add(clip)
            await db.flush()
            clip_ids.append(str(clip.id))

        # Advance task status
        task_result = await db.execute(
            select(VideoTask).where(VideoTask.id == task_uuid)
        )
        task = task_result.scalar_one_or_none()
        if task:
            task.status = VideoTaskStatus.COMPLETED.value
            task.progress = 100
            task.progress_message = f"{len(clip_ids)} clips ready for review"
            task.completed_at = datetime.now(timezone.utc)

        await db.commit()

    logger.info("persist: done", task_id=task_id, clips=len(clip_ids))
    return clip_ids
