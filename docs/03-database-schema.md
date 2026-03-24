# Database Schema — PostgreSQL

## ERD Tổng quan

```
users
  │
  ├── industry_keywords (1:N)
  ├── social_accounts (1:N)
  ├── trending_topics (1:N)
  │       └── content_drafts (1:N)
  │               └── media_assets (1:N)
  │                       └── post_schedules (1:N)
  │                               └── published_posts (1:1)
  │                                       └── post_analytics (1:N)
  └── agent_runs (1:N)
```

---

## Prisma Schema đầy đủ

```prisma
// backend/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  displayName   String
  avatarUrl     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  industryKeywords   IndustryKeyword[]
  socialAccounts     SocialAccount[]
  trendingTopics     TrendingTopic[]
  contentDrafts      ContentDraft[]
  agentRuns          AgentRun[]
  contentStrategy    ContentStrategyFeedback?

  @@map("users")
}

// ─────────────────────────────────────────────
// SOCIAL ACCOUNTS (OAuth tokens)
// ─────────────────────────────────────────────

model SocialAccount {
  id            String   @id @default(uuid())
  userId        String
  platform      Platform
  accountId     String   // platform's user/page ID
  accountName   String
  accessToken   String   // encrypted
  refreshToken  String?  // encrypted
  tokenExpiry   DateTime?
  pageId        String?  // Facebook Page ID (nếu là page)
  pageName      String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Relations
  user          User     @relation(fields: [userId], references: [id])
  postSchedules PostSchedule[]

  @@unique([userId, platform, accountId])
  @@map("social_accounts")
}

enum Platform {
  FACEBOOK
  INSTAGRAM
  TIKTOK
}

// ─────────────────────────────────────────────
// TREND DISCOVERY
// ─────────────────────────────────────────────

model IndustryKeyword {
  id        String   @id @default(uuid())
  userId    String
  keyword   String
  industry  String   // fashion, food, tech, beauty, ...
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])

  @@unique([userId, keyword])
  @@map("industry_keywords")
}

model TrendingTopic {
  id               String   @id @default(uuid())
  userId           String
  title            String
  description      String?
  sourceUrl        String?
  source           TrendSource
  industry         String
  sentiment        Sentiment
  lifecycle        TrendLifecycle
  relevanceScore   Float    // 0-10
  contentPotential Float    // 0-10
  rawData          Json?    // raw crawled data
  crawledAt        DateTime @default(now())
  expiresAt        DateTime // trending topics expire after 48h

  // Relations
  user          User           @relation(fields: [userId], references: [id])
  contentDrafts ContentDraft[]

  @@map("trending_topics")
}

enum TrendSource {
  GOOGLE_TRENDS
  REDDIT
  PLAYWRIGHT_SCRAPE
}

enum Sentiment {
  POSITIVE
  NEGATIVE
  NEUTRAL
}

enum TrendLifecycle {
  RISING
  PEAK
  DECLINING
}

// ─────────────────────────────────────────────
// CONTENT GENERATION
// ─────────────────────────────────────────────

model ContentDraft {
  id              String        @id @default(uuid())
  userId          String
  trendingTopicId String
  style           ContentStyle
  status          ContentStatus @default(DRAFT)

  // Generated content
  facebookCaption String?
  instagramCaption String?
  hashtags        String[]
  shortScript     String?       // 50-80 từ cho Reels/TikTok

  // Human feedback
  userEdits       Json?         // {field: original_value} nếu user sửa
  userFeedback    String?       // feedback khi reject

  // AI metadata
  modelUsed       String        @default("claude-sonnet-4-6")
  promptVersion   String?
  generationCost  Float?        // USD, estimated

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // Relations
  user            User          @relation(fields: [userId], references: [id])
  trendingTopic   TrendingTopic @relation(fields: [trendingTopicId], references: [id])
  mediaAssets     MediaAsset[]

  @@map("content_drafts")
}

enum ContentStyle {
  TRENDY
  PROFESSIONAL
  STORYTELLING
}

enum ContentStatus {
  DRAFT
  PENDING_REVIEW    // waiting for human approval
  APPROVED
  REJECTED
  PUBLISHED
}

// ─────────────────────────────────────────────
// MEDIA CREATION
// ─────────────────────────────────────────────

model MediaAsset {
  id              String      @id @default(uuid())
  contentDraftId  String
  status          MediaStatus @default(GENERATING)

  // Generation
  generatedPrompt String      // prompt gửi đến DALL-E
  promptHash      String      // SHA256 for caching
  provider        MediaProvider @default(DALLE3)

  // Storage
  originalUrl     String?     // S3 URL - original 1024x1024
  facebookUrl     String?     // S3 URL - 1200x630
  instagramFeedUrl String?    // S3 URL - 1080x1080
  instagramStoryUrl String?   // S3 URL - 1080x1920

  // Human review
  userFeedback    String?
  generationCost  Float?      // USD

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // Relations
  contentDraft    ContentDraft  @relation(fields: [contentDraftId], references: [id])
  postSchedules   PostSchedule[]

  @@map("media_assets")
}

enum MediaStatus {
  GENERATING
  PENDING_REVIEW
  APPROVED
  REJECTED
}

enum MediaProvider {
  DALLE3
  STABILITY_AI
}

// ─────────────────────────────────────────────
// SCHEDULING
// ─────────────────────────────────────────────

model PostSchedule {
  id              String         @id @default(uuid())
  contentDraftId  String
  mediaAssetId    String?
  socialAccountId String
  platform        Platform
  scheduledAt     DateTime
  status          ScheduleStatus @default(SCHEDULED)
  bullJobId       String?        // BullMQ job ID

  // Cross-post config
  customCaption   String?        // override caption for this platform
  customHashtags  String[]       // override hashtags

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  // Relations
  contentDraft    ContentDraft   @relation(fields: [contentDraftId], references: [id])
  mediaAsset      MediaAsset?    @relation(fields: [mediaAssetId], references: [id])
  socialAccount   SocialAccount  @relation(fields: [socialAccountId], references: [id])
  publishedPost   PublishedPost?

  @@map("post_schedules")
}

enum ScheduleStatus {
  SCHEDULED
  PUBLISHING
  PUBLISHED
  FAILED
  CANCELLED
}

// ─────────────────────────────────────────────
// PUBLISHED POSTS
// ─────────────────────────────────────────────

model PublishedPost {
  id              String    @id @default(uuid())
  postScheduleId  String    @unique
  platform        Platform
  platformPostId  String    // ID từ Facebook/Instagram API
  platformUrl     String?   // URL bài đăng
  publishedAt     DateTime  @default(now())

  // Relations
  postSchedule    PostSchedule  @relation(fields: [postScheduleId], references: [id])
  analytics       PostAnalytic[]

  @@map("published_posts")
}

// ─────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────

model PostAnalytic {
  id              String       @id @default(uuid())
  publishedPostId String
  platform        Platform
  collectedAt     DateTime     @default(now())

  // Metrics
  likes           Int          @default(0)
  comments        Int          @default(0)
  shares          Int          @default(0)
  reach           Int          @default(0)   // unique accounts reached
  impressions     Int          @default(0)   // total views
  saves           Int          @default(0)   // Instagram saves
  clicks          Int          @default(0)   // link clicks

  // Computed
  engagementRate  Float?       // (likes + comments + shares) / reach

  // Relations
  publishedPost   PublishedPost @relation(fields: [publishedPostId], references: [id])

  @@map("post_analytics")
}

// ─────────────────────────────────────────────
// AGENT RUNS (Audit log)
// ─────────────────────────────────────────────

model AgentRun {
  id              String      @id @default(uuid())
  userId          String
  agentType       AgentType
  status          RunStatus   @default(RUNNING)
  threadId        String?     // LangGraph thread ID (for checkpointing)
  input           Json?
  output          Json?
  error           String?
  startedAt       DateTime    @default(now())
  completedAt     DateTime?
  durationMs      Int?
  tokenUsage      Json?       // {input_tokens, output_tokens, cost}

  // Relations
  user            User        @relation(fields: [userId], references: [id])

  @@map("agent_runs")
}

enum AgentType {
  TREND
  CONTENT
  MEDIA
  SCHEDULER
  PUBLISHER
  ANALYTICS
  SUPERVISOR
}

enum RunStatus {
  RUNNING
  COMPLETED
  FAILED
  INTERRUPTED   // waiting for human input
}

// ─────────────────────────────────────────────
// CONTENT STRATEGY FEEDBACK (Performance Loop)
// ─────────────────────────────────────────────

model ContentStrategyFeedback {
  id                  String   @id @default(uuid())
  userId              String   @unique
  preferredStyles     String[] // ["TRENDY", "STORYTELLING"] - ranked by performance
  avoidTopics         String[] // topics that consistently underperform
  bestPostingHours    Json     // {facebook: {mon: [8,19], tue: [12,20]}, ...}
  topPerformingHooks  String[] // successful hook patterns
  llmRecommendations  Json?    // latest AI recommendations
  updatedAt           DateTime @updatedAt

  user                User     @relation(fields: [userId], references: [id])

  @@map("content_strategy_feedback")
}
```

