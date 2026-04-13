# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

AI-powered technology trend scanner and TikTok content pipeline (thesis project). Three-tier architecture: **Frontend** (Next.js 14) + **Backend** (NestJS) + **AI Service** (FastAPI + LangGraph).

**Data source:** HackerNews | **Target platform:** TikTok | **Domain:** Technology

## Commands

### AI Service (FastAPI — `ai-service/`)

```bash
cd ai-service
pip install -e ".[dev]"                    # Install with dev dependencies
alembic upgrade head                       # Run database migrations
uvicorn app.main:app --reload --port 8000  # Start dev server

# Testing & code quality
pytest tests/                              # All tests
pytest tests/unit_tests/                   # Unit tests only
pytest tests/integration_tests/            # Integration tests only
ruff check .                               # Linting (line-length=100, py311)
mypy --strict .                            # Type checking
```

### Backend (NestJS — `backend/`)

```bash
cd backend
npm install                                # Install dependencies
npx prisma generate                        # Generate Prisma client
npx prisma migrate deploy                  # Run migrations
npm run start:dev                          # Start dev server (port 3000)

# Testing & code quality
npm run test                               # Jest tests
npm run lint                               # ESLint
```

### Frontend (Next.js — `frontend/`)

```bash
cd frontend
npm install                                # Install dependencies
npm run dev                                # Start dev server (port 3001)
npm run build                              # Production build
npm run lint                               # ESLint
```

### Infrastructure

```bash
docker compose up -d postgres redis        # Start PostgreSQL 16 + Redis 7
docker compose up -d                       # Start all services (includes ai-service + backend)
```

See [RUNBOOK.md](RUNBOOK.md) for full setup guide including DB role bootstrap and Prisma baseline.

## Architecture

### LangGraph Pipelines

Three LangGraph pipelines in `ai-service/app/agents/`:

**Pipeline 1 — Trend Scanning** (`supervisor.py`):
```
START → hackernews_scanner → collect_results → trend_analyzer → content_saver → persist_results → [conditional] → END
                                                                                                      ↓ (if generate_posts=true)
                                                                                                  generate_posts_node → END
```

**Pipeline 2 — Post Generation** (`post_generator/graph.py`):
```
START → strategy_alignment → content_generation → image_prompt_creation → image_generation → auto_review → [review_router] → output_packaging → END
                                  ↑                                                                            ↓ (score < 7 & revision < 2)
                                  └────────────────────────────────────────────────────────────────────────── revise
```

**Pipeline 3 — Publish Post** (`publish_post/graph.py`):
```
START → resolve_and_validate → golden_hour → scheduler → [conditional] → END
                                                              ↓ (publish_now)
                                                          publish_node → END
```

### LLM Configuration

LLM clients in `app/clients/openai_client.py` (all GPT-4o via `langchain-openai`):

| Function | Max Tokens | Temp | Used By |
|----------|-----------|------|---------|
| `get_llm()` | 4,096 | 0.0 | General tasks |
| `get_analyzer_llm()` | 16,384 | 0.1 | `trend_analyzer` |
| `get_report_llm()` | 8,192 | 0.3 | Reporter |
| `get_content_gen_llm()` | 8,192 | 0.7 | `strategy_alignment`, `content_generation` |
| `get_review_llm()` | 4,096 | 0.1 | `auto_review`, `image_prompt_creation` |

### Infrastructure Layer (`app/core/`)

- **Cache** (`cache.py`): Redis JSON cache, `cache:` key prefix, 30-min TTL
- **Rate Limiter** (`rate_limiter.py`): Redis sorted-set sliding window (HN: 30 req/60s)
- **Dedup** (`dedup.py`): SHA256 of first 100 normalized title chars + Jaccard similarity
- **Storage** (`storage.py`): Local filesystem / S3 abstraction for reports, posts, images
- **Retry** (`retry.py`): `@with_retry` decorator (tenacity exponential backoff)
- **Exceptions** (`exceptions.py`): `ScannerError` base → `RateLimitError`, `ApiError`, `ScraperError`

### Database

**Multi-schema PostgreSQL** with role-based access:
- `ai` schema (Alembic-managed, owned by `ai_svc`): trend data + content pipeline
- `app` schema (Prisma-managed, owned by `backend_svc`): users + auth

**AI schema models** (SQLAlchemy 2.0 async, `app/db/models/`):
- **ScanRun**: scan lifecycle (PENDING→RUNNING→COMPLETED/PARTIAL/FAILED)
- **TrendItem**: content + engagement metrics + AI analysis (category, sentiment, lifecycle, relevance_score, quality_score)
- **TrendComment**: comments per trend item
- **ContentPost**: generated posts (caption, hashtags, CTA, image_prompt, review_score, status)
- **PublishedPost**: publish tracking (TikTok publish_id, golden_hour_slot, status, retry_count)
- **UserPlatformToken**: encrypted OAuth tokens (Fernet)
- **EngagementTimeSlot**: golden hour engagement data per platform
- **ScanSchedule**: cron expressions for scheduled scans

