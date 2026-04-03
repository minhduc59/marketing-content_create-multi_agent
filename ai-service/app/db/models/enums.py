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


class ContentStatus(str, enum.Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    NEEDS_REVISION = "needs_revision"
    FLAGGED_FOR_REVIEW = "flagged_for_review"
    PUBLISHED = "published"


class PostFormat(str, enum.Enum):
    THOUGHT_LEADERSHIP = "thought_leadership"
    HOT_TAKE = "hot_take"
    CASE_STUDY = "case_study"
    TUTORIAL = "tutorial"
    INDUSTRY_ANALYSIS = "industry_analysis"
    CAREER_ADVICE = "career_advice"
    BEHIND_THE_SCENES = "behind_the_scenes"
