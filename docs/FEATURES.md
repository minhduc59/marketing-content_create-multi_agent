# Feature Implementation Graph

This document tracks all implemented and planned features. Focus: **TikTok** platform, **Technology** domain, **HackerNews** data source.

---

## Feature Index

| ID | Feature | Stage | Status |
|----|---------|-------|--------|
| F02 | [Trend Discovery](features/F02-trend-discovery.md) | Pipeline 1: HN Crawling | Implemented |
| F03 | [Trend Analysis](features/F03-trend-analysis.md) | Pipeline 1: Analysis | Implemented |
| F04 | [Report Generation](features/F04-report-generation.md) | Pipeline 1: Reporting | Implemented |
| F05 | TikTok Post Generation | Pipeline 2: Post Gen | Implemented |
| F06 | TikTok Publishing | Pipeline 3: Publish | Implemented |
| F07 | Backend API Layer | Backend (NestJS) | Implemented |
| F08 | Frontend Dashboard | Frontend (Next.js) | Implemented |

---

## Detailed Implementation Tree

### Pipeline 1: HackerNews → Analysis → Reports (F02 + F03 + F04)

**Status:** Implemented | **Location:** `ai-service/app/agents/`

```
Pipeline 1: Trend Scanning
│
├─── LangGraph Pipeline
│    ├── Graph builder (supervisor.py)                   ← app/agents/supervisor.py
│    ├── Shared state (TrendScanState)                   ← app/agents/state.py
│    ├── Background scan execution (async)               ← app/agents/supervisor.py:run_scan()
│    ├── Conditional post generation routing             ← _should_generate_posts()
│    └── Graceful degradation (partial status)           ← ScanStatus.PARTIAL on failure
│
├─── HackerNews Scanner
│    ├── Top stories via Firebase API                    ← app/agents/scanners/hackernews.py
│    ├── Full article text extraction                    ← app/tools/hackernews_tool.py
│    ├── Technology relevance filtering                  ← keyword-based tech filter
│    └── Rate limiting (30 req/60s)                      ← app/core/rate_limiter.py
│
├─── Trend Analyzer (GPT-4o) — F03                       ← app/agents/trend_analyzer.py
│    ├── Quality scoring (1-10), discard < 5
│    ├── Deep analysis: sentiment, lifecycle, engagement_prediction
│    ├── Source type classification                      ← official_blog/news/research/community/social
│    ├── LinkedIn/content angles extraction
│    ├── Vietnamese trend report generation
│    ├── Content angles JSON generation
│    └── Batch processing (40-item chunks)
│
├─── Content Saver                                        ← app/agents/content_saver.py
│    ├── Save articles as markdown                        ← YAML frontmatter + full content
│    └── Output: reports/{scan_id}/articles/{slug}.md
│
├─── Persist Results                                      ← app/agents/supervisor.py:persist_results_node()
│    ├── Bulk insert TrendItems to PostgreSQL
│    ├── Update ScanRun status + duration
│    └── Auto-create ContentPosts (draft status)
│
├─── REST API Endpoints                                   ← app/api/v1/
│    ├── POST /api/v1/scan                               ← Trigger HN scan (202)
│    ├── GET  /api/v1/scan/{id}/status                   ← Scan progress
│    ├── GET  /api/v1/trends                             ← List + filter + paginate
│    ├── GET  /api/v1/trends/top                         ← Top ranked (24h/7d/30d)
│    ├── GET  /api/v1/trends/{id}                        ← Full detail
│    ├── GET  /api/v1/reports                            ← List reports
│    └── GET  /api/v1/reports/{id}                       ← Full markdown report
│
├─── Database Layer                                       ← app/db/models/
│    ├── ScanRun (lifecycle: pending→running→completed/partial/failed)
│    ├── TrendItem (content + engagement + AI analysis)
│    ├── TrendComment (comments per trend)
│    ├── ScanSchedule (cron expressions)
│    └── Platform enum: HACKERNEWS
│
└─── Core Infrastructure                                  ← app/core/
     ├── Rate Limiter (Redis sliding window)
     ├── Cache (Redis, 30-min TTL)
     ├── Dedup (SHA256 + Jaccard similarity)
     ├── Retry (tenacity exponential backoff)
     ├── Storage (local/S3 abstraction)
     └── Structured logging (structlog)
```

