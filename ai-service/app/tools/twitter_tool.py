import structlog

from app.clients.rapidapi_client import get_rapidapi_client
from app.core.retry import with_retry

logger = structlog.get_logger()

# Twitter/X RapidAPI endpoint (adjust based on chosen provider)
TWITTER_API_HOST = "twitter-api45.p.rapidapi.com"


class TwitterTool:
    """Wrapper around RapidAPI Twitter/X endpoints."""

    def __init__(self):
        self.client = get_rapidapi_client()

    @with_retry(max_attempts=3)
    async def fetch_trending(self, country: str = "US") -> list[dict]:
        """Fetch Twitter/X trending topics."""
        response = await self.client.get(
            f"https://{TWITTER_API_HOST}/trends.php",
            headers={"x-rapidapi-host": TWITTER_API_HOST},
            params={"country": country},
        )
        response.raise_for_status()
        data = response.json()

        items = []
        trends = data if isinstance(data, list) else data.get("trends", data.get("items", []))

        for trend in trends:
            name = trend.get("name", trend.get("trend", ""))
            tweet_count = trend.get("tweet_count", trend.get("tweet_volume"))

            items.append({
                "title": name,
                "description": trend.get("description", f"Trending on Twitter/X: {name}"),
                "content_body": None,
                "source_url": trend.get("url", f"https://twitter.com/search?q={name.replace(' ', '%20')}"),
                "platform": "twitter",
                "tags": [],
                "hashtags": [name] if name.startswith("#") else [],
                "views": None,
                "likes": None,
                "comments_count": None,
                "shares": None,
                "trending_score": float(tweet_count) if tweet_count else None,
                "thumbnail_url": None,
                "video_url": None,
                "image_urls": [],
                "author_name": None,
                "author_url": None,
                "author_followers": None,
                "published_at": None,
                "raw_data": {
                    "tweet_volume": tweet_count,
                    "country": country,
                    "domain": trend.get("domain"),
                },
            })

        logger.info("Twitter: fetched trending", count=len(items))
        return items

    @with_retry(max_attempts=3)
    async def fetch_top_tweets(self, query: str, count: int = 20) -> list[dict]:
        """Fetch top tweets for a trending topic."""
        response = await self.client.get(
            f"https://{TWITTER_API_HOST}/search.php",
            headers={"x-rapidapi-host": TWITTER_API_HOST},
            params={"query": query, "search_type": "Top"},
        )
        response.raise_for_status()
        data = response.json()

        items = []
        tweets = data.get("timeline", data.get("tweets", []))

        for tweet in tweets[:count]:
            user = tweet.get("user_info", tweet.get("user", {}))
            text = tweet.get("text", tweet.get("full_text", ""))

            # Extract hashtags
            entities = tweet.get("entities", {})
            hashtags = [f"#{h.get('text', h.get('tag', ''))}" for h in entities.get("hashtags", [])]

            # Extract media
            media = entities.get("media", [])
            image_urls = [m.get("media_url_https", "") for m in media if m.get("type") == "photo"]
            video_url = next(
                (m.get("video_info", {}).get("variants", [{}])[0].get("url")
                 for m in media if m.get("type") == "video"),
                None,
            )

            items.append({
                "title": text[:200] if text else "Untitled",
                "description": text[:500],
                "content_body": text,
                "source_url": f"https://twitter.com/{user.get('screen_name', '')}/status/{tweet.get('tweet_id', tweet.get('id', ''))}",
                "platform": "twitter",
                "tags": [],
                "hashtags": hashtags,
                "views": tweet.get("views"),
                "likes": tweet.get("favorites", tweet.get("favorite_count", 0)),
                "comments_count": tweet.get("replies", tweet.get("reply_count", 0)),
                "shares": tweet.get("retweets", tweet.get("retweet_count", 0)),
                "trending_score": float(tweet.get("views", 0)) if tweet.get("views") else None,
                "thumbnail_url": image_urls[0] if image_urls else None,
                "video_url": video_url,
                "image_urls": image_urls,
                "author_name": user.get("name", ""),
                "author_url": f"https://twitter.com/{user.get('screen_name', '')}",
                "author_followers": user.get("followers_count"),
                "published_at": tweet.get("created_at"),
                "raw_data": {
                    "tweet_id": tweet.get("tweet_id", tweet.get("id")),
                    "is_retweet": tweet.get("is_retweet", False),
                    "language": tweet.get("lang"),
                },
            })

        logger.info("Twitter: fetched top tweets", query=query, count=len(items))
        return items

    async def fetch_all(self, country: str = "US") -> list[dict]:
        """Fetch all Twitter trending data."""
        return await self.fetch_trending(country=country)
