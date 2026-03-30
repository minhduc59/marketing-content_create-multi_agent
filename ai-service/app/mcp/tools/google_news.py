"""MCP tools for fetching Google News articles by topic."""

from typing import Annotated

import structlog
from pydantic import BaseModel, Field

from app.agents.scanners.google_news_topic import AVAILABLE_TOPICS

logger = structlog.get_logger()


class TopicArticle(BaseModel):
    title: str
    url: str
    summary: str | None = None
    text: str | None = None
    authors: list[str] = []
    publish_date: str | None = None
    top_image: str | None = None
    keywords: list[str] = []
    tags: list[str] = []


def register_tools(mcp):
    """Register Google News topic tools on the given MCP server."""

    @mcp.tool(
        description="List all available Google News topics that can be used with get_news_by_topic.",
        tags={"news", "topics", "list"},
    )
    async def list_available_topics() -> list[str]:
        return AVAILABLE_TOPICS

    @mcp.tool(
        description=(
            "Fetch news articles for a specific topic from Google News. "
            "Topics include: TECHNOLOGY, HEALTH, BUSINESS, SCIENCE, EDUCATION, "
            "ENTERTAINMENT, SPORTS, POLITICS, and many more. "
            "Use list_available_topics to see all options."
        ),
        tags={"news", "articles", "topic"},
    )
    async def get_news_by_topic(
        topic: Annotated[str, Field(description="Topic to search for (e.g. TECHNOLOGY, HEALTH, BUSINESS)")],
        period: Annotated[int, Field(description="Number of days to look back for articles.", ge=1)] = 7,
        max_results: Annotated[int, Field(description="Maximum number of articles to return.", ge=1, le=50)] = 10,
    ) -> list[TopicArticle]:
        from google_news_trends_mcp.news import (
            BrowserManager,
            get_news_by_topic as _get_news_by_topic,
        )

        topic_upper = topic.upper()
        if topic_upper not in AVAILABLE_TOPICS:
            raise ValueError(
                f"Invalid topic '{topic}'. Use list_available_topics to see valid options."
            )

        logger.info("MCP get_news_by_topic", topic=topic_upper, period=period, max_results=max_results)

        async with BrowserManager():
            articles = await _get_news_by_topic(
                topic=topic_upper,
                period=period,
                max_results=max_results,
                nlp=True,
            )

        results = []
        for article in articles:
            if not article or not article.title:
                continue
            results.append(TopicArticle(
                title=article.title or "",
                url=getattr(article, "original_url", None) or getattr(article, "url", "") or "",
                summary=article.summary or None,
                text=article.text or None,
                authors=list(article.authors) if article.authors else [],
                publish_date=str(article.publish_date) if article.publish_date else None,
                top_image=article.top_image or None,
                keywords=article.keywords or [],
                tags=list(article.tags) if article.tags else [],
            ))

        logger.info("MCP get_news_by_topic complete", topic=topic_upper, articles=len(results))
        return results
