from functools import lru_cache

from firecrawl import FirecrawlApp

from app.config import get_settings


@lru_cache
def get_firecrawl() -> FirecrawlApp:
    settings = get_settings()
    return FirecrawlApp(api_key=settings.FIRECRAWL_API_KEY)
