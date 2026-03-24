import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.scan import ScanRequest, ScanResponse, ScanStatusResponse
from app.db.models import ScanRun, ScanStatus
from app.dependencies import get_redis, get_session

router = APIRouter()


@router.post("", status_code=202, response_model=ScanResponse)
async def trigger_scan(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
    redis: Redis = Depends(get_redis),
):
    scan_run = ScanRun(
        platforms_requested=[p.value for p in request.platforms],
        status=ScanStatus.PENDING,
    )
    db.add(scan_run)
    await db.flush()

    # Launch the LangGraph scan in background
    from app.agents.supervisor import run_scan

    background_tasks.add_task(run_scan, str(scan_run.id), request, db, redis)

    return ScanResponse(
        scan_id=scan_run.id,
        status=scan_run.status,
        platforms=request.platforms,
        created_at=scan_run.started_at or datetime.now(timezone.utc),
    )


@router.get("/{scan_id}/status", response_model=ScanStatusResponse)
async def get_scan_status(
    scan_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
):
    result = await db.execute(select(ScanRun).where(ScanRun.id == scan_id))
    scan_run = result.scalar_one_or_none()
    if not scan_run:
        raise HTTPException(status_code=404, detail="Scan not found")

    return ScanStatusResponse(
        scan_id=scan_run.id,
        status=scan_run.status,
        platforms_completed=scan_run.platforms_completed or [],
        platforms_failed=scan_run.platforms_failed or {},
        total_items_found=scan_run.total_items_found or 0,
        started_at=scan_run.started_at,
        completed_at=scan_run.completed_at,
        duration_ms=scan_run.duration_ms,
        error=scan_run.error,
    )
