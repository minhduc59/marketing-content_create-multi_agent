import re
from datetime import datetime, timezone
from pathlib import Path

import structlog

from app.agents.state import TrendScanState

logger = structlog.get_logger()

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # ai-service/
CONTENT_DIR = BASE_DIR / "content"
TRENDING_DIR = CONTENT_DIR / "trending"
LATEST_DIR = CONTENT_DIR / "latest"


def _slugify(text: str, max_length: int = 80) -> str:
    """Convert text to a filesystem-safe slug."""
    # Lowercase and replace non-alphanumeric chars with hyphens
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    slug = re.sub(r"[\s_]+", "-", slug).strip("-")
    # Truncate to max_length
    if len(slug) > max_length:
        slug = slug[:max_length].rstrip("-")
    return slug or "untitled"


def _build_markdown(item: dict, crawled_at: str, platform: str = "google_news") -> str:
    """Build markdown content with YAML frontmatter for a news article."""
    title = item.get("title", "Untitled")
    source_url = item.get("source_url", "")
    author = item.get("author_name", "")
    published_at = item.get("published_at", "")
    category = item.get("category", "")
    sentiment = item.get("sentiment", "")
    relevance_score = item.get("relevance_score", 0)
    tags = item.get("tags", [])
    related_topics = item.get("related_topics", [])
    raw_data = item.get("raw_data", {})
    trending_keyword = raw_data.get("trending_keyword", "")
    topic = raw_data.get("topic", "")

    description = item.get("description", "")
    content_body = item.get("content_body", "")
    summary = raw_data.get("summary", "") or description

    # YAML frontmatter
    tags_str = ", ".join(f'"{t}"' for t in tags) if tags else ""
    lines = [
        "---",
        f'title: "{title}"',
        f'source_url: "{source_url}"',
        f'author: "{author}"',
        f'published_at: "{published_at}"',
        f'crawled_at: "{crawled_at}"',
        f'platform: "{platform}"',
    ]
    if topic:
        lines.append(f'topic: "{topic}"')
    if trending_keyword:
        lines.append(f'trending_keyword: "{trending_keyword}"')
    lines.extend([
        f'category: "{category}"',
        f'sentiment: "{sentiment}"',
        f"relevance_score: {relevance_score}",
        f"tags: [{tags_str}]",
        "---",
        "",
        f"# {title}",
        "",
    ])

    if summary:
        lines.extend(["## Summary", "", summary, ""])

    if content_body:
        lines.extend(["## Full Content", "", content_body, ""])

    if related_topics:
        lines.append("## Related Topics")
        lines.append("")
        for topic in related_topics:
            lines.append(f"- {topic}")
        lines.append("")

    if source_url:
        lines.extend(["## Source", "", f"[Read original article]({source_url})", ""])

    return "\n".join(lines)


async def content_saver_node(state: TrendScanState) -> dict:
    """Save analyzed news articles as individual markdown files.

    - google_news (trending) items → content/trending/
    - google_news_topic items → content/latest/
    """
    analyzed = state.get("analyzed_trends", [])

    # Separate items by platform
    trending_items = [
        item for item in analyzed
        if item.get("_platform") == "google_news"
    ]
    topic_items = [
        item for item in analyzed
        if item.get("_platform") == "google_news_topic"
    ]

    if not trending_items and not topic_items:
        logger.info("ContentSaver: no news items to save")
        return {"content_file_paths": []}

    now = datetime.now(timezone.utc)
    crawled_at = now.isoformat()
    time_suffix = now.strftime("%Y%m%d_%H%M%S")

    saved_paths = []

    # Save trending news → content/trending/
    if trending_items:
        TRENDING_DIR.mkdir(parents=True, exist_ok=True)
        for item in trending_items:
            saved = _save_item(item, TRENDING_DIR, time_suffix, crawled_at, "google_news")
            if saved:
                saved_paths.append(saved)
        logger.info("ContentSaver: trending saved", count=len([p for p in saved_paths]))

    # Save topic news → content/latest/
    if topic_items:
        LATEST_DIR.mkdir(parents=True, exist_ok=True)
        before = len(saved_paths)
        for item in topic_items:
            saved = _save_item(item, LATEST_DIR, time_suffix, crawled_at, "google_news_topic")
            if saved:
                saved_paths.append(saved)
        logger.info("ContentSaver: latest saved", count=len(saved_paths) - before)

    logger.info(
        "ContentSaver: completed",
        saved=len(saved_paths),
        trending=len(trending_items),
        topic=len(topic_items),
    )
    return {"content_file_paths": saved_paths}


def _save_item(
    item: dict, target_dir: Path, time_suffix: str, crawled_at: str, platform: str
) -> str | None:
    """Save a single item as a markdown file. Returns relative path or None."""
    title = item.get("title", "untitled")
    slug = _slugify(title)
    filename = f"{slug}-{time_suffix}.md"
    filepath = target_dir / filename

    try:
        markdown = _build_markdown(item, crawled_at, platform)
        filepath.write_text(markdown, encoding="utf-8")
        logger.debug("ContentSaver: saved", file=filename, dir=target_dir.name)
        return str(filepath.relative_to(BASE_DIR))
    except Exception as e:
        logger.warning("ContentSaver: failed to save", file=filename, error=str(e))
        return None
