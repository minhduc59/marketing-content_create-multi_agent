import enum


class ScanStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"


class Platform(str, enum.Enum):
    HACKERNEWS = "hackernews"


class Sentiment(str, enum.Enum):
    BULLISH = "bullish"
    NEUTRAL = "neutral"
    BEARISH = "bearish"
    CONTROVERSIAL = "controversial"


class TrendLifecycle(str, enum.Enum):
    EMERGING = "emerging"
    RISING = "rising"
    PEAKING = "peaking"
    SATURATED = "saturated"
    DECLINING = "declining"


class EngagementPrediction(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VIRAL = "viral"


class SourceType(str, enum.Enum):
    OFFICIAL_BLOG = "official_blog"
    NEWS = "news"
    RESEARCH = "research"
    COMMUNITY = "community"
    SOCIAL = "social"
