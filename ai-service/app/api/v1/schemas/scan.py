import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.db.models.enums import Platform, ScanStatus


class ScanOptions(BaseModel):
    max_items_per_platform: int = Field(default=50, ge=1, le=200, description="Max items to fetch per platform (1–200)")
    include_comments: bool = Field(default=True, description="Whether to fetch top comments for each item")
    region: str = Field(default="global", description="ISO region code, e.g. US, VN, global")
    topics: list[str] | None = Field(
        default=None,
        description=(
            "Topics for google_news_topic scanner. "
            "E.g. TECHNOLOGY, HEALTH, BUSINESS, SCIENCE, EDUCATION. "
            "If not provided, defaults from config are used."
        ),
    )


class ScanRequest(BaseModel):
    platforms: list[Platform] = Field(
        default=[
            Platform.YOUTUBE,
            Platform.GOOGLE_NEWS,
            Platform.GOOGLE_NEWS_TOPIC,
        ],
        description="Platforms to scan",
    )
    options: ScanOptions = Field(default_factory=ScanOptions)

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "platforms": ["youtube", "google_news"],
                    "options": {"region": "US", "max_items_per_platform": 20},
                },
                {
                    "platforms": ["youtube"],
                    "options": {"region": "VN", "max_items_per_platform": 10, "include_comments": False},
                },
                {
                    "platforms": ["google_news"],
                    "options": {"region": "US", "max_items_per_platform": 50},
                },
                {
                    "platforms": ["google_news_topic"],
                    "options": {"topics": ["TECHNOLOGY", "HEALTH", "SCIENCE"]},
                },
            ]
        }
    }


class ScanResponse(BaseModel):
    scan_id: uuid.UUID
    status: ScanStatus
    platforms: list[Platform]
    created_at: datetime


class ScanStatusResponse(BaseModel):
    scan_id: uuid.UUID
    status: ScanStatus
    platforms_completed: list[str] = []
    platforms_failed: dict[str, str] = {}
    total_items_found: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    error: str | None = None
