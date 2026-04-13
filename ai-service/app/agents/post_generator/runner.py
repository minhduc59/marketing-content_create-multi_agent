"""Post Generation Agent — entry point for running the pipeline."""

import time
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select

from app.agents.post_generator.graph import build_post_gen_graph
from app.agents.post_generator.state import PostGenState
from app.db.models import ScanRun, ScanStatus
from app.db.session import async_session_factory

logger = structlog.get_logger()


async def run_post_generation(
    scan_run_id: str,
    options: dict | None = None,
    user_id: str | None = None,
) -> dict:
    """Execute the post generation pipeline for a completed scan run.

    Args:
        scan_run_id: UUID of the completed scan run to generate posts for.
        options: Optional configuration:
            - num_posts: Number of posts to generate (default 3, max 10)
            - formats: List of allowed post formats (default: all)
        user_id: UUID of the user triggering generation — propagated
            through LangGraph state so persisted ContentPost rows carry
            the owning user.

    Returns:
        The final_output dict containing content_plan, posts, and strategy_update.

    Raises:
        ValueError: If scan_run_id is invalid or scan run is not completed.
    """
    start_time = time.time()
    options = options or {}

    logger.info(
        "post_generation: starting",
        scan_run_id=scan_run_id,
        user_id=user_id,
        options=options,
    )

    # Validate scan run exists and is completed
    async with async_session_factory() as db:
        result = await db.execute(
            select(ScanRun).where(ScanRun.id == uuid.UUID(scan_run_id))
        )
        scan_run = result.scalar_one_or_none()

        if not scan_run:
            raise ValueError(f"Scan run not found: {scan_run_id}")

        if scan_run.status not in (ScanStatus.COMPLETED, ScanStatus.PARTIAL):
            raise ValueError(
                f"Scan run {scan_run_id} is not completed "
                f"(status: {scan_run.status.value})"
            )

    # Build and run the graph
    graph = build_post_gen_graph()

    initial_state = PostGenState(
        scan_run_id=scan_run_id,
        user_id=user_id,
        options={
            "num_posts": min(options.get("num_posts", 3), 10),
            "formats": options.get("formats"),
        },
        trend_report_md="",
        analyzed_trends=[],
        strategy={},
        content_plan=[],
        generated_posts=[],
        review_results=[],
        revision_count=0,
        posts_to_revise=[],
        final_output={},
        saved_file_paths=[],
        errors=[],
    )

    try:
        final_state = await graph.ainvoke(initial_state)

        duration_ms = int((time.time() - start_time) * 1000)
        final_output = final_state.get("final_output", {})
        errors = final_state.get("errors", [])

        total_posts = len(final_output.get("posts", []))
        logger.info(
            "post_generation: completed",
            scan_run_id=scan_run_id,
            duration_ms=duration_ms,
            total_posts=total_posts,
            errors=len(errors),
        )

        return final_output

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(
            "post_generation: failed",
            scan_run_id=scan_run_id,
            duration_ms=duration_ms,
            error=str(e),
        )
        raise
