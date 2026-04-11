"""LangGraph node: execute TikTok publishing with retry logic."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select

from app.agents.publish_post.constants import RETRY_DELAYS_SECONDS
from app.agents.publish_post.state import PublishPostState
from app.agents.publish_post.token_manager import get_valid_token
from app.clients.tiktok_client import TikTokClient, get_tiktok_client
from app.config import get_settings
from app.core.exceptions import ApiError
from app.db.models.content_post import ContentPost
from app.db.models.enums import ContentStatus, PublishStatus
from app.db.models.published_post import PublishedPost
from app.db.session import async_session_factory

logger = structlog.get_logger()


async def _execute_publish(
    tiktok: TikTokClient,
    access_token: str,
    image_url: str,
    caption: str,
    title: str,
    privacy_level: str,
) -> tuple[str, str, str | None]:
    """Execute the TikTok publish flow: creator info → init post → poll status.

    Returns (publish_id, status, platform_post_id | None).
    """
    # Step 1: Query creator info
    creator_info = await tiktok.query_creator_info(access_token)

    # Validate privacy level is allowed
    if privacy_level not in creator_info.privacy_level_options:
        available = creator_info.privacy_level_options
        logger.warning(
            "publish: requested privacy not available, falling back",
            requested=privacy_level,
            available=available,
        )
        privacy_level = available[0] if available else "SELF_ONLY"

    # Step 2: Initialize photo post
    publish_id = await tiktok.init_photo_post(
        access_token=access_token,
        photo_urls=[image_url],
        title=title,
        description=caption,
        privacy_level=privacy_level,
    )

    # Step 3: Poll publish status
    result = await tiktok.poll_publish_status(access_token, publish_id)

    return result.publish_id, result.status, result.platform_post_id


async def publish_node(state: PublishPostState) -> dict:
    """Execute TikTok publishing with retry logic.

    Retries up to PUBLISH_MAX_RETRIES times with exponential backoff
    for retryable errors. Non-retryable errors fail immediately.
    """
    settings = get_settings()
    tiktok = get_tiktok_client()
    published_post_id = state["published_post_id"]
    content_post_id = state["content_post_id"]

    async with async_session_factory() as db:
        # Get fresh token (may refresh if expired)
        try:
            access_token, open_id = await get_valid_token(db)
        except ApiError as e:
            logger.error("publish: token error", error=str(e))
            return {
                "publish_status": "failed",
                "error": str(e),
            }
        await db.commit()

    # Build title from caption (first line, truncated)
    caption = state["assembled_caption"]
    title = caption.split("\n")[0][:150]

    last_error = ""
    final_publish_id = ""
    final_platform_post_id = ""

    for attempt in range(settings.PUBLISH_MAX_RETRIES + 1):
        try:
            logger.info(
                "publish: attempting",
                published_post_id=published_post_id,
                attempt=attempt + 1,
            )

            publish_id, status, platform_post_id = await _execute_publish(
                tiktok=tiktok,
                access_token=access_token,
                image_url=state["image_public_url"],
                caption=caption,
                title=title,
                privacy_level=state["privacy_level"],
            )

            final_publish_id = publish_id

            if status == "PUBLISH_COMPLETE":
                final_platform_post_id = platform_post_id or ""

                # Update DB: published_post + content_post
                async with async_session_factory() as db:
                    pub = (await db.execute(
                        select(PublishedPost).where(PublishedPost.id == uuid.UUID(published_post_id))
                    )).scalar_one_or_none()
                    if pub:
                        pub.status = PublishStatus.PUBLISHED
                        pub.tiktok_publish_id = publish_id
                        pub.platform_post_id = final_platform_post_id
                        pub.published_at = datetime.now(timezone.utc)
                        pub.retry_count = attempt

                    content = (await db.execute(
                        select(ContentPost).where(ContentPost.id == uuid.UUID(content_post_id))
                    )).scalar_one_or_none()
                    if content:
                        content.status = ContentStatus.PUBLISHED

                    await db.commit()

                logger.info(
                    "publish: success",
                    published_post_id=published_post_id,
                    platform_post_id=final_platform_post_id,
                )

                return {
                    "publish_status": "published",
                    "tiktok_publish_id": publish_id,
                    "platform_post_id": final_platform_post_id,
                    "error": "",
                }

            # FAILED status from polling
            last_error = f"TikTok publish failed: {platform_post_id or 'unknown reason'}"

            # Check if the failure reason from the poll result is non-retryable
            # The fail_reason is stored in platform_post_id field of PublishResult when status is FAILED
            # Actually let's check the tiktok client's result properly
            poll_result = await tiktok.poll_publish_status(access_token, publish_id)
            if not tiktok.is_retryable_error(poll_result.fail_reason):
                last_error = f"Non-retryable TikTok error: {poll_result.fail_reason}"
                logger.error("publish: non-retryable failure", error=last_error)
                break

        except ApiError as e:
            last_error = str(e)
            logger.warning(
                "publish: API error",
                attempt=attempt + 1,
                error=last_error,
            )

        except Exception as e:
            last_error = str(e)
            logger.error(
                "publish: unexpected error",
                attempt=attempt + 1,
                error=last_error,
            )

        # Wait before retry (if not last attempt)
        if attempt < settings.PUBLISH_MAX_RETRIES:
            delay = RETRY_DELAYS_SECONDS[min(attempt, len(RETRY_DELAYS_SECONDS) - 1)]
            logger.info("publish: retrying after delay", delay_seconds=delay)
            await asyncio.sleep(delay)

    # All retries exhausted — mark as failed
    async with async_session_factory() as db:
        pub = (await db.execute(
            select(PublishedPost).where(PublishedPost.id == uuid.UUID(published_post_id))
        )).scalar_one_or_none()
        if pub:
            pub.status = PublishStatus.FAILED
            pub.error_message = last_error
            pub.retry_count = settings.PUBLISH_MAX_RETRIES
            if final_publish_id:
                pub.tiktok_publish_id = final_publish_id
            await db.commit()

    logger.error(
        "publish: all retries exhausted",
        published_post_id=published_post_id,
        error=last_error,
    )

    return {
        "publish_status": "failed",
        "tiktok_publish_id": final_publish_id,
        "error": last_error,
    }
