import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import VideoTaskStatus


class VideoTask(Base):
    __tablename__ = "video_tasks"
    __table_args__ = {"schema": "ai"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )

    # Source
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'url' | 'upload'
    source_ref: Mapped[str] = mapped_column(Text, nullable=False)          # URL or Cloudinary public_id

    # Processing config
    font_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai.brand_fonts.id"), nullable=True
    )
    caption_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai.caption_templates.id"), nullable=True
    )
    max_clips: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=5)

    # Status tracking
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=VideoTaskStatus.QUEUED.value, index=True
    )
    progress: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0", default=0)
    progress_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    temp_dir: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional linkage for analytics
    scan_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ai.scan_runs.id"), nullable=True
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, onupdate=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    font = relationship("BrandFont", back_populates="video_tasks")
    caption_template = relationship("CaptionTemplate", back_populates="video_tasks")
    clips = relationship("VideoClip", back_populates="task", cascade="all, delete-orphan")
