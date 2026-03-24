import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.db.models.enums import Platform, ScanStatus


class ScanOptions(BaseModel):
    max_items_per_platform: int = Field(default=50, ge=1, le=200)
    include_comments: bool = True
    region: str = "global"


class ScanRequest(BaseModel):
    platforms: list[Platform] = Field(
        default=[
            Platform.YOUTUBE,
            Platform.TIKTOK,
            Platform.TWITTER,
            Platform.INSTAGRAM,
            Platform.GOOGLE_TRENDS,
        ]
    )
    options: ScanOptions = Field(default_factory=ScanOptions)


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