---

### Pipeline 2: TikTok Post Generation (F05)

**Status:** Implemented | **Location:** `ai-service/app/agents/post_generator/`

```
Pipeline 2: Post Generation
│
├─── LangGraph Pipeline                                   ← post_generator/graph.py
│    ├── Graph builder: build_post_gen_graph()
│    ├── State: PostGenState                              ← post_generator/state.py
│    ├── Conditional revision loop (max 2 iterations)
│    └── Prompts: 7 format templates                      ← post_generator/prompts.py
│
├─── Strategy Alignment                                   ← post_generator/nodes/strategy_alignment.py
│    ├── Load TrendItems from DB
│    ├── Read trend report markdown
│    ├── Load strategy config
│    └── Select trends + angles + formats
│
├─── Content Generation                                   ← post_generator/nodes/content_generation.py
│    ├── 7 TikTok post formats:
│    │   ├── quick_tips, hot_take, trending_breakdown
│    │   ├── did_you_know, tutorial_hack
│    │   └── myth_busters, behind_the_tech
│    ├── Hook + body + CTA + hashtags
│    └── GPT-4o (8K tokens, temp=0.7)
│
├─── Image Generation                                     ← post_generator/nodes/
│    ├── image_prompt_creation.py                         ← BFL prompt generation
│    └── image_generation.py                              ← BFL API call + storage
│
├─── Auto-Review                                          ← post_generator/nodes/auto_review.py
│    ├── 7 Weighted Criteria:
│    │   ├── Hook strength (20%)
│    │   ├── Value density (15%)
│    │   ├── Data points (15%)
│    │   ├── Strategy alignment (15%)
│    │   ├── Originality (15%)
│    │   ├── CTA quality (10%)
│    │   └── Format compliance (10%)
│    └── Score < 7 & revision < 2 → revise
│
├─── Output Packaging                                     ← post_generator/nodes/output_packaging.py
│    ├── Build final JSON output
│    ├── Enrich: word_count, read_time, posting_day, timing_window
│    ├── Save to storage (posts/{scan_id}/)
│    └── Insert ContentPosts to PostgreSQL
│
└─── Database: ContentPost model
     ├── format (PostFormat enum: 7 types)
     ├── caption, hashtags, cta, image_prompt
     ├── status (ContentStatus: draft→approved→published)
     ├── review_score, review_notes, review_criteria
     └── revision_count, file_path, image_path
```

---

### Pipeline 3: TikTok Publishing (F06)

**Status:** Implemented | **Location:** `ai-service/app/agents/publish_post/`

```
Pipeline 3: Publish Post
│
├─── LangGraph Pipeline                                   ← publish_post/graph.py
│    ├── Graph builder: build_publish_graph()
│    ├── State: PublishPostState                           ← publish_post/state.py
│    └── Conditional routing (publish_now | scheduled)
│
├─── Resolve & Validate                                   ← publish_post/graph.py:resolve_and_validate_node()
│    ├── Load ContentPost from DB
│    ├── Validate status (approved/published)
│    ├── Check for duplicate publishes
│    ├── Create PublishedPost record
│    ├── Resolve image public URL                         ← app/core/storage.py
│    └── Validate TikTok token exists                     ← publish_post/token_manager.py
│
├─── Golden Hour                                          ← publish_post/golden_hour.py
│    ├── Load EngagementTimeSlot data per user/platform
│    ├── Calculate optimal posting time
│    └── Default hours: 07:00, 12:00, 19:00 (Asia/Ho_Chi_Minh)
│
├─── Scheduler                                            ← publish_post/scheduler_node.py
│    ├── Decide: publish now vs schedule for golden hour
│    └── APScheduler + Redis for deferred jobs
│
├─── TikTok Publish                                       ← publish_post/publish_node.py
│    ├── Assemble caption (body + hashtags + CTA)         ← publish_post/caption_assembler.py
│    ├── TikTok API photo post (3-step process)           ← app/clients/tiktok_client.py
│    ├── Retry logic (3x with exponential backoff)
│    ├── Poll publish status (max 30 attempts)
│    └── Privacy level control (SELF_ONLY default)
│
├─── Token Management                                     ← publish_post/token_manager.py
│    ├── Fernet encryption/decryption
│    ├── Token refresh on expiry
│    └── UserPlatformToken model
│
└─── Database Models
     ├── PublishedPost (publish tracking, TikTok IDs, status, retry_count)
     ├── UserPlatformToken (encrypted OAuth tokens)
     └── EngagementTimeSlot (golden hour data per platform)
```

