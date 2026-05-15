# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


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


### External Services

| Service | Client | Purpose |
|---------|--------|---------|
| HackerNews | `app/tools/hackernews_tool.py` | Firebase API — crawl top stories |
| OpenAI GPT-4o | `app/clients/openai_client.py` | Trend analysis, content generation, review |
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
