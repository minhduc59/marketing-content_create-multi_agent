# Feature Implementation Graph

This document tracks all implemented and planned features across the project, organized by the F01-F10 feature system.

---

## Feature Index (F01-F10)

| ID | Feature | Agent | Stage | Sprint | Status |
|----|---------|-------|-------|--------|--------|
| F01 | [Orchestrator Router](features/F01-orchestrator-router.md) | Orchestrator | — | 1-2 | Implemented |
| F02 | [Trend Discovery](features/F02-trend-discovery.md) | Trending-Scanner | 1 | 2 | Implemented |
| F03 | [Trend Analysis](features/F03-trend-analysis.md) | Trending-Scanner | 2 | 2 | Implemented |
| F04 | [Report Generation](features/F04-report-generation.md) | Trending-Scanner | 3 | 2 | Implemented |
| F05 | [Content Generation](features/F05-content-generation.md) | Post-Generation | 4 | 3 | Planned |
| F06 | [Media Creation](features/F06-media-creation.md) | Post-Generation | 5 | 4 | Planned |
| F07 | [Scheduling](features/F07-scheduling.md) | Publish-Post | 6 | 5 | Planned |
| F08 | [Auto Publish](features/F08-auto-publish.md) | Publish-Post | 7 | 5 | Planned |
| F09 | [Performance Feedback](features/F09-performance-feedback.md) | Performance-Upgrade | 8 | 6 | Planned |
| F10 | [Human Review Gate](features/F10-human-review-gate.md) | Orchestrator | — | 3-4 | Planned |

---

## Detailed Implementation Trees

### Trending Scanner Agent (F02 + F03 + F04)

**Status:** F02 & F03 & F04 Implemented | **Location:** `ai-service/`

