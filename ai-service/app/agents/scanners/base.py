from abc import ABC, abstractmethod

import structlog

from app.agents.state import RawTrendData, TrendScanState
from app.core.cache import Cache
from app.core.rate_limiter import RateLimiter

logger = structlog.get_logger()


class BaseScannerNode(ABC):
    """Base class for all platform scanner nodes."""

    platform: str

    def __init__(self, rate_limiter: RateLimiter, cache: Cache):
        self.rate_limiter = rate_limiter
        self.cache = cache

    async def __call__(self, state: TrendScanState) -> dict:
        try:
            logger.info("Scanner starting", platform=self.platform)

            # Check rate limit
            await self.rate_limiter.check(self.platform)

            # Check cache
            cache_key = f"scan:{self.platform}:latest"
            cached = await self.cache.get(cache_key)
            if cached:
                logger.info("Scanner using cache", platform=self.platform, items=len(cached))
                return {
                    "raw_results": [
                        RawTrendData(
                            platform=self.platform,
                            items=cached,
                            error=None,
                            metadata={"from_cache": True, "items_count": len(cached)},
                        )
                    ]
                }

            # Fetch fresh data
            items = await self.fetch(state.get("options", {}))

            # Log warning if no items returned
            if not items:
                logger.warning("Scanner returned 0 items", platform=self.platform)

            # Cache results (TTL: 30 minutes)
            if items:
                await self.cache.set(cache_key, items, ttl=1800)

            logger.info("Scanner completed", platform=self.platform, items=len(items))
            return {
                "raw_results": [
                    RawTrendData(
                        platform=self.platform,
                        items=items,
                        error=None,
                        metadata={"items_count": len(items)},
                    )
                ]
            }

        except Exception as e:
            logger.error("Scanner failed", platform=self.platform, error=str(e))
            return {
                "raw_results": [
                    RawTrendData(
                        platform=self.platform,
                        items=[],
                        error=str(e),
                        metadata={},
                    )
                ],
                "errors": [{"platform": self.platform, "error": str(e)}],
            }

    @abstractmethod
    async def fetch(self, options: dict) -> list[dict]:
        """Platform-specific data fetching. Must be implemented by subclasses."""
        ...
