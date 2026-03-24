import time
import uuid
from datetime import datetime, timezone

import structlog
from langgraph.constants import Send
from langgraph.graph import END, START, StateGraph
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.analyzer import analyzer_node
from app.agents.scanners.google_trends import GoogleTrendsScannerNode
from app.agents.scanners.instagram import InstagramScannerNode
from app.agents.scanners.tiktok import TikTokScannerNode
from app.agents.scanners.twitter import TwitterScannerNode
from app.agents.scanners.youtube import YouTubeScannerNode
from app.agents.state import TrendScanState
from app.api.v1.schemas.scan import ScanRequest
from app.core.cache import Cache
from app.core.rate_limiter import RateLimiter
from app.db.models import ScanRun, ScanStatus, TrendComment, TrendItem
from app.db.session import async_session_factory

logger = structlog.get_logger()

# Scanner node name -> platform mapping
SCANNER_MAP = {
    "youtube": "youtube_scanner",
    "tiktok": "tiktok_scanner",
    "twitter": "twitter_scanner",
    "instagram": "instagram_scanner",
    "google_trends": "google_trends_scanner",
}


def build_trend_scan_graph(rate_limiter: RateLimiter, cache: Cache) -> StateGraph:
    """Build and compile the LangGraph trend scanning graph."""

    # Create scanner node instances
    youtube_node = YouTubeScannerNode(rate_limiter, cache)
    tiktok_node = TikTokScannerNode(rate_limiter, cache)
    twitter_node = TwitterScannerNode(rate_limiter, cache)
    instagram_node = InstagramScannerNode(rate_limiter, cache)
    google_trends_node = GoogleTrendsScannerNode(rate_limiter, cache)

    graph = StateGraph(TrendScanState)

    # Add scanner nodes
    graph.add_node("youtube_scanner", youtube_node)
    graph.add_node("tiktok_scanner", tiktok_node)
    graph.add_node("twitter_scanner", twitter_node)
    graph.add_node("instagram_scanner", instagram_node)
    graph.add_node("google_trends_scanner", google_trends_node)

    # Add post-scan nodes
    graph.add_node("collect_results", collect_results_node)
    graph.add_node("analyzer", analyzer_node)
    graph.add_node("persist_results", persist_results_node)

    # Fan-out: START routes to requested scanner nodes in parallel
    def route_to_scanners(state: TrendScanState) -> list[Send]:
        platforms = state.get("platforms", [])
        sends = []
        for platform in platforms:
            node_name = SCANNER_MAP.get(platform)
            if node_name:
                sends.append(Send(node_name, state))
        if not sends:
            # Default: scan all
            for node_name in SCANNER_MAP.values():
                sends.append(Send(node_name, state))
        return sends

    graph.add_conditional_edges(START, route_to_scanners)

    # Fan-in: all scanners converge to collect_results
    for node_name in SCANNER_MAP.values():
        graph.add_edge(node_name, "collect_results")

    # Sequential: collect -> analyze -> persist
    graph.add_edge("collect_results", "analyzer")
    graph.add_edge("analyzer", "persist_results")
    graph.add_edge("persist_results", END)

    return graph.compile()


async def collect_results_node(state: TrendScanState) -> dict:
    """Merge and validate results from all scanners."""
    raw_results = state.get("raw_results", [])

    total_items = 0
    platforms_ok = []
    platforms_failed = {}

    for result in raw_results:
        if result["error"]:
            platforms_failed[result["platform"]] = result["error"]
        else:
            platforms_ok.append(result["platform"])
            total_items += len(result["items"])

    logger.info(
        "Collect results",
        total_items=total_items,
        platforms_ok=platforms_ok,
        platforms_failed=list(platforms_failed.keys()),
    )

    # State passes through; analyzer will read raw_results
    return {}


