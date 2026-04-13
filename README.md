# Marketing Content AI Agent — Technology Trend & TikTok Content Pipeline

An AI-powered system that crawls trending technology content from Hacker News, analyzes trends with GPT-4o, generates TikTok posts with images, and publishes to TikTok with golden hour scheduling.

## Problem

Technology professionals and content creators spend hours:
- Searching for trending tech topics manually
- Writing social media posts and articles
- Creating visual content for engagement
- Timing posts for optimal reach

## Solution

A three-tier system powered by LangGraph that automates the full content pipeline:

```
HackerNews Crawler → Trend Analysis (GPT-4o) → Post Generation + Image → Auto-Review → TikTok Publishing
```

**Data source:** Hacker News (top stories, full article crawling, tech filtering)
**Target platform:** TikTok (photo posts with captions, hashtags, CTA)
**Domain focus:** Technology

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React 18, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, Socket.IO |
| **Backend** | NestJS, Prisma, Passport (JWT + Google OAuth), Socket.IO, Swagger |
| **AI Service** | FastAPI, LangGraph, GPT-4o, BFL (image generation) |
| **Database** | PostgreSQL 16 (multi-schema: `ai` + `app`), SQLAlchemy 2.0 + Prisma |
| **Cache/Queue** | Redis 7 (caching, rate limiting, APScheduler job store) |
| **Infrastructure** | Docker + Docker Compose |

## Project Structure

```
marketing-content/
├── ai-service/                  # [ACTIVE] FastAPI + LangGraph AI engine
│   ├── app/
│   │   ├── main.py              # FastAPI app, lifespan, CORS
│   │   ├── config.py            # Pydantic Settings (env vars)
│   │   ├── agents/
│   │   │   ├── supervisor.py    # Pipeline 1: Trend scanning graph
│   │   │   ├── state.py         # Shared scan state (TypedDict)
│   │   │   ├── trend_analyzer.py # GPT-4o analysis + report generation
│   │   │   ├── content_saver.py # Save articles as markdown
│   │   │   ├── scanners/        # HackerNews scanner node
│   │   │   ├── post_generator/  # Pipeline 2: Post generation (7 formats)
│   │   │   └── publish_post/    # Pipeline 3: TikTok publishing
│   │   ├── tools/               # HackerNews API wrapper
│   │   ├── clients/             # LLM, BFL, TikTok, Firecrawl clients
│   │   ├── core/                # Rate limiter, cache, dedup, retry, storage
│   │   ├── api/v1/              # REST endpoints + Pydantic schemas
│   │   └── db/                  # SQLAlchemy models + session
│   ├── alembic/                 # Database migrations (ai schema)
│   └── pyproject.toml
├── backend/                     # [ACTIVE] NestJS API gateway
│   ├── src/
│   │   ├── auth/                # JWT + Google OAuth authentication
│   │   ├── scans/               # Scan management (proxy to ai-service)
│   │   ├── trends/              # Trend queries
│   │   ├── posts/               # Content post management
│   │   ├── publish/             # TikTok publishing orchestration
│   │   ├── reports/             # Report retrieval
│   │   ├── tiktok-auth/         # TikTok OAuth flow
│   │   ├── status/              # WebSocket gateway (real-time events)
│   │   ├── ai-service/          # Typed HTTP client for ai-service
│   │   └── prisma/              # Database client module
│   ├── prisma/                  # Prisma schema + migrations (app schema)
│   └── package.json
├── frontend/                    # [ACTIVE] Next.js 14 dashboard
│   ├── src/
│   │   ├── app/                 # App Router pages
│   │   │   ├── (auth)/          # Login, Register
│   │   │   └── (app)/           # Dashboard, Trends, Content, Media, Schedule, Analytics, Settings
│   │   ├── components/          # UI components (shadcn/ui + custom)
│   │   ├── hooks/api/           # TanStack Query hooks
│   │   ├── stores/              # Zustand stores (auth, pipeline, settings, ui)
│   │   └── lib/                 # API client, utilities
│   └── package.json
├── docs/                        # Architecture & design documents
├── docker-compose.yml           # Full stack (postgres + redis + ai-service + backend)
├── RUNBOOK.md                   # Operational setup guide
└── CLAUDE.md                    # Claude Code guidance
```

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Python 3.11+
- Node.js 20+
- OpenAI API key

### Quick Start

```bash
# 1. Start infrastructure
docker compose up -d postgres redis

# 2. Setup AI Service
cd ai-service
cp .env.example .env              # Fill in OPENAI_API_KEY, TIKTOK_CLIENT_KEY, etc.
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3. Setup Backend (new terminal)
cd backend
cp .env.example .env              # Fill in JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev

# 4. Setup Frontend (new terminal)
cd frontend
npm install
npm run dev
```

See [RUNBOOK.md](RUNBOOK.md) for detailed setup including DB role bootstrap, Prisma baseline, and troubleshooting.

### API Usage

```bash
# Register a user (via backend gateway)
curl -s -X POST http://localhost:3000/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@local.dev","password":"password123","displayName":"Demo"}'
# → { "accessToken": "...", "refreshToken": "..." }

ACCESS=<paste accessToken>

# Trigger a HackerNews scan
curl -s -X POST http://localhost:3000/v1/scans \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"platforms":["hackernews"],"max_items_per_platform":10}'

# List discovered trends
curl http://localhost:3000/v1/trends -H "Authorization: Bearer $ACCESS"

# Generate posts from scan results
curl -s -X POST http://localhost:3000/v1/posts/generate \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"scan_run_id":"<scan_id>"}'

# Publish a post to TikTok
curl -s -X POST http://localhost:3000/v1/publish/<post_id> \
  -H "Authorization: Bearer $ACCESS"
```

## Pipeline Architecture

### Pipeline 1 — Trend Scanning & Analysis

```
START
  → hackernews_scanner    (crawl top HN stories, extract articles, filter tech)
  → collect_results       (validate and merge results)
  → trend_analyzer        (GPT-4o: quality scoring, sentiment, lifecycle, report generation)
  → content_saver         (save articles as markdown to reports/{scan_id}/articles/)
  → persist_results       (save to PostgreSQL + auto-generate ContentPosts)
  → [conditional]         (if generate_posts=true → Pipeline 2)
END
```

### Pipeline 2 — Post Generation

```
START
  → strategy_alignment    (load trends, select angles + formats)
  → content_generation    (generate TikTok captions in 7 formats)
  → image_prompt_creation (generate BFL image prompts)
  → image_generation      (call BFL API, save images)
  → auto_review           (score on 7 criteria, weighted)
  → [review_router]       (score < 7 & revision < 2 → revise; else → package)
  → output_packaging      (build final JSON, save to storage + DB)
END
```

### Pipeline 3 — Publish Post

```
START
  → resolve_and_validate  (load ContentPost, check status, resolve image URL, validate TikTok token)
  → golden_hour           (calculate optimal posting time)
  → scheduler             (decide: publish now or schedule via APScheduler)
  → [conditional]         (publish_now → TikTok API; scheduled → APScheduler + Redis)
END
```

## Author

**Ho Dang Minh Duc** - Student ID: 102220140
Thesis Project - Bachelor of Computer Science