**App schema models** (Prisma, `backend/prisma/schema.prisma`):
- **User**: email, passwordHash, displayName, role (admin/user)
- **AuthIdentity**: provider (local/google), providerUserId
- **RefreshToken**: JWT refresh token tracking
- **AuditLog**: action logging

Key enums: `ScanStatus`, `Platform` (hackernews), `Sentiment`, `TrendLifecycle`, `ContentStatus`, `PostFormat` (7 formats), `PublishStatus`, `PublishMode`

### API Endpoints

**AI Service** (`app/api/v1/` — port 8000):
- `POST /api/v1/scan` — trigger async scan (202)
- `GET /api/v1/scan/{scan_id}/status` — poll scan progress
- `GET /api/v1/trends` — list with filters + pagination
- `GET /api/v1/trends/top` — top trends by time window
- `GET /api/v1/trends/{trend_id}` — full detail
- `POST/GET /api/v1/scan/schedule` — cron schedule management
- `GET /api/v1/reports` / `GET /api/v1/reports/{scan_run_id}` — reports
- `POST /api/v1/posts/generate` — trigger post generation (202)
- `GET /api/v1/posts` / `GET /api/v1/posts/{id}` — list/detail posts
- `PATCH /api/v1/posts/{id}/status` — update post status
- `POST /api/v1/publish/{id}` — publish to TikTok
- `GET /api/v1/auth/tiktok/login` — TikTok OAuth redirect
- `GET /api/v1/auth/tiktok/callback` — TikTok OAuth callback

**Backend Gateway** (NestJS — port 3000, global prefix `/v1`, JWT required unless noted):
- `POST /v1/auth/register` — register (public)
- `POST /v1/auth/login` — login (public)
- `POST /v1/auth/refresh` — rotate tokens (public)
- `POST /v1/auth/logout` — revoke token
- `GET /v1/auth/me` — current user profile
- `GET /v1/auth/google` — Google OAuth (public)
- `GET/POST /v1/scans` — list/trigger scans
- `GET /v1/scans/{id}/status` — poll scan status
- `GET /v1/trends` — list trends with filters
- `GET /v1/trends/top` — top trends by time window
- `GET /v1/posts` — list content posts
- `POST /v1/posts/generate` — generate posts (proxied to ai-service)
- `PATCH /v1/posts/{id}/status` — update post workflow status
- `POST /v1/publish/{postId}` — publish immediately
- `POST /v1/publish/{postId}/schedule` — schedule publish
- `POST /v1/publish/{postId}/auto` — auto-schedule at golden hour
- `DELETE /v1/publish/{postId}/schedule` — cancel scheduled publish
- `GET /v1/publish/{publishedPostId}/status` — poll publish status
- `GET /v1/publish/golden-hours` — engagement golden hours
- `GET /v1/reports` — list reports

### External Services

| Service | Client | Purpose |
|---------|--------|---------|
| HackerNews | `app/tools/hackernews_tool.py` | Firebase API — crawl top stories |
| OpenAI GPT-4o | `app/clients/openai_client.py` | Trend analysis, content generation, review |
| BFL (Black Forest Labs) | `app/clients/bfl_client.py` | Image generation |
| TikTok API | `app/clients/tiktok_client.py` | OAuth + photo post publishing |
| Firecrawl | `app/clients/firecrawl_client.py` | Web scraping fallback |

### Config

**AI Service** — Pydantic Settings in `app/config.py`, singleton via `@lru_cache get_settings()`. Key env vars: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `BFL_API_KEY`, `S3_BUCKET`, `REQUIRE_INTERNAL_AUTH`, `INTERNAL_API_KEY`, `APP_ENV`, `LOG_LEVEL`.

**Backend** — NestJS ConfigModule from `backend/.env`. Key vars: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AI_SERVICE_URL`, `AI_SERVICE_INTERNAL_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Docker

```bash
docker compose up -d                       # All services (postgres + redis + ai-service + backend)
docker compose up -d postgres redis        # Just infra for local dev
```

Services: postgres:16 (5432), redis:7 (6379), ai-service (8000), backend (3000). Frontend runs separately on :3001.

DB init: `backend/docker/init-db.sql` bootstraps `ai_svc`/`backend_svc` roles and `ai`/`app` schemas on first boot.

## Design Docs

Architecture and roadmap in `docs/`. Key references:
- `docs/07-post-generation-agent.md` — Post generation pipeline details
- `docs/08-publish-post-agent.md` — TikTok publishing pipeline details
- `docs/09-backend-api-layer.md` — NestJS backend architecture
- `docs/architecture-diagrams.md` — Mermaid diagrams (system, pipelines, ERD, data flow)
