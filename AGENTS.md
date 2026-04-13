# AGENTS.md

This file provides guidance to WARP (warp.dev) agents working with code in this repository.

## Repository Status

Three active services: `ai-service/` (FastAPI + LangGraph), `backend/` (NestJS), `frontend/` (Next.js 14). All are integrated and functional.

## Commands

### AI Service (`ai-service/`)

```bash
cd ai-service
pip install -e ".[dev]"                   # Install with dev dependencies
alembic upgrade head                      # Run database migrations
uvicorn app.main:app --reload --port 8000 # Start dev server

# Testing
pytest tests/                             # All tests
pytest tests/unit_tests/                  # Unit tests only
pytest tests/integration_tests/           # Integration tests only
pytest tests/test_foo.py -k "test_name"   # Single test

# Code quality
ruff check .                              # Linting (line-length=100, py311)
mypy --strict .                           # Type checking
```

### Backend (`backend/`)

```bash
cd backend
npm install                               # Install dependencies
npx prisma generate                       # Generate Prisma client
npx prisma migrate deploy                 # Run migrations
npm run start:dev                         # Start dev server (port 3000)

# Testing & code quality
npm run test                              # Jest tests
npm run lint                              # ESLint
```

### Frontend (`frontend/`)

```bash
cd frontend
npm install                               # Install dependencies
npm run dev                               # Start dev server (port 3001)
npm run build                             # Production build
npm run lint                              # ESLint
```

### Infrastructure

```bash
docker compose up -d postgres redis       # Start PostgreSQL 16 + Redis 7
docker compose up -d                      # All services (includes ai-service + backend)
```

Environment: copy `ai-service/.env.example` and `backend/.env.example` to `.env` and fill in API keys. See [RUNBOOK.md](RUNBOOK.md) for detailed setup.

## Architecture

### LangGraph Agent Pipelines

Three LangGraph pipelines in `ai-service/app/agents/`:

**Pipeline 1 — Trend Scanning** (`supervisor.py`):
```
START → hackernews_scanner → collect_results → trend_analyzer → content_saver → persist_results
  → [conditional: generate_posts=true?] → generate_posts_node → END
```

- **Shared state** (`TrendScanState` TypedDict in `app/agents/state.py`): `raw_results` and `errors` use `Annotated[list, operator.add]` for fan-in merging.
- **Scanner node** (`app/agents/scanners/hackernews.py`): inherits `BaseScannerNode` (ABC). Crawls top HN stories, extracts full article text, filters tech relevance.
- **Trend Analyzer** (`app/agents/trend_analyzer.py`): GPT-4o quality scoring (1-10), discards < 5, deep analysis (sentiment, lifecycle, linkedin_angles), generates Vietnamese report + content angles JSON.
- **Content Saver** (`app/agents/content_saver.py`): saves articles as markdown to `reports/{scan_id}/articles/`.
- **Persist**: saves analyzed trends to PostgreSQL via SQLAlchemy async.

**Pipeline 2 — Post Generation** (`post_generator/graph.py`):
```
START → strategy_alignment → content_generation → image_prompt_creation → image_generation
  → auto_review → [review_router: score<7 & revision<2?] → revise (loop) | output_packaging → END
```

- 7 post formats: quick_tips, hot_take, trending_breakdown, did_you_know, tutorial_hack, myth_busters, behind_the_tech
- Auto-review with 7 weighted criteria (hook strength, value density, data points, etc.)
- Max 2 revision cycles before packaging
- Images generated via BFL (Black Forest Labs)

**Pipeline 3 — Publish Post** (`publish_post/graph.py`):
```
START → resolve_and_validate → golden_hour → scheduler → [conditional] → publish_node | END (scheduled)
```

- TikTok OAuth token management with Fernet encryption
- Golden hour algorithm for optimal posting time
- APScheduler + Redis for deferred publishing
- Retry logic (3x) with polling

### Active Platforms

| Platform | Role | Client |
|----------|------|--------|
| HackerNews | Data source (scanning) | `app/tools/hackernews_tool.py` (Firebase API) |
| TikTok | Publishing target | `app/clients/tiktok_client.py` (OAuth + photo post) |
| BFL | Image generation | `app/clients/bfl_client.py` |

### LLM Configuration

All in `app/clients/openai_client.py` using `langchain-openai` `ChatOpenAI` with GPT-4o:

| Function | Max Tokens | Temp | Purpose |
|----------|-----------|------|---------|
| `get_llm()` | 4,096 | 0.0 | General tasks |
| `get_analyzer_llm()` | 16,384 | 0.1 | Trend analysis + report |
| `get_report_llm()` | 8,192 | 0.3 | Report generation |
| `get_content_gen_llm()` | 8,192 | 0.7 | Post content generation |
| `get_review_llm()` | 4,096 | 0.1 | Auto-review scoring |

