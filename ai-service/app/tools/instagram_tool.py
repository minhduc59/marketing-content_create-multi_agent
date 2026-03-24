import structlog

from app.clients.rapidapi_client import get_rapidapi_client
from app.core.retry import with_retry

logger = structlog.get_logger()

# Instagram RapidAPI endpoint (adjust based on chosen provider)
INSTAGRAM_API_HOST = "instagram-scraper-api2.p.rapidapi.com"


class InstagramTool:
    """Wrapper around RapidAPI Instagram endpoints."""

    def __init__(self):
        self.client = get_rapidapi_client()

    @with_retry(max_attempts=3)
    async def fetch_trending_reels(self, count: int = 30) -> list[dict]:
        """Fetch trending Instagram reels."""
        response = await self.client.get(
            f"https://{INSTAGRAM_API_HOST}/v1/trending",
            headers={"x-rapidapi-host": INSTAGRAM_API_HOST},
            params={"count": str(count)},
        )
        response.raise_for_status()
        data = response.json()

        items = []
        posts = data.get("data", {}).get("items", data.get("items", []))

        for post in posts:
            caption = post.get("caption", {})
            caption_text = caption.get("text", "") if isinstance(caption, dict) else str(caption or "")
            user = post.get("user", {})

            # Extract hashtags from caption
            hashtags = [
                f"#{word.lstrip('#')}" for word in caption_text.split()
                if word.startswith("#")
            ]

            # Get media URLs
            image_versions = post.get("image_versions2", {}).get("candidates", [])
            thumbnail = image_versions[0].get("url") if image_versions else None
            video_versions = post.get("video_versions", [])
            video_url = video_versions[0].get("url") if video_versions else None

            items.append({
                "title": caption_text[:200] if caption_text else "Untitled",
                "description": caption_text[:500],
                "content_body": caption_text,
                "source_url": f"https://www.instagram.com/reel/{post.get('code', post.get('shortcode', ''))}",
                "platform": "instagram",
                "tags": [],
                "hashtags": hashtags,
                "views": post.get("play_count", post.get("view_count")),
                "likes": post.get("like_count", 0),
                "comments_count": post.get("comment_count", 0),
                "shares": post.get("reshare_count"),
                "trending_score": float(post.get("play_count", post.get("like_count", 0))),
                "thumbnail_url": thumbnail,
                "video_url": video_url,
                "image_urls": [c.get("url") for c in image_versions[:3]] if image_versions else [],
                "author_name": user.get("full_name", user.get("username", "")),
                "author_url": f"https://www.instagram.com/{user.get('username', '')}",
                "author_followers": user.get("follower_count"),
                "published_at": None,
                "raw_data": {
                    "media_id": post.get("id"),
                    "shortcode": post.get("code", post.get("shortcode")),
                    "media_type": post.get("media_type"),
                    "is_reel": post.get("product_type") == "clips",
                },
            })

        logger.info("Instagram: fetched trending reels", count=len(items))
        return items

    @with_retry(max_attempts=3)
    async def fetch_hashtag_posts(self, hashtag: str, count: int = 20) -> list[dict]:
        """Fetch top posts for a hashtag."""
        response = await self.client.get(
            f"https://{INSTAGRAM_API_HOST}/v1/hashtag",
            headers={"x-rapidapi-host": INSTAGRAM_API_HOST},
            params={"hashtag": hashtag},
        )
        response.raise_for_status()
        data = response.json()

        items = []
        posts = data.get("data", {}).get("items", [])

        for post in posts[:count]:
            caption = post.get("caption", {})
            caption_text = caption.get("text", "") if isinstance(caption, dict) else str(caption or "")
            user = post.get("user", {})
            image_versions = post.get("image_versions2", {}).get("candidates", [])
            thumbnail = image_versions[0].get("url") if image_versions else None

            items.append({
                "title": caption_text[:200] if caption_text else f"#{hashtag} post",
                "description": caption_text[:500],
                "content_body": caption_text,
                "source_url": f"https://www.instagram.com/p/{post.get('code', '')}",
                "platform": "instagram",
                "tags": [hashtag],
                "hashtags": [f"#{hashtag}"],
                "views": post.get("play_count"),
                "likes": post.get("like_count", 0),
                "comments_count": post.get("comment_count", 0),
                "shares": None,
                "trending_score": float(post.get("like_count", 0)),
                "thumbnail_url": thumbnail,
                "video_url": None,
                "image_urls": [c.get("url") for c in image_versions[:3]] if image_versions else [],
                "author_name": user.get("full_name", user.get("username", "")),
                "author_url": f"https://www.instagram.com/{user.get('username', '')}",
                "author_followers": user.get("follower_count"),
                "published_at": None,
                "raw_data": {
                    "media_id": post.get("id"),
                    "shortcode": post.get("code"),
                    "hashtag": hashtag,
                },
            })

        logger.info("Instagram: fetched hashtag posts", hashtag=hashtag, count=len(items))
        return items

    async def fetch_all(self) -> list[dict]:
        """Fetch all Instagram trending data."""
        return await self.fetch_trending_reels()
