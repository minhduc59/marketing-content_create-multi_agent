"""LangGraph node: schedule a publish job or proceed to immediate publish."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select

from app.agents.publish_post.state import PublishPostState
from app.db.models.published_post import PublishedPost
from app.db.models.enums import PublishStatus
from app.db.session import async_session_factory

logger = structlog.get_logger()

# If the scheduled time is within this window, publish immediately
IMMEDIATE_THRESHOLD = timedelta(minutes=2)


async def scheduler_node(state: PublishPostState) -> dict:
    """Decide whether to publish now or schedule for later.

    If `scheduled_time_override` is provided, use that time.
    Otherwise, use the golden hour result.

    If the target time is within 2 minutes, proceed to immediate publish.
    Otherwise, create an APScheduler delayed job.
    """
    now = datetime.now(timezone.utc)
    published_post_id = state["published_post_id"]

    # Determine target publish time
    if state.get("scheduled_time_override"):
        target_time = datetime.fromisoformat(state["scheduled_time_override"])
        if target_time.tzinfo is None:
            target_time = target_time.replace(tzinfo=timezone.utc)
        golden_hour_slot = "manual"
    else:
        gh = state.get("golden_hour_result", {})
        target_time_str = gh.get("scheduled_at", "")
        if target_time_str:
            target_time = datetime.fromisoformat(target_time_str)
            if target_time.tzinfo is None:
                target_time = target_time.replace(tzinfo=timezone.utc)
        else:
            target_time = now  # No golden hour data — publish immediately
        golden_hour_slot = gh.get("selected_slot", {}).get("slot_time", "")

    time_until = target_time - now

    # Publish immediately if within threshold
    if time_until <= IMMEDIATE_THRESHOLD:
        logger.info(
            "scheduler: publishing immediately",
            published_post_id=published_post_id,
            time_until_seconds=time_until.total_seconds(),
        )
        return {"publish_status": "publish_now"}

    # Schedule for later via APScheduler
    logger.info(
        "scheduler: scheduling for later",
        published_post_id=published_post_id,
        target_time=str(target_time),
        golden_hour_slot=golden_hour_slot,
    )

    # Import here to avoid circular imports with FastAPI app
    from app.agents.publish_post.runner import run_publish_pipeline_job

    from app.main import app
    scheduler = app.state.scheduler

    job = scheduler.add_job(
        run_publish_pipeline_job,
        "date",
        run_date=target_time,
        args=[state["content_post_id"]],
        id=f"publish_{published_post_id}",
        replace_existing=True,
    )

    # Update DB record with scheduling info
    async with async_session_factory() as db:
        result = await db.execute(
            select(PublishedPost).where(
                PublishedPost.id == published_post_id
            )
        )
        pub_post = result.scalar_one_or_none()
        if pub_post:
            pub_post.scheduled_at = target_time
            pub_post.golden_hour_slot = golden_hour_slot
            pub_post.scheduler_job_id = job.id
            pub_post.status = PublishStatus.PENDING
            await db.commit()

    return {"publish_status": "scheduled"}
