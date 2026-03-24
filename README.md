# Marketing Content AI Agent - Multi-Agent System

A fully automated multi-agent AI system that handles the entire content marketing pipeline end-to-end: trend discovery, content generation, media creation, scheduling, publishing, and analytics.

## Problem

Small-to-medium businesses (SMBs) and content creators waste 3-5 hours daily on:
- Searching for trending topics manually
- Writing captions, hashtags, and scripts
- Creating media assets
- Scheduling and publishing posts
- Analyzing performance metrics

## Solution

A 7-stage AI pipeline powered by LangGraph's Supervisor Pattern with human-in-the-loop checkpoints:

```
User Request → Supervisor Agent (LangGraph)
  1. Trend Discovery   → Google Trends, Reddit, YouTube, TikTok, Twitter/X, Instagram
  2. Analysis           → Claude LLM: sentiment, lifecycle, categorization
  3. Content Generation → Captions, hashtags, scripts (3 styles)
  4. Media Creation     → DALL-E 3 image generation with caching
  5. Scheduling         → Golden hours analysis + BullMQ delayed jobs
  6. Publishing         → Facebook/Instagram Graph APIs
  7. Analytics          → Performance metrics + strategy feedback loop
```

Human-in-the-loop checkpoints at stages 3 (content review) and 4 (media approval).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 (App Router), shadcn/ui, Tailwind CSS, TanStack Query, Zustand, recharts |
| **Backend API** | NestJS 10.x, Prisma 5.x, BullMQ + Redis, JWT + Passport.js |
| **AI Service** | FastAPI 0.115.x, LangGraph 0.2.x, Claude Sonnet, DALL-E 3 |
| **Database** | PostgreSQL 16.x |
| **Cache/Queue** | Redis 7.x |
| **Storage** | Cloudflare R2 / AWS S3 |
| **Infrastructure** | Docker + Docker Compose, GitHub Actions |

## Project Structure

```
marketing-content/
├── README.md
├── FEATURES.md                  # Feature implementation graph
├── strategy/                    # Architecture & design documents
│   ├── 00-overview.md           # System overview & architecture
│   ├── 01-agent-design.md       # Agent patterns (Supervisor + 6 agents)
│   ├── 02-feature-roadmap.md    # 7-sprint implementation plan (3 months)
│   ├── 03-database-schema.md    # Full Prisma schema with ERD
│   ├── 04-api-integrations.md   # API integration specs (10 services)
│   └── 05-frontend-ux.md        # UI/UX design & component specs
├── docs/                        # Thesis documents (PDF)
├── ai-service/                  # [ACTIVE] FastAPI AI service
│   ├── app/
│   │   ├── main.py              # FastAPI app, lifespan, CORS
│   │   ├── config.py            # Pydantic Settings (env vars)
│   │   ├── agents/              # LangGraph agent graph
│   │   │   ├── state.py         # Shared state (TypedDict)
│   │   │   ├── supervisor.py    # Graph construction + fan-out/fan-in
│   │   │   ├── analyzer.py      # Claude-powered analysis node
│   │   │   └── scanners/        # 6 platform scanner nodes
│   │   ├── tools/               # Platform API wrappers
│   │   ├── clients/             # Singleton HTTP clients
│   │   ├── core/                # Rate limiter, cache, dedup, retry
│   │   ├── api/v1/              # REST endpoints + Pydantic schemas
│   │   └── db/                  # SQLAlchemy models + session
│   ├── alembic/                 # Database migrations
│   ├── tests/                   # Unit + integration tests
│   ├── docker-compose.yml       # PostgreSQL + Redis + App
│   ├── Dockerfile
│   └── pyproject.toml
├── backend/                     # [PLANNED] NestJS API
└── frontend/                    # [PLANNED] Next.js 15 app
```

## API Integrations

| API | Purpose | Auth | Cost |
|-----|---------|------|------|
| Google Trends (pytrends) | Trend crawling | None | Free |
| Reddit (PRAW) | Trend crawling | OAuth | Free (60 req/min) |
| YouTube Data API v3 | Trending videos | API Key | Free (10k quota/day) |
| TikTok (RapidAPI) | Trending feed + hashtags | RapidAPI Key | Freemium |
| Twitter/X (RapidAPI) | Trending topics + tweets | RapidAPI Key | Freemium |
| Instagram (RapidAPI) | Trending reels + hashtags | RapidAPI Key | Freemium |
| Firecrawl | Web scraping (fallback) | API Key | Freemium |
| Claude Sonnet | LLM analysis & generation | API Key | ~$0.14/day |
| DALL-E 3 | Image generation | API Key | $0.04/image |
| Facebook Graph API | Publish + analytics | OAuth | Free |
| Instagram Graph API | Publish + analytics | OAuth | Free |

## Getting Started

### Prerequisites
- Python 3.11+
- Docker & Docker Compose
- API keys (see `.env.example`)

### Quick Start (AI Service)

```bash
cd ai-service

# Copy and fill environment variables
cp .env.example .env

# Start infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# Install dependencies
pip install -e ".[dev]"

# Run database migrations
alembic upgrade head

# Start the service
uvicorn app.main:app --reload --port 8000
```

### API Usage

```bash
# Health check
curl http://localhost:8000/health

# Trigger a trend scan (free APIs only)
curl -X POST http://localhost:8000/api/v1/scan \
  -H "Content-Type: application/json" \
  -d '{"platforms": ["google_trends", "reddit"]}'

# Check scan status
curl http://localhost:8000/api/v1/scan/{scan_id}/status

# List discovered trends
curl http://localhost:8000/api/v1/trends?sort_by=relevance_score

# Get top trends
curl http://localhost:8000/api/v1/trends/top?timeframe=24h&limit=20
```

## Implementation Roadmap

| Sprint | Duration | Focus | Status |
|--------|----------|-------|--------|
| 1 | Weeks 1-2 | Setup & Architecture | Planned |
| 2 | Weeks 3-4 | Trend Discovery | **In Progress** |
| 3 | Weeks 5-6 | Content Generation | Planned |
| 4 | Weeks 7-8 | Media Creation | Planned |
| 5 | Weeks 9-10 | Scheduling & Publishing | Planned |
| 6 | Week 11 | Analytics & Feedback Loop | Planned |
| 7 | Week 12 | Testing & Polish | Planned |

## Scope

**In Scope:** Trend crawling, content generation (3 styles), image generation, scheduling, Facebook/Instagram publishing, analytics collection.

**Out of Scope:** Videos > 60 seconds, enterprise scale (>1000 users), paid advertising management, TikTok publishing (stretch goal).

## Author

**Ho Dang Minh Duc** - Student ID: 102220140
Thesis Project - Bachelor of Computer Science
