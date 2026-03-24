import asyncio
from datetime import datetime, timezone

import structlog
from pytrends.request import TrendReq

from app.core.retry import with_retry

logger = structlog.get_logger()


class GoogleTrendsTool:
    """Wrapper around pytrends for Google Trends data."""

    def __init__(self):
        self.pytrends = TrendReq(hl="en-US", tz=360)

    @with_retry(max_attempts=3)
    async def fetch_trending_searches(self, country: str = "united_states") -> list[dict]:
        """Fetch daily trending searches. Runs in thread since pytrends is sync."""

        def _fetch():
            df = self.pytrends.trending_searches(pn=country)
            return df[0].tolist()

        trending = await asyncio.to_thread(_fetch)
        logger.info("Google Trends: fetched trending searches", count=len(trending))

        items = []
        for title in trending:
            items.append({
                "title": title,
                "description": None,
                "content_body": None,
                "source_url": f"https://trends.google.com/trends/explore?q={title.replace(' ', '+')}",
                "platform": "google_trends",
                "tags": [],
                "hashtags": [],
                "views": None,
                "likes": None,
                "comments_count": None,
                "shares": None,
                "trending_score": None,
                "thumbnail_url": None,
                "video_url": None,
                "image_urls": [],
                "author_name": None,
                "author_url": None,
                "author_followers": None,
                "published_at": datetime.now(timezone.utc).isoformat(),
                "raw_data": {"source": "trending_searches", "country": country},
            })
        return items

    @with_retry(max_attempts=3)
    async def fetch_related_queries(self, keywords: list[str]) -> list[dict]:
        """Fetch related queries for given keywords (max 5 at a time)."""

        def _fetch():
            self.pytrends.build_payload(keywords[:5], timeframe="now 7-d")
            return self.pytrends.related_queries()

        related = await asyncio.to_thread(_fetch)
        logger.info("Google Trends: fetched related queries", keywords=keywords[:5])

        items = []
        for keyword, data in related.items():
            if data.get("rising") is not None:
                for _, row in data["rising"].iterrows():
                    items.append({
                        "title": row["query"],
                        "description": f"Rising query related to '{keyword}'",
                        "content_body": None,
                        "source_url": f"https://trends.google.com/trends/explore?q={row['query'].replace(' ', '+')}",
                        "platform": "google_trends",
                        "tags": [keyword],
                        "hashtags": [],
                        "views": None,
                        "likes": None,
                        "comments_count": None,
                        "shares": None,
                        "trending_score": float(row.get("value", 0)) if row.get("value") else None,
                        "thumbnail_url": None,
                        "video_url": None,
                        "image_urls": [],
                        "author_name": None,
                        "author_url": None,
                        "author_followers": None,
                        "published_at": datetime.now(timezone.utc).isoformat(),
                        "raw_data": {
                            "source": "related_queries",
                            "parent_keyword": keyword,
                            "value": str(row.get("value", "")),
                        },
                    })
        return items

    async def fetch_all(self, country: str = "united_states") -> list[dict]:
        """Fetch all Google Trends data."""
        trending = await self.fetch_trending_searches(country)

        # Use top 5 trending terms to find related queries
        if trending:
            top_keywords = [item["title"] for item in trending[:5]]
            # Pause to avoid rate limiting
            await asyncio.sleep(2)
            related = await self.fetch_related_queries(top_keywords)
            trending.extend(related)

        return trending
