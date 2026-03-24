import structlog

from app.clients.firecrawl_client import get_firecrawl
from app.core.retry import with_retry

logger = structlog.get_logger()


class FirecrawlTool:
    """Generic web scraping tool using Firecrawl API."""

    def __init__(self):
        self.app = get_firecrawl()

    @with_retry(max_attempts=3)
    async def scrape_url(self, url: str, formats: list[str] | None = None) -> dict:
        """Scrape a single URL and return structured data."""
        import asyncio

        def _scrape():
            return self.app.scrape_url(
                url,
                params={"formats": formats or ["markdown", "extract"]},
            )

        result = await asyncio.to_thread(_scrape)
        logger.info("Firecrawl: scraped URL", url=url)
        return result

    @with_retry(max_attempts=2)
    async def scrape_trending_page(self, url: str, platform: str = "unknown") -> list[dict]:
        """Scrape a trending/explore page and extract items."""
        import asyncio

        def _scrape():
            return self.app.scrape_url(
                url,
                params={
                    "formats": ["extract"],
                    "extract": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "trending_items": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "title": {"type": "string"},
                                            "description": {"type": "string"},
                                            "url": {"type": "string"},
                                            "image_url": {"type": "string"},
                                            "author": {"type": "string"},
                                            "engagement": {"type": "string"},
                                            "hashtags": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                            },
                                        },
                                    },
                                }
                            },
                        },
                        "prompt": "Extract all trending content items from this page including titles, descriptions, URLs, images, authors, engagement metrics, and hashtags.",
                    },
                },
            )

        result = await asyncio.to_thread(_scrape)
        extracted = result.get("extract", {}).get("trending_items", [])

        items = []
        for item in extracted:
            items.append({
                "title": item.get("title", "Untitled"),
                "description": item.get("description"),
                "content_body": item.get("description"),
                "source_url": item.get("url", url),
                "platform": platform,
                "tags": [],
                "hashtags": item.get("hashtags", []),
                "views": None,
                "likes": None,
                "comments_count": None,
                "shares": None,
                "trending_score": None,
                "thumbnail_url": item.get("image_url"),
                "video_url": None,
                "image_urls": [item["image_url"]] if item.get("image_url") else [],
                "author_name": item.get("author"),
                "author_url": None,
                "author_followers": None,
                "published_at": None,
                "raw_data": {
                    "source": "firecrawl",
                    "scraped_url": url,
                    "raw_item": item,
                },
            })

        logger.info("Firecrawl: extracted trending items", url=url, count=len(items))
        return items
