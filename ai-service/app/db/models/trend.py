import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import Platform, Sentiment, TrendLifecycle


class TrendItem(Base):
    __tablename__ = "trend_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scan_run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scan_runs.id"), index=True
    )

    # Core
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    platform: Mapped[Platform] = mapped_column(Enum(Platform))

    # Tags
    tags: Mapped[list] = mapped_column(JSON, default=list)
    hashtags: Mapped[list] = mapped_column(JSON, default=list)

    # Engagement
    views: Mapped[int | None] = mapped_column(Integer, nullable=True)
    likes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comments_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shares: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trending_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Media
    thumbnail_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    image_urls: Mapped[list] = mapped_column(JSON, default=list)

    # Author
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    author_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    author_followers: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # AI analysis (populated by AnalyzerAgent)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sentiment: Mapped[Sentiment | None] = mapped_column(Enum(Sentiment), nullable=True)
    lifecycle: Mapped[TrendLifecycle | None] = mapped_column(
        Enum(TrendLifecycle), nullable=True
    )
    relevance_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    related_topics: Mapped[list] = mapped_column(JSON, default=list)

    # Cross-platform dedup
    dedup_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    cross_platform_ids: Mapped[list] = mapped_column(JSON, default=list)

    # Raw API response
    raw_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Timestamps
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    scan_run = relationship("ScanRun", back_populates="trend_items")
    comments: Mapped[list["TrendComment"]] = relationship(
        back_populates="trend_item", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_trend_items_platform_category", "platform", "category"),
        Index("ix_trend_items_discovered", "discovered_at"),
        Index("ix_trend_items_score", "relevance_score"),
    )
