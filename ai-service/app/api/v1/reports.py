import asyncio
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.report import (
    ReportContentResponse,
    ReportListItem,
    ReportListResponse,
    ReportSummaryResponse,
)
from app.db.models import ScanRun, ScanStatus
from app.dependencies import get_session

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # ai-service/


def _resolve_report_path(relative_path: str) -> Path:
    """Resolve a relative report path to an absolute path."""
    return BASE_DIR / relative_path


@router.get(
    "",
    response_model=ReportListResponse,
    summary="List generated reports",
    description="Returns a paginated list of scan runs that have generated reports.",
)
async def list_reports(
    page: int = Query(default=1, ge=1, description="Page number"),
    limit: int = Query(default=20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
):
    query = (
        select(ScanRun)
        .where(ScanRun.report_file_path.isnot(None))
        .where(ScanRun.status.in_([ScanStatus.COMPLETED, ScanStatus.PARTIAL]))
        .order_by(desc(ScanRun.completed_at))
    )

    # Count
    from sqlalchemy import func
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    scan_runs = result.scalars().all()

    items = [
        ReportListItem(
            scan_run_id=run.id,
            generated_at=run.completed_at or run.started_at,
            report_file_path=run.report_file_path,
            total_items_found=run.total_items_found,
            platforms_completed=run.platforms_completed or [],
        )
        for run in scan_runs
    ]

    return ReportListResponse(items=items, total=total)


@router.get(
    "/{scan_run_id}",
    response_model=ReportContentResponse,
    summary="Get full report",
    description="Returns the full Markdown report content for a given scan run.",
    responses={404: {"description": "Report not found"}},
)
async def get_report(
    scan_run_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
):
    result = await db.execute(
        select(ScanRun).where(ScanRun.id == scan_run_id)
    )
    scan_run = result.scalar_one_or_none()

    if not scan_run or not scan_run.report_file_path:
        raise HTTPException(status_code=404, detail="Report not found")

    report_path = _resolve_report_path(scan_run.report_file_path)
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Report file not found on disk")

    content = await asyncio.to_thread(report_path.read_text, "utf-8")

    return ReportContentResponse(
        scan_run_id=scan_run.id,
        content=content,
        report_file_path=scan_run.report_file_path,
        generated_at=scan_run.completed_at or scan_run.started_at,
    )


@router.get(
    "/{scan_run_id}/summary",
    response_model=ReportSummaryResponse,
    summary="Get report summary",
    description="Returns a structured JSON summary with trend rankings and content angle suggestions.",
    responses={404: {"description": "Report not found"}},
)
async def get_report_summary(
    scan_run_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
):
    result = await db.execute(
        select(ScanRun).where(ScanRun.id == scan_run_id)
    )
    scan_run = result.scalar_one_or_none()

    if not scan_run or not scan_run.report_file_path:
        raise HTTPException(status_code=404, detail="Report not found")

    # Derive summary JSON path from report path
    summary_path = _resolve_report_path(
        scan_run.report_file_path.replace("_report.md", "_summary.json")
    )

    if not summary_path.exists():
        raise HTTPException(status_code=404, detail="Report summary file not found")

    raw = await asyncio.to_thread(summary_path.read_text, "utf-8")
    summary_data = json.loads(raw)

    return ReportSummaryResponse(**summary_data)
