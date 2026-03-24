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

    app.state.redis = aioredis.from_url(
        settings.REDIS_URL, decode_responses=True
    )
    await app.state.redis.ping()
    logger.info("Redis connected")

    yield

    # Shutdown
    await app.state.redis.aclose()
    logger.info("Trending Scanner service stopped")


app = FastAPI(
    title="Trending Scanner Agent",
    description="AI-powered trending content scanner across social media platforms",
    version="0.1.0",
    lifespan=lifespan,
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
