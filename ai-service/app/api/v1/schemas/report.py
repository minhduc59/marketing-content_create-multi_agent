import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ContentAngle(BaseModel):
    trend_title: str
    platform: str = Field(description="Target platform: facebook, youtube, tiktok")
    content_type: str = Field(description="Content format: post, reel_script, carousel, story, short_video, thread")
    writing_style: str = Field(description="Writing style: trendy, professional, storytelling, educational, humorous")
    hook: str = Field(description="Opening line / attention grabber ready to use")
    estimated_engagement: str = Field(description="Expected engagement level: high, medium, low")
    rationale: str = Field(description="Why this content angle works")


class TrendRankEntry(BaseModel):
    rank: int
    title: str
    platform: str
    category: str
    relevance_score: float
    sentiment: str
    lifecycle: str


class ReportListItem(BaseModel):
    scan_run_id: uuid.UUID
    generated_at: datetime
    report_file_path: str
    total_items_found: int
    platforms_completed: list[str] = []


class ReportListResponse(BaseModel):
    items: list[ReportListItem]
    total: int


class ReportContentResponse(BaseModel):
    scan_run_id: uuid.UUID
    content: str = Field(description="Full markdown report content")
    report_file_path: str
    generated_at: datetime


class ReportSummaryResponse(BaseModel):
    scan_run_id: str
    executive_summary: str
    total_trends: int
    platforms_covered: list[str]
    stats: dict = {}
    top_trends: list[TrendRankEntry] = []
    content_angles: list[ContentAngle] = []
    cross_platform_groups: list[dict] = []
    generated_at: str
