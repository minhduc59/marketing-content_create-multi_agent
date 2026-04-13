// ── Enums ──────────────────────────────────────────────

export enum ScanStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  PARTIAL = "partial",
  FAILED = "failed",
}

export enum ContentStatus {
  DRAFT = "draft",
  APPROVED = "approved",
  NEEDS_REVISION = "needs_revision",
  FLAGGED_FOR_REVIEW = "flagged_for_review",
  PUBLISHED = "published",
}

export enum PostFormat {
  QUICK_TIPS = "quick_tips",
  HOT_TAKE = "hot_take",
  TRENDING_BREAKDOWN = "trending_breakdown",
  DID_YOU_KNOW = "did_you_know",
  TUTORIAL_HACK = "tutorial_hack",
  MYTH_BUSTERS = "myth_busters",
  BEHIND_THE_TECH = "behind_the_tech",
}

export enum PublishStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  PUBLISHED = "published",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum PublishMode {
  AUTO = "auto",
  MANUAL = "manual",
}

export enum Sentiment {
  BULLISH = "bullish",
  NEUTRAL = "neutral",
  BEARISH = "bearish",
  CONTROVERSIAL = "controversial",
}

export enum TrendLifecycle {
  EMERGING = "emerging",
  RISING = "rising",
  PEAKING = "peaking",
  SATURATED = "saturated",
  DECLINING = "declining",
}

export enum EngagementPrediction {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  VIRAL = "viral",
}

export enum SourceType {
  OFFICIAL_BLOG = "official_blog",
  NEWS = "news",
  RESEARCH = "research",
  COMMUNITY = "community",
  SOCIAL = "social",
}

// ── Auth ───────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "admin" | "user";
  createdAt: string;
}

// ── Pagination ─────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Scan ───────────────────────────────────────────────

export interface ScanRun {
  id: string;
  triggeredBy: string | null;
  status: ScanStatus;
  platformsRequested: string[];
  platformsCompleted: string[];
  platformsFailed: Record<string, string>;
  totalItemsFound: number;
  langgraphThreadId: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  reportFilePath: string | null;
}

export interface ScanStatusResponse {
  scan_id: string;
  status: ScanStatus;
  platforms_completed: string[];
  platforms_failed: Record<string, string>;
  total_items_found: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
}

export interface TriggerScanDto {
  platforms?: string[];
  options?: {
    max_items_per_platform?: number;
    include_comments?: boolean;
    quality_threshold?: number;
    keywords?: string[];
    generate_posts?: boolean;
    post_gen_options?: {
      num_posts?: number;
      formats?: string[] | null;
    };
  };
}

// ── Trend ──────────────────────────────────────────────

export interface ContentAngle {
  angle: string;
  format: string;
  hook_line: string;
}

export interface TrendComment {
  id: string;
  author: string | null;
  text: string;
  likes: number;
  sentiment: Sentiment | null;
  posted_at: string | null;
}

export interface TrendItem {
  id: string;
  scanRunId: string;
  title: string;
  description: string | null;
  contentBody: string | null;
  sourceUrl: string | null;
  platform: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  imageUrls: string[];
  tags: string[];
  hashtags: string[];
  views: number | null;
  likes: number | null;
  commentsCount: number | null;
  shares: number | null;
  trendingScore: number | null;
  authorName: string | null;
  authorUrl: string | null;
  authorFollowers: number | null;
  category: string | null;
  sentiment: Sentiment | null;
  lifecycle: TrendLifecycle | null;
  relevanceScore: number | null;
  qualityScore: number | null;
  engagementPrediction: EngagementPrediction | null;
  sourceType: SourceType | null;
  relatedTopics: string[];
  contentAngles: ContentAngle[];
  keyDataPoints: string[];
  targetAudience: string[];
  cleanedContent: string | null;
  isPromoted: boolean;
  dedupKey: string | null;
  crossPlatformIds: string[];
  rawData: Record<string, unknown> | null;
  publishedAt: string | null;
  discoveredAt: string;
  comments?: TrendComment[];
}

export interface TrendFilters {
  category?: string;
  sentiment?: Sentiment;
  lifecycle?: TrendLifecycle;
  minScore?: number;
  page?: number;
  pageSize?: number;
}

// ── Content Post ───────────────────────────────────────

export interface ContentPost {
  id: string;
  scanRunId: string;
  trendItemId: string | null;
  createdBy: string | null;
  format: PostFormat;
  caption: string;
  hashtags: string[];
  cta: string | null;
  imagePrompt: Record<string, unknown> | null;
  trendTitle: string;
  trendUrl: string | null;
  contentAngleUsed: string | null;
  targetAudience: string[];
  wordCount: number | null;
  estimatedReadTime: string | null;
  engagementPrediction: string | null;
  bestPostingDay: string | null;
  bestPostingTime: string | null;
  timingWindow: string | null;
  status: ContentStatus;
  reviewScore: number | null;
  reviewNotes: string | null;
  reviewCriteria: Record<string, unknown> | null;
  revisionCount: number;
  isPromoted: boolean;
  filePath: string | null;
  imagePath: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface PostFilters {
  scanRunId?: string;
  format?: PostFormat;
  status?: ContentStatus;
  page?: number;
  pageSize?: number;
}

export interface PostGenRequest {
  scan_run_id: string;
  options?: {
    num_posts?: number;
    formats?: PostFormat[] | null;
  };
}

// ── Publish ────────────────────────────────────────────

export interface PublishedPost {
  id: string;
  contentPostId: string;
  publishedBy: string | null;
  platform: string;
  publishMode: PublishMode;
  status: PublishStatus;
  privacyLevel: string;
  tiktokPublishId: string | null;
  platformPostId: string | null;
  goldenHourSlot: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface ManualPublishRequest {
  privacy_level?: string;
}

export interface SchedulePublishRequest {
  scheduled_at: string;
  privacy_level?: string;
}

export interface AutoPublishRequest {
  privacy_level?: string;
}

export interface PublishAcceptedResponse {
  published_post_id: string;
  mode: string;
  status: string;
  scheduled_at: string | null;
  message: string;
}

export interface PublishStatusResponse {
  id: string;
  content_post_id: string;
  platform: string;
  status: PublishStatus;
  publish_mode: PublishMode;
  privacy_level: string;
  tiktok_publish_id: string | null;
  platform_post_id: string | null;
  golden_hour_slot: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export interface GoldenHourSlot {
  slot_time: string;
  slot_index: number;
  weighted_score: number;
  sample_count: number;
}

export interface GoldenHoursResponse {
  top_slots: GoldenHourSlot[];
  selected_slot: GoldenHourSlot;
  scheduled_at: string;
  is_fallback: boolean;
}

// ── Report ─────────────────────────────────────────────

export interface ReportListItem {
  scan_run_id: string;
  generated_at: string;
  report_file_path: string;
  total_items_found: number;
  platforms_completed: string[];
}

export interface ReportSummary {
  scan_run_id: string;
  meta: {
    total_input: number;
    passed: number;
    discarded: number;
    dominant_sentiment: string;
    top_trend: string;
    top_tiktok_format: string;
    suggested_posting_window: string;
  };
  processed_count: number;
  discarded_count: number;
  generated_at: string;
}

// ── Schedule ───────────────────────────────────────────

export interface ScanSchedule {
  id: string;
  cronExpression: string;
  platforms: string[];
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}
