import time

import structlog
from redis.asyncio import Redis

from app.core.exceptions import RateLimitError

logger = structlog.get_logger()

# Platform rate limits: (max_requests, window_seconds)
PLATFORM_LIMITS: dict[str, tuple[int, int]] = {
    "youtube": (10_000, 86400),      # 10k quota units / 24h
    "tiktok": (500, 86400),          # RapidAPI plan dependent
    "twitter": (500, 86400),         # RapidAPI plan dependent
    "instagram": (500, 86400),       # RapidAPI plan dependent
    "google_trends": (12, 60),       # ~12 requests / 60s
    "firecrawl": (500, 86400),       # Firecrawl plan dependent
}


class RateLimiter:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def check(self, platform: str, cost: int = 1) -> bool:
        limit, window = PLATFORM_LIMITS.get(platform, (100, 60))
        key = f"ratelimit:{platform}"
        now = time.time()

        pipe = self.redis.pipeline()
        # Remove old entries outside the window
        pipe.zremrangebyscore(key, 0, now - window)
        # Count current entries
        pipe.zcard(key)
        # Add new entry
        pipe.zadd(key, {f"{now}:{cost}": now})
        # Set expiry on the key
        pipe.expire(key, window)

        results = await pipe.execute()
        current_count = results[1]

        if current_count >= limit:
            logger.warning("Rate limit exceeded", platform=platform, limit=limit, window=window)
            raise RateLimitError(platform, f"Rate limit exceeded: {current_count}/{limit} in {window}s")

        return True

    async def get_usage(self, platform: str) -> dict:
        limit, window = PLATFORM_LIMITS.get(platform, (100, 60))
        key = f"ratelimit:{platform}"
        now = time.time()

        await self.redis.zremrangebyscore(key, 0, now - window)
        current = await self.redis.zcard(key)

        return {
            "platform": platform,
            "used": current,
            "limit": limit,
            "remaining": max(0, limit - current),
            "window_seconds": window,
        }