---

## Indexes quan trọng

```sql
-- Tìm trending topics theo user + chưa expire
CREATE INDEX idx_trending_topics_user_expiry
  ON trending_topics(user_id, expires_at)
  WHERE expires_at > NOW();

-- Analytics theo published post + thời gian
CREATE INDEX idx_post_analytics_post_time
  ON post_analytics(published_post_id, collected_at DESC);

-- Scheduled posts chưa đăng
CREATE INDEX idx_post_schedules_status_time
  ON post_schedules(status, scheduled_at)
  WHERE status = 'SCHEDULED';

-- Prompt cache lookup
CREATE INDEX idx_media_assets_prompt_hash
  ON media_assets(prompt_hash);

-- Agent runs theo user + loại
CREATE INDEX idx_agent_runs_user_type
  ON agent_runs(user_id, agent_type, started_at DESC);
```

---

## Migration strategy

1. **Sprint 1:** Users, SocialAccounts, IndustryKeywords
2. **Sprint 2:** TrendingTopics
3. **Sprint 3:** ContentDrafts
4. **Sprint 4:** MediaAssets
5. **Sprint 5:** PostSchedules, PublishedPosts
6. **Sprint 6:** PostAnalytics, ContentStrategyFeedback
7. **Sprint 7:** AgentRuns (thêm vào từ Sprint 1 nhưng đầy đủ ở Sprint 7)

Dùng `prisma migrate dev` trong development, `prisma migrate deploy` trong production.