---

### Backend API Layer (F07)

**Status:** Implemented | **Location:** `backend/src/`

```
Backend (NestJS)
│
├─── Authentication                                       ← backend/src/auth/
│    ├── JWT (access + refresh tokens)
│    ├── Google OAuth via Passport
│    ├── User registration + login
│    └── Token refresh + revocation
│
├─── 11 NestJS Modules
│    ├── AuthModule                                       ← auth/
│    ├── UsersModule                                      ← users/
│    ├── PrismaModule                                     ← prisma/
│    ├── AiServiceModule                                  ← ai-service/
│    ├── ScansModule                                      ← scans/
│    ├── TrendsModule                                     ← trends/
│    ├── PostsModule                                      ← posts/
│    ├── PublishModule                                    ← publish/
│    ├── ReportsModule                                    ← reports/
│    ├── TiktokAuthModule                                ← tiktok-auth/
│    └── StatusModule (WebSocket)                         ← status/
│
├─── AI Service Client                                    ← ai-service/ai-service.client.ts
│    ├── Typed HTTP wrapper for all ai-service endpoints
│    ├── triggerScan(), getScanStatus()
│    ├── generatePosts()
│    └── publishNow(), schedulePublish(), cancelScheduled()
│
├─── Real-Time (WebSocket)                                ← status/status.gateway.ts
│    ├── Socket.IO gateway
│    ├── Scan progress events
│    └── Publish progress events
│
├─── Multi-Schema Database                                ← backend/prisma/schema.prisma
│    ├── app schema (owned): users, auth_identities, refresh_tokens, audit_logs
│    └── ai schema (read-only mirror): scan_runs, trend_items, content_posts, etc.
│
└─── Infrastructure
     ├── Rate limiting (ThrottlerModule: 100 req/60s)
     ├── Global JWT guard
     └── Docker Compose integration + init-db.sql
```

---

### Frontend Dashboard (F08)

**Status:** Implemented | **Location:** `frontend/src/`

```
Frontend (Next.js 14)
│
├─── Auth Pages                                           ← frontend/src/app/(auth)/
│    ├── /auth/login                                     ← Email + Google OAuth
│    └── /auth/register                                  ← New user registration
│
├─── App Pages (Protected)                                ← frontend/src/app/(app)/
│    ├── /dashboard                                      ← KPI metrics, scan status, publish queue
│    ├── /trends                                         ← Filterable trend list
│    ├── /content                                        ← Generated posts (filter, status)
│    │   └── /content/[id]                               ← Post detail, status update
│    ├── /media                                          ← Generated images library
│    │   └── /media/[id]                                 ← Image detail
│    ├── /schedule                                       ← Recurring scan schedules
│    ├── /analytics                                      ← Post-publish metrics
│    └── /settings
│        ├── /settings/accounts                          ← TikTok linking, golden hours
│        └── /settings/keywords                          ← Brand voice config
│
├─── State Management
│    ├── Zustand stores (auth, pipeline, settings, ui)   ← frontend/src/stores/
│    └── TanStack Query hooks                            ← frontend/src/hooks/api/
│         ├── use-scans, use-trends, use-posts
│         ├── use-publish, use-reports
│         └── Automatic cache invalidation
│
└─── Real-Time
     ├── Socket.IO client                                ← frontend/src/hooks/use-socket.ts
     ├── Scan progress listener                          ← use-scan-progress.ts
     └── Publish progress listener                       ← use-publish-progress.ts
```

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `←` | File location or reference |
| `├──` | Sub-feature (has siblings below) |
| `└──` | Last sub-feature in group |