```
Trending Scanner Agent
│
├─── LangGraph Supervisor Graph
│    ├── Fan-out routing (Send pattern)           ← app/agents/supervisor.py
│    ├── Fan-in collection + validation           ← app/agents/supervisor.py
│    ├── Shared state (TrendScanState)            ← app/agents/state.py
│    ├── Background scan execution (async)        ← app/agents/supervisor.py:run_scan()
│    └── Graceful degradation (partial status)    ← ScanStatus.PARTIAL on partial failure
│
├─── Platform Scanners (6 concurrent nodes)
│    │
│    ├── YouTube Scanner                          ← app/agents/scanners/youtube.py
│    │   ├── Trending videos (mostPopular chart)  ← app/tools/youtube_tool.py
│    │   ├── Video metadata extraction            ← snippet, statistics, thumbnails
│    │   └── Search by query                      ← YouTube search API
│    │
│    ├── TikTok Scanner                           ← app/agents/scanners/tiktok.py
│    │   ├── Trending feed (explore)              ← app/tools/tiktok_tool.py
│    │   ├── Trending hashtags/challenges         ← RapidAPI endpoint
│    │   └── Video + sound metadata               ← views, likes, shares, music info
│    │
│    ├── Twitter/X Scanner                        ← app/agents/scanners/twitter.py
│    │   ├── Trending topics by country           ← app/tools/twitter_tool.py
│    │   ├── Top tweets per topic                 ← search endpoint
│    │   └── Tweet media extraction               ← images, videos, hashtags
│    │
│    ├── Instagram Scanner                        ← app/agents/scanners/instagram.py
│    │   ├── Trending reels                       ← app/tools/instagram_tool.py
│    │   ├── Hashtag top posts                    ← hashtag search endpoint
│    │   └── Reel/post media extraction           ← video URLs, image candidates
│    │
│    ├── Google Trends Scanner                    ← app/agents/scanners/google_trends.py
│    │   ├── Daily trending searches              ← app/tools/google_trends_tool.py
│    │   └── Related rising queries               ← top 5 keywords expansion
│    │
│    └── Reddit Scanner                           ← app/agents/scanners/reddit.py
│        ├── Hot posts from 17 subreddits         ← app/tools/reddit_tool.py
│        ├── r/popular cross-subreddit trending   ← popular endpoint
│        └── Post dedup by ID                     ← in-memory seen set
│
├─── AI Analyzer (Claude Sonnet) — F03           ← app/agents/analyzer.py
│    ├── Auto-categorization                      ← 16 categories (tech, fashion, food...)
│    ├── Sentiment analysis                       ← positive/negative/neutral/mixed
│    ├── Trend lifecycle detection                ← rising/peak/declining
│    ├── Relevance scoring (0-10)                 ← cross-platform + engagement + novelty
│    ├── Related topics extraction                ← 2-5 related keywords per item
│    ├── Batch processing (40-item chunks)        ← context window management
│    ├── JSON response parsing                    ← handles markdown code blocks
│    └── Fallback on LLM failure                  ← defaults to neutral/rising/5.0
│
├─── Cross-Platform Intelligence
│    ├── Dedup key computation (SHA256)            ← app/core/dedup.py
│    ├── Title normalization (unicode, lowercase)  ← strip accents, special chars
│    ├── Jaccard similarity matching               ← word overlap ratio (threshold 0.5)
│    ├── Cross-platform group detection            ← same trend on multiple platforms
│    └── Score boosting for multi-platform trends  ← +20% per additional platform
│
├─── Report Generation — F04 (Implemented)
│    ├── Markdown report generation via LLM       ← app/agents/reporter.py
│    ├── Executive summary + market overview
│    ├── Trend ranking table (all items)
│    ├── Detailed analysis (top 10 with engagement data)
│    ├── Content angle suggestions (2-3 per top trend) ← two-call LLM strategy
│    ├── Cross-platform trend analysis
│    ├── Fallback template on LLM failure
│    ├── Local file storage (reports/{scan_run_id}/) ← reports/ folder (S3 in prod)
│    ├── JSON summary for programmatic access     ← summary.json alongside report.md
│    └── report_file_path persisted to ScanRun    ← app/db/models/scan.py
│
├─── Data Extraction (per trending item)
│    ├── Core: title, description, content body, source URL
│    ├── Tags: hashtags, tags, related topics
│    ├── Engagement: views, likes, comments, shares, trending score
│    ├── Media: thumbnail URL, video URL, image URLs
│    ├── Author: name, profile URL, follower count
│    ├── AI-generated: category, sentiment, lifecycle, relevance score
│    └── Raw: original API response preserved
│
├─── REST API Endpoints                           ← app/api/v1/
│    ├── POST /api/v1/scan                        ← Trigger async scan (202 Accepted)
│    ├── GET  /api/v1/scan/{id}/status            ← Real-time scan progress
│    ├── GET  /api/v1/trends                      ← List with filtering + pagination
│    │   ├── Filter: platform, category, sentiment, lifecycle, min_score
│    │   ├── Sort: relevance_score, views, discovered_at
│    │   └── Paginate: page + limit
│    ├── GET  /api/v1/trends/{id}                 ← Full detail with comments
│    ├── GET  /api/v1/trends/top                  ← Top ranked (24h, 7d, 30d)
│    ├── POST /api/v1/scan/schedule               ← Create cron-based schedule
│    ├── GET  /api/v1/scan/schedule               ← List all schedules
│    ├── GET  /api/v1/reports                     ← List generated reports
│    ├── GET  /api/v1/reports/{id}                ← Full markdown report content
│    ├── GET  /api/v1/reports/{id}/summary        ← JSON summary with content angles
│    └── GET  /health                             ← Service health check
│
├─── Database Layer                               ← app/db/
│    ├── ScanRun model                            ← status tracking, duration, errors
│    ├── TrendItem model                          ← 30+ fields, composite indexes
│    ├── TrendComment model                       ← sampled comments with sentiment
│    ├── ScanSchedule model                       ← cron expression, active flag
│    ├── Async SQLAlchemy 2.x + asyncpg           ← app/db/session.py
│    └── Alembic migrations                       ← alembic/
│
├─── Core Infrastructure                          ← app/core/
│    ├── Rate Limiter (Redis sliding window)      ← per-platform quotas
│    │   ├── YouTube: 10,000 units / 24h
│    │   ├── TikTok/Twitter/Instagram: 500 req / 24h
│    │   ├── Google Trends: 12 req / 60s
│    │   ├── Reddit: 60 req / 60s
│    │   └── Firecrawl: 500 credits / 24h
│    ├── Cache (Redis with TTL)                   ← 30-min cache per platform
│    ├── Retry logic (tenacity)                   ← exponential backoff, configurable
│    ├── Structured logging (structlog)           ← JSON in prod, console in dev
│    └── Custom exceptions                        ← ScannerError, RateLimitError, ApiError
│
├─── API Clients (Singletons)                     ← app/clients/
│    ├── Anthropic (ChatAnthropic)                ← Claude Sonnet for analysis
│    ├── RapidAPI (httpx.AsyncClient)             ← shared headers for TikTok/Twitter/IG
│    └── Firecrawl (FirecrawlApp)                 ← web scraping fallback
│
└─── Infrastructure
     ├── Docker Compose                           ← postgres:16 + redis:7 + app
     ├── Dockerfile (Python 3.11-slim)            ← with hot-reload
     ├── Pydantic Settings (.env)                 ← 12 environment variables
     └── pyproject.toml                           ← 20+ dependencies
```

