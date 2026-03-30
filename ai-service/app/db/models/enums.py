import enum


class ScanStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"


class Platform(str, enum.Enum):
    YOUTUBE = "youtube"
    GOOGLE_NEWS = "google_news"
    GOOGLE_NEWS_TOPIC = "google_news_topic"


class Sentiment(str, enum.Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    MIXED = "mixed"


class TrendLifecycle(str, enum.Enum):
    RISING = "rising"
    PEAK = "peak"
    DECLINING = "declining"
