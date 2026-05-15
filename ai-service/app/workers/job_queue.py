"""Enqueue video processing jobs to the arq video-processing queue."""
from __future__ import annotations

import structlog
from arq import create_pool
from arq.connections import RedisSettings

from app.config import get_settings

logger = structlog.get_logger()

_QUEUE_NAME = "video-processing"


def _redis_settings() -> RedisSettings:
    settings = get_settings()
    # arq RedisSettings accepts a URL string directly
    return RedisSettings.from_dsn(settings.REDIS_URL)


async def enqueue_video_task(
    task_id: str,
    user_id: str,
    source_type: str,
    source_ref: str,
    font_id: str = "",
    caption_template_id: str = "",
    max_clips: int = 5,
) -> str:
    """Enqueue a video processing job. Returns the arq job ID."""
    pool = await create_pool(_redis_settings())
    job = await pool.enqueue_job(
        "process_video_task",
        task_id,
        user_id,
        source_type,
        source_ref,
        font_id,
        caption_template_id,
        max_clips,
        _queue_name=_QUEUE_NAME,
    )
    await pool.aclose()

    job_id = job.job_id if job else "unknown"
    logger.info(
        "job_queue: enqueued",
        task_id=task_id,
        job_id=job_id,
        queue=_QUEUE_NAME,
    )
    return job_id
