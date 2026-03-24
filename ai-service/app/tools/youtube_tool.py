import structlog
from googleapiclient.discovery import build

from app.config import get_settings
from app.core.retry import with_retry

logger = structlog.get_logger()


class YouTubeTool:
    """Wrapper around YouTube Data API v3."""

    def __init__(self):
        settings = get_settings()
        self.youtube = build("youtube", "v3", developerKey=settings.YOUTUBE_API_KEY)

    @with_retry(max_attempts=3)
    async def fetch_trending_videos(
        self,
        region_code: str = "US",
        max_results: int = 50,
    ) -> list[dict]:
        """Fetch most popular / trending videos."""
        import asyncio

        def _fetch():
            request = self.youtube.videos().list(
                part="snippet,statistics,contentDetails",
                chart="mostPopular",
                regionCode=region_code,
                maxResults=min(max_results, 50),
            )
            return request.execute()

        response = await asyncio.to_thread(_fetch)
        items = []

        for video in response.get("items", []):
            snippet = video.get("snippet", {})
            stats = video.get("statistics", {})
            thumbnails = snippet.get("thumbnails", {})
            best_thumb = (
                thumbnails.get("maxres", {}).get("url")
                or thumbnails.get("high", {}).get("url")
                or thumbnails.get("default", {}).get("url")
            )

            items.append({
                "title": snippet.get("title", ""),
                "description": snippet.get("description", "")[:500],
                "content_body": snippet.get("description", ""),
                "source_url": f"https://www.youtube.com/watch?v={video['id']}",
                "platform": "youtube",
                "tags": snippet.get("tags", []),
                "hashtags": [f"#{tag}" for tag in snippet.get("tags", [])[:10]],
                "views": int(stats.get("viewCount", 0)),
                "likes": int(stats.get("likeCount", 0)),
                "comments_count": int(stats.get("commentCount", 0)),
                "shares": None,
                "trending_score": float(stats.get("viewCount", 0)),
                "thumbnail_url": best_thumb,
                "video_url": f"https://www.youtube.com/watch?v={video['id']}",
                "image_urls": [url["url"] for url in thumbnails.values() if isinstance(url, dict) and "url" in url],
                "author_name": snippet.get("channelTitle"),
                "author_url": f"https://www.youtube.com/channel/{snippet.get('channelId', '')}",
                "author_followers": None,
                "published_at": snippet.get("publishedAt"),
                "raw_data": {
                    "video_id": video["id"],
                    "channel_id": snippet.get("channelId"),
                    "category_id": snippet.get("categoryId"),
                    "duration": video.get("contentDetails", {}).get("duration"),
                    "statistics": stats,
                },
            })

        logger.info("YouTube: fetched trending videos", count=len(items))
        return items

    @with_retry(max_attempts=3)
    async def search_trending(
        self,
        query: str = "",
        max_results: int = 25,
    ) -> list[dict]:
        """Search YouTube for trending content by query."""
        import asyncio

        def _fetch():
            request = self.youtube.search().list(
                part="snippet",
                q=query,
                type="video",
                order="viewCount",
                publishedAfter=None,
                maxResults=min(max_results, 25),
            )
            return request.execute()

        response = await asyncio.to_thread(_fetch)
        items = []

        for result in response.get("items", []):
            snippet = result.get("snippet", {})
            video_id = result.get("id", {}).get("videoId", "")
            thumbnails = snippet.get("thumbnails", {})
            best_thumb = thumbnails.get("high", {}).get("url") or thumbnails.get("default", {}).get("url")

            items.append({
                "title": snippet.get("title", ""),
                "description": snippet.get("description", "")[:500],
                "content_body": snippet.get("description", ""),
                "source_url": f"https://www.youtube.com/watch?v={video_id}",
                "platform": "youtube",
                "tags": [],
                "hashtags": [],
                "views": None,
                "likes": None,
                "comments_count": None,
                "shares": None,
                "trending_score": None,
                "thumbnail_url": best_thumb,
                "video_url": f"https://www.youtube.com/watch?v={video_id}",
                "image_urls": [],
                "author_name": snippet.get("channelTitle"),
                "author_url": f"https://www.youtube.com/channel/{snippet.get('channelId', '')}",
                "author_followers": None,
                "published_at": snippet.get("publishedAt"),
                "raw_data": {
                    "video_id": video_id,
                    "channel_id": snippet.get("channelId"),
                    "source": "search",
                    "query": query,
                },
            })

        logger.info("YouTube: search results", query=query, count=len(items))
        return items

    async def fetch_all(self, region_code: str = "US") -> list[dict]:
        """Fetch all YouTube trending data."""
        return await self.fetch_trending_videos(region_code=region_code)
