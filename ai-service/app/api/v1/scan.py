import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.scan import ScanRequest, ScanResponse, ScanStatusResponse
from app.db.models import ScanRun, ScanStatus
from app.dependencies import get_session

router = APIRouter()


@router.post(
    "",
    status_code=202,
    response_model=ScanResponse,
    summary="Trigger a trend scan",
    description=(
        "Start an async HackerNews technology trend scan. "
        "Returns immediately with a `scan_id` and `pending` status. "
        "Poll `GET /api/v1/scan/{scan_id}/status` to track progress.\n\n"
        "**Platform:** `hackernews`\n\n"
        "**Options:**\n"
        "- `max_items_per_platform` — 1–200 items to fetch (default 50)\n"
        "- `include_comments` — fetch top comments for each item (default true)"
    ),
    responses={
        202: {"description": "Scan accepted and queued"},
        422: {"description": "Invalid request body"},
    },
)
async def trigger_scan(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
):
    scan_run = ScanRun(
        platforms_requested=[p.value for p in request.platforms],
        status=ScanStatus.PENDING,
    )
    db.add(scan_run)
    await db.commit()
    await db.refresh(scan_run)

    # Launch the LangGraph scan in background
    from app.agents.supervisor import run_scan

    background_tasks.add_task(run_scan, str(scan_run.id), request)

    return ScanResponse(
        scan_id=scan_run.id,
        status=scan_run.status,
        platforms=request.platforms,
        created_at=scan_run.started_at or datetime.now(timezone.utc),
    )


@router.get(
    "/{scan_id}/status",
    response_model=ScanStatusResponse,
    summary="Get scan status",
    description=(
        "Returns the current status of a scan run.\n\n"
        "**Status values:**\n"
        "- `pending` — queued, not yet started\n"
        "- `running` — actively scanning platforms\n"
        "- `completed` — all platforms succeeded\n"
        "- `partial` — some platforms failed, some succeeded\n"
        "- `failed` — all platforms failed\n\n"
        "Check `platforms_failed` for per-platform error messages."
    ),
    responses={
        200: {"description": "Scan status"},
        404: {"description": "Scan not found"},
    },
)
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
