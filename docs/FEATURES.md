# Feature Implementation Graph

This document tracks all implemented sub-features across the project, organized by core feature area.

---

## Feature 1: Trending Scanner Agent

**Status:** Implemented | **Sprint:** 2 | **Location:** `ai-service/`

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
├─── AI Analyzer (Claude Sonnet)                  ← app/agents/analyzer.py
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

## Upcoming Features (Planned)

```
Feature 2: Content Generation Agent              ← Sprint 3 (Weeks 5-6)
├── 3 writing styles (trendy, professional, storytelling)
├── Platform-specific captions (Facebook, Instagram)
├── Hashtag generation
├── Short script writing
└── Human-in-the-loop review (LangGraph interrupt)

Feature 3: Media Creation Agent                   ← Sprint 4 (Weeks 7-8)
├── DALL-E 3 image generation
├── Prompt engineering pipeline
├── Platform-specific resizing (feed, story, cover)
├── Prompt caching (SHA256 hash)
└── Human approval checkpoint

Feature 4: Scheduling Agent                       ← Sprint 5 (Weeks 9-10)
├── Golden hours analysis
├── BullMQ delayed jobs
├── Calendar-based scheduling
└── Drag-and-drop rescheduling

Feature 5: Publishing Agent                       ← Sprint 5 (Weeks 9-10)
├── Facebook Graph API integration
├── Instagram Graph API (2-step container flow)
├── Rate limit handling (exponential backoff)
└── Retry logic (5 attempts)

Feature 6: Analytics Agent                        ← Sprint 6 (Week 11)
├── Metrics collection (likes, comments, shares, reach)
├── Performance reports
├── Strategy feedback loop
└── AI-generated weekly insights
```

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `←` | File location or reference |
| `├──` | Sub-feature (has siblings below) |
| `└──` | Last sub-feature in group |
| **Bold** | Status indicator |
