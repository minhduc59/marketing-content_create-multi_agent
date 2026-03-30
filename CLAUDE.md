# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

AI-powered trending content scanner for social media marketing (thesis project). Only `ai-service/` is active; `backend/` (NestJS) and `frontend/` (Next.js 15) are planned for future sprints.

## Commands

```bash
# Infrastructure
docker-compose up -d postgres redis       # Start PostgreSQL 16 + Redis 7

# Setup
cd ai-service
pip install -e ".[dev]"                    # Install with dev dependencies
alembic upgrade head                       # Run database migrations

# Development
uvicorn app.main:app --reload --port 8000

# Testing
pytest tests/                              # All tests
pytest tests/unit_tests/                   # Unit tests only
pytest tests/integration_tests/            # Integration tests only
pytest tests/unit_tests/test_foo.py -k "test_name"  # Single test

# Code quality
ruff check .                               # Linting (line-length=100, py311)
mypy --strict .                            # Type checking
```

## Architecture

### LangGraph Agent Pipeline

The core is a LangGraph `StateGraph` in `app/agents/supervisor.py` with fan-out/fan-in:

```
START (route_to_scanners)
  ├→ youtube_scanner    ─┐
  ├→ tiktok_scanner     ─┤
  ├→ twitter_scanner    ─├→ collect_results → analyzer → reporter → persist_results → END
  ├→ instagram_scanner  ─┤
  └→ google_trends_scanner┘
```

- **Shared state** (`TrendScanState` TypedDict in `app/agents/state.py`): uses `operator.add` annotation on `raw_results` and `errors` for parallel fan-in merging
- **Scanner nodes** (`app/agents/scanners/`): all inherit `BaseScannerNode` (ABC) which handles rate limiting, caching, and error wrapping. Only `fetch()` is platform-specific.
- **Analyzer** (`app/agents/analyzer.py`): chunks items into batches of 40 for LLM analysis (category, sentiment, lifecycle, relevance_score). Cross-platform grouping uses Jaccard similarity (threshold 0.5) on normalized titles.
- **Reporter** (`app/agents/reporter.py`): two separate LLM calls — one for Vietnamese markdown report, one for structured content angles JSON. Reports saved to `reports/{scan_run_id}/`.
- **Persist**: saves analyzed trends to PostgreSQL via SQLAlchemy async.

### LLM Configuration

LLM clients in `app/clients/openai_client.py` use `langchain-openai` `ChatOpenAI`:
- `get_llm()` — gpt-4o, max_tokens=4096, temperature=0 (analyzer)
- `get_report_llm()` — gpt-4o, max_tokens=8192, temperature=0.3 (reporter)

Despite the name `OPENAI_API_KEY`, verify the actual provider in config if switching models.

### Platform Tools

Each tool in `app/tools/` wraps a platform API and returns a common item format:
- **Google Trends**: `pytrends` library (no API key needed, rate limit ~12/min)
- **YouTube**: YouTube Data API v3 (own API key)
- **TikTok, Twitter, Instagram**: RapidAPI wrappers via `httpx.AsyncClient` (shared `RAPIDAPI_KEY`)
- **Instagram**: `fetch_all()` returns empty list — no free trending endpoint available
- **Firecrawl**: generic web scraping tool (not used in main scan flow)

All tools use `@with_retry` decorator from `app/core/retry.py` (tenacity-based, exponential backoff).

### Infrastructure Layer (`app/core/`)

- **Cache** (`cache.py`): Redis JSON cache with `cache:` key prefix, 30-min TTL
- **Rate Limiter** (`rate_limiter.py`): Redis sorted-set sliding window. Platform limits defined in `PLATFORM_LIMITS` dict (e.g., google_trends: 12/60s, youtube: 10k/24h)
- **Dedup** (`dedup.py`): `compute_dedup_key()` = SHA256 of first 100 normalized title chars (16-char hex). `titles_are_similar()` = Jaccard coefficient on word sets
- **Exceptions** (`exceptions.py`): `ScannerError` base → `RateLimitError`, `ApiError`, `ScraperError`

### Database

SQLAlchemy 2.0 async + asyncpg. Models in `app/db/models/`:
- **ScanRun**: scan lifecycle (PENDING→RUNNING→COMPLETED/PARTIAL/FAILED), tracks platforms, duration, report path
- **TrendItem**: content + engagement metrics + AI analysis fields (category, sentiment, lifecycle, relevance_score, dedup_key). Indexed on platform+category, discovered_at, relevance_score, dedup_key
- **TrendComment**: comments collected per trend item
- **ScanSchedule**: cron expressions for scheduled scans (table exists, APScheduler integration not yet wired)

Enums in `app/db/models/enums.py`: `ScanStatus`, `Platform`, `Sentiment`, `TrendLifecycle`.

Session factory in `app/db/session.py` (pool_size=10, max_overflow=20, SQL echo in dev).

### API Endpoints (`app/api/v1/`)

- `POST /api/v1/scan` — trigger async scan (returns 202, runs `run_scan()` as background task)
- `GET /api/v1/scan/{scan_id}/status` — poll scan progress
- `GET /api/v1/trends` — list with filters (platform, category, sentiment, lifecycle, min_score) + pagination
- `GET /api/v1/trends/top` — top trends by time window (24h/7d/30d)
- `GET /api/v1/trends/{trend_id}` — full detail with comments
- `POST /api/v1/scan/schedule` — create cron schedule
- `GET /api/v1/scan/schedule` — list schedules
- `GET /api/v1/reports` — list generated reports
- `GET /api/v1/reports/{scan_run_id}` — full markdown report
- `GET /api/v1/reports/{scan_run_id}/summary` — JSON summary with stats + content angles

### Config

Pydantic Settings in `app/config.py`, loaded from `.env`. Key vars: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `RAPIDAPI_KEY`, `FIRECRAWL_API_KEY`, `APP_ENV`, `LOG_LEVEL`. Singleton via `@lru_cache get_settings()`.

## Docker

```bash
docker-compose up -d                # All services (postgres + redis + app)
docker-compose up -d postgres redis  # Just infra for local dev
```

Postgres: `scanner/scanner_pass@localhost:5432/trending_scanner`. Redis: `localhost:6379/0`.

## Design Docs

Architecture and roadmap documents in `docs/` (overview, features, crawling architecture). Consult when making architectural decisions.