### Infrastructure Layer (`app/core/`)

- **Cache** (`cache.py`): Redis JSON, `cache:` key prefix, 30-min TTL
- **Rate Limiter** (`rate_limiter.py`): Redis sorted-set sliding window (HN: 30/60s)
- **Dedup** (`dedup.py`): SHA256 of first 100 normalized title chars; Jaccard similarity on word sets
- **Storage** (`storage.py`): Local/S3 abstraction for reports, posts, images
- **Retry** (`retry.py`): `@with_retry` decorator (tenacity, exponential backoff)
- **Exceptions** (`exceptions.py`): `ScannerError` → `RateLimitError`, `ApiError`, `ScraperError`

### Database

**Multi-schema PostgreSQL** with role-based access:
- `ai` schema (Alembic): `scan_runs`, `trend_items`, `trend_comments`, `content_posts`, `published_posts`, `user_platform_tokens`, `engagement_time_slots`, `scan_schedules`
- `app` schema (Prisma): `users`, `auth_identities`, `refresh_tokens`, `audit_logs`

Connection: `postgresql+asyncpg://scanner:scanner_pass@localhost:5432/trending_scanner`

Key enums (`app/db/models/enums.py`): `ScanStatus`, `Platform`, `Sentiment`, `TrendLifecycle`, `ContentStatus`, `PostFormat`, `PublishStatus`, `PublishMode`, `EngagementPrediction`, `SourceType`

### Backend (NestJS — `backend/src/`)

11 modules: `AuthModule`, `UsersModule`, `PrismaModule`, `AiServiceModule`, `ScansModule`, `TrendsModule`, `PostsModule`, `PublishModule`, `ReportsModule`, `TiktokAuthModule`, `StatusModule`.

- **Auth**: JWT (access + refresh tokens) + Google OAuth via Passport
- **AI Service Client** (`ai-service/ai-service.client.ts`): typed HTTP wrapper for all ai-service endpoints
- **WebSocket**: Socket.IO gateway (`status/status.gateway.ts`) for real-time scan/publish progress
- **Rate limiting**: ThrottlerModule (100 req/60s)

### API Endpoints

**AI Service** (port 8000 — `app/api/v1/`):
- Scan: `POST /api/v1/scan`, `GET /api/v1/scan/{id}/status`
- Trends: `GET /api/v1/trends`, `GET /api/v1/trends/top`, `GET /api/v1/trends/{id}`
- Reports: `GET /api/v1/reports`, `GET /api/v1/reports/{id}`
- Schedule: `POST/GET /api/v1/scan/schedule`
- Posts: `POST /api/v1/posts/generate`, `GET /api/v1/posts`, `PATCH /api/v1/posts/{id}/status`
- Publish: `POST /api/v1/publish/{id}`
- Auth: `GET /api/v1/auth/tiktok/login`, `GET /api/v1/auth/tiktok/callback`

**Backend Gateway** (port 3000, global prefix `/v1` — JWT required unless noted):
- Auth: `POST /v1/auth/register` (public), `POST /v1/auth/login` (public), `POST /v1/auth/refresh` (public), `POST /v1/auth/logout`, `GET /v1/auth/me`, `GET /v1/auth/google` (public)
- Scans: `GET/POST /v1/scans`, `GET /v1/scans/{id}/status`
- Trends: `GET /v1/trends`, `GET /v1/trends/top`, `GET /v1/trends/{id}`
- Posts: `GET /v1/posts`, `POST /v1/posts/generate`, `PATCH /v1/posts/{id}/status`
- Publish: `POST /v1/publish/{postId}`, `POST /v1/publish/{postId}/schedule`, `POST /v1/publish/{postId}/auto`, `DELETE /v1/publish/{postId}/schedule`, `GET /v1/publish/{publishedPostId}/status`, `GET /v1/publish/golden-hours`
- Reports: `GET /v1/reports`

### Config

**AI Service** (`app/config.py`): Pydantic Settings, `@lru_cache get_settings()`. Key vars: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `BFL_API_KEY`, `S3_BUCKET`, `REQUIRE_INTERNAL_AUTH`, `INTERNAL_API_KEY`.

**Backend** (`backend/.env`): `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AI_SERVICE_URL`, `AI_SERVICE_INTERNAL_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Design Docs

Architecture and roadmap documents in `docs/`. Key references:
- `docs/07-post-generation-agent.md` — Post generation pipeline
- `docs/08-publish-post-agent.md` — TikTok publishing pipeline
- `docs/09-backend-api-layer.md` — NestJS backend architecture
- `docs/architecture-diagrams.md` — System diagrams
