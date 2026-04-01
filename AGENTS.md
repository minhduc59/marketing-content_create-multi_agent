# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository Status

Only `ai-service/` is active. `backend/` (NestJS) and `frontend/` (Next.js 15) are planned for future sprints.

## Commands

All commands must be run from `ai-service/` unless noted otherwise.

```bash
# Infrastructure (from repo root or ai-service/)
docker-compose up -d postgres redis       # Start PostgreSQL 16 + Redis 7

# Setup
pip install -e ".[dev]"                   # Install with dev dependencies
alembic upgrade head                      # Run database migrations

# Development
uvicorn app.main:app --reload --port 8000

# Testing
pytest tests/                             # All tests
pytest tests/test_agents/                 # Agent tests only
pytest tests/test_core/                   # Core utility tests only
pytest tests/test_tools/test_foo.py -k "test_name"  # Single test

# Code quality
ruff check .                              # Linting (line-length=100, py311)
mypy --strict .                           # Type checking
```

Environment: copy `ai-service/.env.example` to `ai-service/.env` and fill in API keys.

## Architecture

### LangGraph Agent Pipeline

The core is a LangGraph `StateGraph` built in `app/agents/supervisor.py` with fan-out/fan-in:

```
START (route_to_scanners)
  ├→ youtube_scanner       ─┐
  ├→ google_news_scanner   ─┤→ collect_results → analyzer → content_saver → reporter → persist_results → END
  └→ google_news_topic_scanner┘
```

- **Shared state** (`TrendScanState` TypedDict in `app/agents/state.py`): `raw_results` and `errors` use `Annotated[list, operator.add]` so parallel scanner fan-in merges results correctly.
- **Scanner nodes** (`app/agents/scanners/`): all inherit `BaseScannerNode` (ABC). The base class handles rate limiting, Redis cache checking (30-min TTL), and error wrapping. Subclasses only implement `fetch(options) -> list[dict]`.
- **Analyzer** (`app/agents/analyzer.py`): batches items in chunks of 40 for GPT-4o analysis (category, sentiment, lifecycle, relevance_score). Cross-platform grouping uses Jaccard similarity (threshold 0.5) on normalized titles.
- **Content Saver** (`app/agents/content_saver.py`): saves analyzed news articles as markdown files with YAML frontmatter. `google_news` items → `content/trending/`, `google_news_topic` items → `content/latest/`.
- **Reporter** (`app/agents/reporter.py`): LLM-generated Vietnamese markdown report saved to `reports/{scan_run_id}/`.
- **Persist**: saves analyzed trends to PostgreSQL via SQLAlchemy async.

### Active Platforms

The `SCANNER_MAP` in `supervisor.py` defines what is currently wired:

| Key | Node | Data source |
|-----|------|-------------|
| `youtube` | `YouTubeScannerNode` | YouTube Data API v3 (`YOUTUBE_API_KEY`) |
| `google_news` | `GoogleNewsScannerNode` | Google Trends → news articles via `google-news-trends-mcp` |
| `google_news_topic` | `GoogleNewsTopicScannerNode` | Topic-based news (TECHNOLOGY, HEALTH, etc.) |

> Note: `tiktok`, `twitter`, `instagram`, and `google_trends` mentioned in older docs are **not currently implemented** in the graph.

### LLM Configuration

Both LLM clients in `app/clients/openai_client.py` use `langchain-openai` `ChatOpenAI` with `OPENAI_API_KEY`:
- `get_llm()` — gpt-4o, max_tokens=4096, temperature=0 (used by analyzer)
- `get_report_llm()` — gpt-4o, max_tokens=8192, temperature=0.3 (used by reporter)

> The README mentions "Claude Sonnet" but the active implementation uses GPT-4o.

### Infrastructure Layer (`app/core/`)

- **Cache** (`cache.py`): Redis JSON, `cache:` key prefix, 30-min TTL
- **Rate Limiter** (`rate_limiter.py`): Redis sorted-set sliding window; limits in `PLATFORM_LIMITS` dict
- **Dedup** (`dedup.py`): `compute_dedup_key()` = SHA256 of first 100 normalized title chars (16-char hex); `titles_are_similar()` = Jaccard on word sets
- **Retry** (`retry.py`): `@with_retry` decorator (tenacity, exponential backoff) used by all platform tools
- **Exceptions** (`exceptions.py`): `ScannerError` → `RateLimitError`, `ApiError`, `ScraperError`

Redis is optional at startup — the service degrades gracefully (no cache/rate-limiting) if unavailable.

### Database

SQLAlchemy 2.0 async + asyncpg. Key models in `app/db/models/`:
- **ScanRun**: scan lifecycle (`PENDING→RUNNING→COMPLETED/PARTIAL/FAILED`)
- **TrendItem**: content + engagement metrics + AI analysis fields; indexed on platform+category, discovered_at, relevance_score, dedup_key
- **ScanSchedule**: cron expressions (table exists; APScheduler integration not yet wired)

Connection: `postgresql+asyncpg://scanner:scanner_pass@localhost:5432/trending_scanner`

### API Endpoints (`app/api/v1/`)

- `POST /api/v1/scan` — trigger async scan (202, background task)
- `GET /api/v1/scan/{scan_id}/status` — poll progress
- `GET /api/v1/trends` — list with filters (platform, category, sentiment, lifecycle, min_score) + pagination
- `GET /api/v1/trends/top` — top by time window (24h/7d/30d)
- `GET /api/v1/trends/{trend_id}` — full detail
- `POST/GET /api/v1/scan/schedule` — cron schedule management
- `GET /api/v1/reports` — list reports; `GET /api/v1/reports/{scan_run_id}` — markdown; `.../summary` — JSON

### MCP Server

`app/mcp/server.py` exposes Google News trending tools via the Model Context Protocol (stdio transport). Run standalone with `python -m app.mcp.server`.

### Config

Pydantic Settings (`app/config.py`), singleton via `@lru_cache get_settings()`. Key env vars: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `RAPIDAPI_KEY`, `FIRECRAWL_API_KEY`, `APP_ENV`, `LOG_LEVEL`.

## Design Docs

Architecture and roadmap documents are in `docs/` and `strategy/`. Consult when making architectural decisions.
