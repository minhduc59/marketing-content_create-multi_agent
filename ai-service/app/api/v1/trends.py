import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.schemas.trend import (
    TrendDetail,
    TrendFilter,
    TrendListResponse,
    TrendSummary,
)
from app.db.models import Platform, Sentiment, TrendItem, TrendLifecycle
from app.dependencies import get_session

router = APIRouter()


@router.get("", response_model=TrendListResponse)
async def list_trends(
    platform: Platform | None = None,
    category: str | None = None,
    sentiment: Sentiment | None = None,
    lifecycle: TrendLifecycle | None = None,
    min_score: float | None = Query(default=None, ge=0, le=10),
    sort_by: str = Query(default="relevance_score", pattern="^(relevance_score|views|discovered_at)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    query = select(TrendItem)

    if platform:
        query = query.where(TrendItem.platform == platform)
    if category:
        query = query.where(TrendItem.category == category)
    if sentiment:
        query = query.where(TrendItem.sentiment == sentiment)
    if lifecycle:
        query = query.where(TrendItem.lifecycle == lifecycle)
    if min_score is not None:
        query = query.where(TrendItem.relevance_score >= min_score)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Sort
    sort_column = getattr(TrendItem, sort_by, TrendItem.relevance_score)
    query = query.order_by(desc(sort_column))

    # Paginate
    query = query.offset((page - 1) * limit).limit(limit)

    result = await db.execute(query)
    items = result.scalars().all()

    return TrendListResponse(
        items=[TrendSummary.model_validate(item) for item in items],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/top", response_model=list[TrendSummary])
async def get_top_trends(
    limit: int = Query(default=20, ge=1, le=100),
    timeframe: str = Query(default="24h", pattern="^(24h|7d|30d)$"),
    db: AsyncSession = Depends(get_session),
):
    hours_map = {"24h": 24, "7d": 168, "30d": 720}
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_map[timeframe])

    query = (
        select(TrendItem)
        .where(TrendItem.discovered_at >= cutoff)
        .order_by(desc(TrendItem.relevance_score))
        .limit(limit)
    )

    result = await db.execute(query)
    items = result.scalars().all()
    return [TrendSummary.model_validate(item) for item in items]


@router.get("/{trend_id}", response_model=TrendDetail)
async def get_trend_detail(
    trend_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
):
    query = (
        select(TrendItem)
        .options(selectinload(TrendItem.comments))
        .where(TrendItem.id == trend_id)
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Trend not found")

    return TrendDetail.model_validate(item)