async def persist_results_node(state: TrendScanState) -> dict:
    """Write analyzed trends to the database."""
    scan_run_id = state.get("scan_run_id")
    analyzed = state.get("analyzed_trends", [])
    errors = state.get("errors", [])
    raw_results = state.get("raw_results", [])

    if not scan_run_id:
        logger.error("persist_results: no scan_run_id")
        return {}

    async with async_session_factory() as db:
        try:
            # Update ScanRun
            result = await db.execute(
                select(ScanRun).where(ScanRun.id == uuid.UUID(scan_run_id))
            )
            scan_run = result.scalar_one_or_none()

            if not scan_run:
                logger.error("persist_results: scan_run not found", scan_run_id=scan_run_id)
                return {}

            # Determine completed/failed platforms
            platforms_completed = []
            platforms_failed = {}
            for r in raw_results:
                if r["error"]:
                    platforms_failed[r["platform"]] = r["error"]
                else:
                    platforms_completed.append(r["platform"])

            scan_run.platforms_completed = platforms_completed
            scan_run.platforms_failed = platforms_failed
            scan_run.total_items_found = len(analyzed)
            scan_run.completed_at = datetime.now(timezone.utc)

            if platforms_failed and not platforms_completed:
                scan_run.status = ScanStatus.FAILED
            elif platforms_failed:
                scan_run.status = ScanStatus.PARTIAL
            else:
                scan_run.status = ScanStatus.COMPLETED

            # Persist trend items
            for item in analyzed:
                trend = TrendItem(
                    scan_run_id=uuid.UUID(scan_run_id),
                    title=item.get("title", "")[:500],
                    description=(item.get("description") or "")[:5000],
                    content_body=item.get("content_body"),
                    source_url=item.get("source_url"),
                    platform=item.get("_platform", item.get("platform", "google_trends")),
                    tags=item.get("tags", []),
                    hashtags=item.get("hashtags", []),
                    views=item.get("views"),
                    likes=item.get("likes"),
                    comments_count=item.get("comments_count"),
                    shares=item.get("shares"),
                    trending_score=item.get("trending_score"),
                    thumbnail_url=item.get("thumbnail_url"),
                    video_url=item.get("video_url"),
                    image_urls=item.get("image_urls", []),
                    author_name=item.get("author_name"),
                    author_url=item.get("author_url"),
                    author_followers=item.get("author_followers"),
                    category=item.get("category"),
                    sentiment=item.get("sentiment"),
                    lifecycle=item.get("lifecycle"),
                    relevance_score=item.get("relevance_score"),
                    related_topics=item.get("related_topics", []),
                    dedup_key=item.get("dedup_key"),
                    cross_platform_ids=item.get("cross_platform_ids", []),
                    raw_data=item.get("raw_data"),
                    published_at=_parse_datetime(item.get("published_at")),
                )
                db.add(trend)

            await db.commit()
            logger.info(
                "persist_results: saved",
                scan_run_id=scan_run_id,
                items_saved=len(analyzed),
                status=scan_run.status.value,
            )

        except Exception as e:
            await db.rollback()
            logger.error("persist_results: failed", error=str(e))
            # Update scan run as failed
            try:
                scan_run = (
                    await db.execute(
                        select(ScanRun).where(ScanRun.id == uuid.UUID(scan_run_id))
                    )
                ).scalar_one_or_none()
                if scan_run:
                    scan_run.status = ScanStatus.FAILED
                    scan_run.error = str(e)
                    scan_run.completed_at = datetime.now(timezone.utc)
                    await db.commit()
            except Exception:
                pass

    return {}


def _parse_datetime(value) -> datetime | None:
    """Parse various datetime formats."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


async def run_scan(scan_run_id: str, request: ScanRequest, db: AsyncSession, redis: Redis):
    """Execute the full trend scan pipeline."""
    start_time = time.time()

    try:
        # Update status to RUNNING
        result = await db.execute(
            select(ScanRun).where(ScanRun.id == uuid.UUID(scan_run_id))
        )
        scan_run = result.scalar_one_or_none()
        if scan_run:
            scan_run.status = ScanStatus.RUNNING
            scan_run.langgraph_thread_id = str(uuid.uuid4())
            await db.commit()

        # Build and run the graph
        rate_limiter = RateLimiter(redis)
        cache = Cache(redis)
        graph = build_trend_scan_graph(rate_limiter, cache)

        initial_state = TrendScanState(
            scan_run_id=scan_run_id,
            platforms=[p.value for p in request.platforms],
            options={
                "max_items_per_platform": request.options.max_items_per_platform,
                "include_comments": request.options.include_comments,
                "region": request.options.region,
            },
            raw_results=[],
            analyzed_trends=[],
            cross_platform_groups=[],
            errors=[],
        )

        await graph.ainvoke(initial_state)

        # Update duration
        duration_ms = int((time.time() - start_time) * 1000)
        async with async_session_factory() as update_db:
            result = await update_db.execute(
                select(ScanRun).where(ScanRun.id == uuid.UUID(scan_run_id))
            )
            scan_run = result.scalar_one_or_none()
            if scan_run:
                scan_run.duration_ms = duration_ms
                await update_db.commit()

        logger.info("Scan completed", scan_run_id=scan_run_id, duration_ms=duration_ms)

    except Exception as e:
        logger.error("Scan failed", scan_run_id=scan_run_id, error=str(e))
        async with async_session_factory() as error_db:
            result = await error_db.execute(
                select(ScanRun).where(ScanRun.id == uuid.UUID(scan_run_id))
            )
            scan_run = result.scalar_one_or_none()
            if scan_run:
                scan_run.status = ScanStatus.FAILED
                scan_run.error = str(e)
                scan_run.completed_at = datetime.now(timezone.utc)
                scan_run.duration_ms = int((time.time() - start_time) * 1000)
                await error_db.commit()
