from contextlib import asynccontextmanager

import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Trending Scanner service", env=settings.APP_ENV)

    try:
        app.state.redis = aioredis.from_url(
            settings.REDIS_URL, decode_responses=True
        )
        await app.state.redis.ping()
        logger.info("Redis connected")
    except Exception as e:
        logger.warning("Redis unavailable, running without cache/rate-limiting", error=str(e))
        app.state.redis = None

    yield

    # Shutdown
    if app.state.redis is not None:
        await app.state.redis.aclose()
    logger.info("Trending Scanner service stopped")


app = FastAPI(
    title="LinkedIn Technology Trend Scanner",
    description=(
        "AI-powered technology trend scanner for LinkedIn content creation.\n\n"
        "## Workflow\n"
        "1. **Trigger a scan** — `POST /api/v1/scan` to crawl HackerNews\n"
        "2. **Poll status** — `GET /api/v1/scan/{scan_id}/status` until `completed`\n"
        "3. **Query trends** — `GET /api/v1/trends` with filters\n"
        "4. **View reports** — `GET /api/v1/reports/{scan_run_id}` for LinkedIn-focused report\n\n"
        "## Data source\n"
        "`hackernews` — Top stories from Hacker News, crawled and analyzed for LinkedIn relevance.\n\n"
        "## Pipeline\n"
        "HackerNews → GPT-4o Analysis → Content Save → LinkedIn Report → Database\n\n"
        "## Scan lifecycle\n"
        "`pending` → `running` → `completed` | `partial` | `failed`"
    ),
    version="0.2.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "trending-scanner"}


# Import and register API routers
from app.api.v1.router import v1_router  # noqa: E402

app.include_router(v1_router, prefix="/api/v1")