---

### Post Generation Agent (F05 + F06)

**Status:** Planned | **Sprint:** 3-4

```
Post Generation Agent
│
├─── Content Brain — F05 (Sprint 3)
│    ├── Read trend report from S3               ← ai-service/app/agents/content_generator.py
│    ├── 3 writing styles                        ← trendy / professional / storytelling
│    ├── Platform-specific captions              ← Facebook (150-300w) / Instagram (100-150w)
│    ├── Hashtag generation                      ← 3-5 (FB) / 15-20 (IG)
│    ├── Short script (50-80 words)              ← hook + body + CTA
│    ├── Image prompt generation                 ← visual elements from caption
│    ├── Auto-review loop                        ← LLM self-check, score >= 7 to pass
│    └── Content Pool save                       ← status: "draft" in content_drafts table
│
├─── Visual Factory — F06 (Sprint 4)
│    ├── Prompt refinement via LLM               ← ai-service/app/agents/media_creator.py
│    ├── Prompt cache (SHA256 hash)              ← skip DALL-E if prompt already generated
│    ├── DALL-E 3 image generation               ← 1024x1024, vivid style, $0.04/image
│    ├── Brand template application              ← logo overlay, color tint (Pillow)
│    ├── Platform-specific resize                ← FB 1200x630, IG 1080x1080, Story 1080x1920
│    ├── WebP conversion (quality 85)
│    ├── S3 upload                               ← media/{user_id}/{content_id}/{variant}.webp
│    └── Content Pool update                     ← media URLs linked to content draft
│
├─── Backend Endpoints (NestJS)
│    ├── POST /content/generate                  ← trigger ContentAgent
│    ├── GET  /content/drafts                    ← list drafts (filterable)
│    ├── PATCH /content/:id/approve              ← approve draft
│    ├── PATCH /content/:id/edit                 ← user edits
│    ├── POST /content/:id/regenerate            ← regenerate with feedback
│    ├── POST /media/generate                    ← trigger MediaAgent
│    ├── GET  /media/assets                      ← list media
│    ├── PATCH /media/:id/approve                ← approve media
│    └── POST /media/:id/regenerate              ← regenerate media
│
└─── Frontend Pages
     ├── /content — Content Studio               ← tabs per style, platform preview
     ├── Rich text editor for manual edits
     ├── Approve / Reject / Regenerate buttons
     ├── Character counter per platform
     ├── Hashtag chips (removable)
     ├── /media — Visual Factory grid            ← preview per platform format
     └── Zoom modal + download
```

---

### Publish & Feedback Agent (F07 + F08 + F09)

**Status:** Planned | **Sprint:** 5-6

