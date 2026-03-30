import asyncio

import structlog

from app.agents.scanners.base import BaseScannerNode

logger = structlog.get_logger()

# Map region codes to ISO 3166-1 alpha-2 geo codes for get_trending_terms
_GEO_MAP = {
    "global": "US",
    "united_states": "US",
    "vietnam": "VN",
    "united_kingdom": "GB",
    "japan": "JP",
    "south_korea": "KR",
    "thailand": "TH",
    "indonesia": "ID",
    "singapore": "SG",
    "australia": "AU",
    "germany": "DE",
    "france": "FR",
    "india": "IN",
    "brazil": "BR",
}

# Concurrency limit for parallel news fetching
_FETCH_SEMAPHORE = asyncio.Semaphore(3)

# Defaults
_DEFAULT_MAX_KEYWORDS = 10
_DEFAULT_ARTICLES_PER_KEYWORD = 5
_DEFAULT_PERIOD_DAYS = 7


class GoogleNewsScannerNode(BaseScannerNode):
    platform = "google_news"

    async def fetch(self, options: dict) -> list[dict]:
        from google_news_trends_mcp.news import (
            BrowserManager,
            get_news_by_keyword,
            get_trending_terms,
        )

        raw_region = options.get("region", "global")
        geo = _GEO_MAP.get(raw_region, raw_region.upper())

        max_keywords = options.get("news_max_keywords", _DEFAULT_MAX_KEYWORDS)
        articles_per_kw = options.get("news_articles_per_keyword", _DEFAULT_ARTICLES_PER_KEYWORD)
        period = options.get("news_period_days", _DEFAULT_PERIOD_DAYS)

        # Step 1: Get trending keywords
        logger.info("GoogleNews: fetching trending terms", geo=geo)
        trending = await get_trending_terms(geo=geo, full_data=False)

        if not trending:
            logger.warning("GoogleNews: no trending terms found", geo=geo)
            return []

        # Sort by volume descending (volume is like "200K+"), take top N
        keywords = trending[:max_keywords]
        logger.info(
            "GoogleNews: fetching news for keywords",
            count=len(keywords),
            keywords=[k["keyword"] for k in keywords],
        )

        # Step 2: Fetch news for each keyword in parallel with semaphore
        all_items = []

        async def fetch_keyword_news(kw_data: dict) -> list[dict]:
            keyword = kw_data["keyword"]
            volume = kw_data.get("volume", "")
            async with _FETCH_SEMAPHORE:
                try:
                    articles = await get_news_by_keyword(
                        keyword=keyword,
                        period=period,
                        max_results=articles_per_kw,
                        nlp=True,
                    )
                    items = []
                    for article in articles:
                        item = _article_to_item(article, keyword, volume)
                        if item:
                            items.append(item)
                    logger.info(
                        "GoogleNews: keyword done",
                        keyword=keyword,
                        articles=len(items),
                    )
                    return items
                except Exception as e:
                    logger.warning(
                        "GoogleNews: failed to fetch news for keyword",
                        keyword=keyword,
                        error=str(e),
                    )
                    return []

        async with BrowserManager():
            tasks = [fetch_keyword_news(kw) for kw in keywords]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                all_items.extend(result)

        logger.info("GoogleNews: fetch complete", total_articles=len(all_items))
        return all_items


def _article_to_item(article, keyword: str, volume: str) -> dict | None:
    """Transform a newspaper Article into the common trend item dict."""
    if not article or not article.title:
        return None

    return {
        "title": article.title or "",
        "description": article.meta_description or article.summary or "",
        "content_body": article.text or "",
        "source_url": getattr(article, "original_url", None) or getattr(article, "url", "") or "",
        "tags": list(article.tags) if article.tags else [],
        "hashtags": [],
        "views": None,
        "likes": None,
        "comments_count": None,
        "shares": None,
        "trending_score": None,
        "author_name": article.authors[0] if article.authors else None,
        "author_url": None,
        "author_followers": None,
        "thumbnail_url": article.top_image or None,
        "video_url": None,
        "image_urls": list(article.images) if article.images else [],
        "published_at": str(article.publish_date) if article.publish_date else None,
        "raw_data": {
            "trending_keyword": keyword,
            "trending_volume": volume,
            "keywords": article.keywords or [],
            "summary": article.summary or "",
            "meta_keywords": list(article.meta_keywords) if article.meta_keywords else [],
        },
    }
