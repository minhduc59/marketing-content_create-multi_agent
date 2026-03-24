import structlog

from app.clients.rapidapi_client import get_rapidapi_client
from app.core.retry import with_retry

logger = structlog.get_logger()

# TikTok RapidAPI endpoint (TikTok API by Starter - adjust based on your chosen provider)
TIKTOK_API_HOST = "tiktok-api23.p.rapidapi.com"


class TikTokTool:
    """Wrapper around RapidAPI TikTok endpoints."""

    def __init__(self):
        self.client = get_rapidapi_client()

    @with_retry(max_attempts=3)
    async def fetch_trending_feed(self, count: int = 30) -> list[dict]:
        """Fetch TikTok trending/explore feed."""
        response = await self.client.get(
            f"https://{TIKTOK_API_HOST}/api/feed/list",
            headers={"x-rapidapi-host": TIKTOK_API_HOST},
            params={"count": str(count)},
        )
        response.raise_for_status()
        data = response.json()

        items = []
        for video in data.get("itemList", data.get("items", [])):
            desc = video.get("desc", "")
            stats = video.get("stats", {})
            author = video.get("author", {})
            music = video.get("music", {})

            # Extract hashtags from description
            hashtags = [
                f"#{tag}" for word in desc.split()
                if (tag := word.lstrip("#")) and word.startswith("#")
            ]

            items.append({
                "title": desc[:200] if desc else "Untitled",
                "description": desc[:500],
                "content_body": desc,
                "source_url": f"https://www.tiktok.com/@{author.get('uniqueId', '')}/video/{video.get('id', '')}",
                "platform": "tiktok",
                "tags": [music.get("title", "")] if music.get("title") else [],
                "hashtags": hashtags,
                "views": stats.get("playCount", 0),
                "likes": stats.get("diggCount", 0),
                "comments_count": stats.get("commentCount", 0),
                "shares": stats.get("shareCount", 0),
                "trending_score": float(stats.get("playCount", 0)),
                "thumbnail_url": video.get("video", {}).get("cover", ""),
                "video_url": video.get("video", {}).get("playAddr", ""),
                "image_urls": [video.get("video", {}).get("cover", "")] if video.get("video", {}).get("cover") else [],
                "author_name": author.get("nickname", author.get("uniqueId", "")),
                "author_url": f"https://www.tiktok.com/@{author.get('uniqueId', '')}",
                "author_followers": author.get("stats", {}).get("followerCount"),
                "published_at": None,
                "raw_data": {
                    "id": video.get("id"),
                    "music": music.get("title"),
                    "music_author": music.get("authorName"),
                    "duration": video.get("video", {}).get("duration"),
                    "region": video.get("region"),
                },
            })

        logger.info("TikTok: fetched trending feed", count=len(items))
        return items

    @with_retry(max_attempts=3)
    async def fetch_trending_hashtags(self) -> list[dict]:
        """Fetch trending hashtags/challenges."""
        response = await self.client.get(
            f"https://{TIKTOK_API_HOST}/api/trending/hashtag",
            headers={"x-rapidapi-host": TIKTOK_API_HOST},
        )
        response.raise_for_status()
        data = response.json()

        items = []
        for tag in data.get("challengeList", data.get("items", [])):
            challenge = tag.get("challengeInfo", tag)
            stats = challenge.get("stats", {})

            items.append({
                "title": f"#{challenge.get('challengeName', challenge.get('title', ''))}",
                "description": challenge.get("desc", ""),
                "content_body": challenge.get("desc"),
                "source_url": f"https://www.tiktok.com/tag/{challenge.get('challengeName', '')}",
                "platform": "tiktok",
                "tags": [],
                "hashtags": [f"#{challenge.get('challengeName', '')}"],
                "views": stats.get("videoCount", 0),
                "likes": None,
                "comments_count": None,
                "shares": None,
                "trending_score": float(stats.get("viewCount", 0)) if stats.get("viewCount") else None,
                "thumbnail_url": challenge.get("coverLarger", challenge.get("cover", "")),
                "video_url": None,
                "image_urls": [],
                "author_name": None,
                "author_url": None,
                "author_followers": None,
                "published_at": None,
                "raw_data": {
                    "challenge_id": challenge.get("id"),
                    "view_count": stats.get("viewCount"),
                    "video_count": stats.get("videoCount"),
                },
            })

        logger.info("TikTok: fetched trending hashtags", count=len(items))
        return items

    async def fetch_all(self) -> list[dict]:
        """Fetch all TikTok trending data."""
        feed = await self.fetch_trending_feed()
        try:
            hashtags = await self.fetch_trending_hashtags()
            feed.extend(hashtags)
        except Exception as e:
            logger.warning("TikTok: failed to fetch hashtags", error=str(e))
        return feed
