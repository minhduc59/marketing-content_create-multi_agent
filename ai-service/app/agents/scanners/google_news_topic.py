import asyncio

import structlog

from app.agents.scanners.base import BaseScannerNode
from app.config import get_settings

logger = structlog.get_logger()

# Concurrency limit for parallel topic fetching
_FETCH_SEMAPHORE = asyncio.Semaphore(3)

# All supported topics from Google News
AVAILABLE_TOPICS = [
    "WORLD", "NATION", "BUSINESS", "TECHNOLOGY", "ENTERTAINMENT", "SPORTS",
    "SCIENCE", "HEALTH", "POLITICS", "CELEBRITIES", "TV", "MUSIC", "MOVIES",
    "THEATER", "SOCCER", "CYCLING", "MOTOR SPORTS", "TENNIS", "COMBAT SPORTS",
    "BASKETBALL", "BASEBALL", "FOOTBALL", "SPORTS BETTING", "WATER SPORTS",
    "HOCKEY", "GOLF", "CRICKET", "RUGBY", "ECONOMY", "PERSONAL FINANCE",
    "FINANCE", "DIGITAL CURRENCIES", "MOBILE", "ENERGY", "GAMING",
    "INTERNET SECURITY", "GADGETS", "VIRTUAL REALITY", "ROBOTICS", "NUTRITION",
    "PUBLIC HEALTH", "MENTAL HEALTH", "MEDICINE", "SPACE", "WILDLIFE",
    "ENVIRONMENT", "NEUROSCIENCE", "PHYSICS", "GEOLOGY", "PALEONTOLOGY",
    "SOCIAL SCIENCES", "EDUCATION", "JOBS", "ONLINE EDUCATION",
    "HIGHER EDUCATION", "VEHICLES", "ARTS-DESIGN", "BEAUTY", "FOOD", "TRAVEL",
    "SHOPPING", "HOME", "OUTDOORS", "FASHION",
]


class GoogleNewsTopicScannerNode(BaseScannerNode):
    platform = "google_news_topic"

    async def fetch(self, options: dict) -> list[dict]:
        from google_news_trends_mcp.news import (
            BrowserManager,
            get_news_by_topic,
        )

        settings = get_settings()

        topics = options.get("topics") or settings.GOOGLE_NEWS_DEFAULT_TOPICS
        articles_per_topic = options.get(
            "topic_articles_per_topic",
            settings.GOOGLE_NEWS_TOPIC_ARTICLES_PER_TOPIC,
        )
        period = options.get(
            "topic_period_days",
            settings.GOOGLE_NEWS_TOPIC_PERIOD_DAYS,
        )

        # Validate topics
        valid_topics = [t.upper() for t in topics if t.upper() in AVAILABLE_TOPICS]
        if not valid_topics:
            logger.warning(
                "GoogleNewsTopic: no valid topics provided",
                requested=topics,
            )
            return []

        logger.info(
            "GoogleNewsTopic: fetching news for topics",
            count=len(valid_topics),
            topics=valid_topics,
        )

        all_items: list[dict] = []

        async def fetch_topic_news(topic: str) -> list[dict]:
            async with _FETCH_SEMAPHORE:
                try:
                    articles = await get_news_by_topic(
                        topic=topic,
                        period=period,
                        max_results=articles_per_topic,
                        nlp=True,
                    )
                    items = []
                    for article in articles:
                        item = _article_to_item(article, topic)
                        if item:
                            items.append(item)
                    logger.info(
                        "GoogleNewsTopic: topic done",
                        topic=topic,
                        articles=len(items),
                    )
                    return items
                except Exception as e:
                    logger.warning(
                        "GoogleNewsTopic: failed to fetch news for topic",
                        topic=topic,
                        error=str(e),
                    )
                    return []

        async with BrowserManager():
            tasks = [fetch_topic_news(topic) for topic in valid_topics]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                all_items.extend(result)

        logger.info("GoogleNewsTopic: fetch complete", total_articles=len(all_items))
        return all_items


def _article_to_item(article, topic: str) -> dict | None:
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
            "topic": topic,
            "keywords": article.keywords or [],
            "summary": article.summary or "",
            "meta_keywords": list(article.meta_keywords) if article.meta_keywords else [],
        },
    }
