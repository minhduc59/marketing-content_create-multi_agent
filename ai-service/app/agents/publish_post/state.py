"""LangGraph state definition for the Publish Post Agent."""

from typing import TypedDict


class PublishPostState(TypedDict):
    # Input
    content_post_id: str
    publish_mode: str               # "auto" | "manual"
    scheduled_time_override: str     # ISO timestamp or "" for auto
    privacy_level: str

    # Resolved during execution
    published_post_id: str          # DB record ID created at start
    access_token: str
    tiktok_open_id: str
    image_public_url: str
    assembled_caption: str

    # Golden hour
    golden_hour_result: dict        # GoldenHourResult as dict

    # TikTok API results
    creator_info: dict
    tiktok_publish_id: str          # from /content/init
    platform_post_id: str           # from poll status (after moderation)

    # Final
    publish_status: str             # "published" | "failed" | "scheduled"
    error: str