```
Publish & Feedback
│
├─── Golden Hour Scheduler — F07 (Sprint 5)
│    ├── Historical engagement analysis          ← ai-service/app/agents/scheduler.py
│    ├── Golden hour algorithm                   ← engagement_rate = (likes + comments*2 + shares*3) / reach
│    ├── Default schedules                       ← FB: 08/12/19h, IG: 07/11/21h
│    ├── BullMQ delayed jobs                     ← backend/src/queue/publisher.queue.ts
│    ├── Conflict resolution                     ← min 2h gap per platform
│    └── Calendar view + drag-and-drop           ← react-big-calendar / shadcn
│
├─── Cross-post Engine — F08 (Sprint 5)
│    ├── Facebook Graph API publishing           ← backend/src/social/facebook.service.ts
│    │   ├── Photo posts (/photos)
│    │   ├── Text posts (/feed)
│    │   └── Rate limit: 200 calls/hour/page
│    ├── Instagram Content Publishing API        ← backend/src/social/instagram.service.ts
│    │   ├── 2-step container flow
│    │   ├── Container polling (1-5 min)
│    │   └── Rate limit: 25 publishes/24h
│    ├── Cross-post adapter                      ← 1 content → multi-platform format
│    ├── Retry logic                             ← max 3 attempts, exponential backoff
│    └── OAuth token management                  ← long-lived tokens, auto-refresh
│
├─── Performance Upgrade — F09 (Sprint 6)
│    ├── Metrics collection (cron 6h)            ← ai-service/app/agents/analytics_agent.py
│    │   ├── Facebook Insights API
│    │   └── Instagram Insights API
│    ├── Weekly performance report (LLM)         ← top/low performers, patterns
│    ├── Strategy evolution                      ← versioned strategy object
│    │   ├── Max 2 changes per cycle
│    │   ├── Min 5 posts between updates
│    │   ├── Confidence threshold > 0.7
│    │   └── Full version history + rollback
│    └── Closed-loop feedback                    ← strategy informs F05 content generation
│
├─── Backend Endpoints (NestJS)
│    ├── POST /schedule/create                   ← create schedule
│    ├── GET  /schedule                          ← calendar view
│    ├── PATCH /schedule/:id                     ← reschedule
│    ├── DELETE /schedule/:id                    ← cancel
│    ├── GET  /published                         ← list published posts
│    ├── GET  /analytics/overview                ← 7d/30d dashboard
│    ├── GET  /analytics/posts                   ← per-post metrics
│    ├── GET  /analytics/best-times              ← golden hours
│    ├── GET  /analytics/report                  ← weekly report
│    └── POST /analytics/strategy/rollback/:v    ← rollback strategy
│
└─── Frontend Pages
     ├── /schedule — Calendar view               ← drag-and-drop, status badges
     ├── /analytics — Dashboard                  ← KPI cards, charts (recharts)
     │   ├── Line chart: reach/engagement by day
     │   ├── Bar chart: platform comparison
     │   ├── Post performance table
     │   └── Weekly AI report card
     └── /settings — Social account connect      ← OAuth buttons for FB/IG
```

---

### Human Review Gate (F10)

**Status:** Planned | **Sprint:** 3-4

```
Human Review Gate — F10
│
├─── LangGraph interrupt() mechanism             ← ai-service/app/agents/supervisor.py
│    ├── Pause after Stage 5 (media_created)
│    ├── State checkpointed via PostgresSaver
│    └── Resume after user action (no timeout)
│
├─── Review Modes
│    ├── review_enabled = true                   ← pipeline pauses for approval
│    └── review_enabled = false                  ← auto-approve, skip to Stage 6
│
├─── User Actions
│    ├── Approve → Stage 6 (Scheduling)
│    ├── Edit & Approve → save edits → Stage 6
│    └── Reject + Feedback → Stage 4 (Content Generation)
│
├─── WebSocket Events
│    ├── human_review_needed (server → client)
│    ├── review_submitted (client → server)
│    └── review_completed (server → client)
│
└─── Frontend ApprovalCard
     ├── Content preview (per-platform caption)
     ├── Media preview (per-platform image)
     ├── Approve / Edit & Approve / Reject buttons
     └── Feedback text area (on reject)
```

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `←` | File location or reference |
| `├──` | Sub-feature (has siblings below) |
| `└──` | Last sub-feature in group |
| **Bold** | Status indicator |
