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
    title="Trending Scanner Agent",
    description=(
        "AI-powered trending content scanner across social media platforms.\n\n"
        "## Workflow\n"
        "1. **Trigger a scan** — `POST /api/v1/scan` with desired platforms\n"
        "2. **Poll status** — `GET /api/v1/scan/{scan_id}/status` until `completed`\n"
        "3. **Query trends** — `GET /api/v1/trends` with filters\n\n"
        "## Supported platforms\n"
        "`youtube` · `google_news` · `google_news_topic`\n\n"
        "### Google News workflow\n"
        "The `google_news` scanner fetches trending keywords from Google Trends, "
        "then crawls news articles for each keyword. Analyzed articles are saved as "
        "individual markdown files in the `content/` directory.\n\n"
        "### Google News Topic workflow\n"
        "The `google_news_topic` scanner fetches news articles for specific topics "
        "(e.g. TECHNOLOGY, HEALTH, BUSINESS). Topics can be passed in scan options "
        "or defaults from config are used.\n\n"
        "## Scan lifecycle\n"
        "`pending` → `running` → `completed` | `partial` | `failed`"
    ),
    version="0.1.0",
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
