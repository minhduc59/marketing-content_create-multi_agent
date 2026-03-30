# Crawling Trending Data — Architecture & Workflow

> Stage 1 of the marketing-content AI pipeline: discovering what is trending across social platforms so downstream agents can generate relevant content.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Component Breakdown](#4-component-breakdown)
5. [LangGraph Workflow](#5-langgraph-workflow)
6. [Platform Data Sources](#6-platform-data-sources)
7. [Infrastructure Layer](#7-infrastructure-layer)
8. [Data Model](#8-data-model)
9. [API Endpoints](#9-api-endpoints)
10. [MCP Integration](#10-mcp-integration)
11. [Configuration & Environment](#11-configuration--environment)

---

## 1. Overview

The crawling stage is an **async, multi-platform trend scanner** built as a LangGraph supervisor graph. A single HTTP request triggers parallel crawls across up to 3 platform scanners simultaneously. Results are deduplicated, cached, analyzed by an LLM, saved as markdown content files, and persisted to PostgreSQL with a generated report.

```
POST /api/v1/scan  →  Fan-out to N scanners  →  Collect  →  Analyze (LLM)  →  Save Content  →  Report (LLM)  →  Persist
```

**Key design goals:**
- Platforms run **in parallel** (fan-out) — a multi-platform scan takes roughly as long as the slowest single platform
- Each platform is **independently fault-tolerant** — one failure does not abort others
- Results are **cached for 30 minutes** in Redis — repeated scans are instant
- **Rate limits** are enforced per-platform using a Redis sliding-window counter
- **Deduplication** across platforms via SHA-256 hash + Jaccard similarity
- **Content saved to disk** as structured markdown files for downstream processing
- **Vietnamese-language reports** generated with structured content angle suggestions

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Web Framework** | FastAPI 0.115 | REST API, async request handling |
| **Agent Orchestration** | LangGraph 1.x | Supervisor fan-out graph |
| **LLM / Analysis** | OpenAI GPT-4o via `langchain-openai` | Categorization, sentiment, lifecycle scoring, report generation |
| **Database** | PostgreSQL 16 + SQLAlchemy 2.0 async + asyncpg | Persistent storage |
| **Cache / Rate Limit** | Redis 7 | 30-min result cache, sliding-window rate limiting |
| **Migrations** | Alembic | Schema versioning |
| **YouTube API** | `google-api-python-client` | YouTube Data API v3 |
| **Google News** | `google-news-trends-mcp` (0.2.7+) | Trending keywords + news articles by topic |
| **MCP** | `mcp[cli]` + FastMCP | Tool server for external AI clients |
| **Retry Logic** | `tenacity` | Exponential backoff on API failures |
| **Logging** | `structlog` | Structured JSON logs |
| **Server** | Uvicorn + uvloop | ASGI server |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FastAPI Application                       │
│                                                                  │
│  POST /api/v1/scan                                               │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────┐   commit    ┌──────────┐                        │
│  │  trigger_   │────────────▶│ scan_runs│  (PostgreSQL)          │
│  │  scan()     │             │  table   │                        │
│  └──────┬──────┘             └──────────┘                        │
│         │ add_background_task                                    │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   run_scan() [Background Task]           │    │
│  │                                                          │    │
│  │   ┌──────────────────────────────────────────────────┐  │    │
│  │   │          LangGraph: TrendScanGraph                │  │    │
│  │   │                                                   │  │    │
│  │   │   START                                           │  │    │
│  │   │     │  route_to_scanners()  [conditional fan-out] │  │    │
│  │   │     ├────────────────────────────────┐            │  │    │
│  │   │     │              │                 │            │  │    │
│  │   │     ▼              ▼                 ▼            │  │    │
│  │   │  [YouTube]  [Google News]  [Google News Topic]    │  │    │
│  │   │     │              │                 │            │  │    │
│  │   │     └──────────────┼─────────────────┘            │  │    │
│  │   │                    │  (fan-in — operator.add)      │  │    │
│  │   │                    ▼                               │  │    │
│  │   │           [collect_results]                        │  │    │
│  │   │                    │                               │  │    │
│  │   │                    ▼                               │  │    │
│  │   │              [analyzer]  ◀── GPT-4o               │  │    │
│  │   │                    │                               │  │    │
│  │   │                    ▼                               │  │    │
│  │   │           [content_saver]                          │  │    │
│  │   │                    │  (markdown files to disk)     │  │    │
│  │   │                    ▼                               │  │    │
│  │   │              [reporter]  ◀── GPT-4o               │  │    │
│  │   │                    │  (report.md + summary.json)   │  │    │
│  │   │                    ▼                               │  │    │
│  │   │           [persist_results]                        │  │    │
│  │   │                    │                               │  │    │
│  │   │                   END                              │  │    │
│  │   └──────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

         ┌──────────┐          ┌──────────────────┐
         │  Redis   │          │   PostgreSQL      │
         │  Cache   │          │  scan_runs        │
         │  Rate    │          │  trend_items      │
         │  Limiter │          │  trend_comments   │
         └──────────┘          │  scan_schedules   │
                               └──────────────────┘

         ┌──────────────────┐  ┌──────────────────┐
         │  content/        │  │  reports/         │
         │  trending/  *.md │  │  {scan_run_id}/   │
         │  latest/   *.md  │  │  report.md        │
         └──────────────────┘  │  summary.json     │
                               └──────────────────┘
```

---

## 4. Component Breakdown

### 4.1 API Layer (`app/api/v1/`)

| File | Responsibility |
|------|---------------|
| `scan.py` | `POST /scan` — create ScanRun, queue background task; `GET /scan/{id}/status` |
| `trends.py` | `GET /trends` — paginated list with filters; `GET /trends/top`; `GET /trends/{id}` |
| `schedule.py` | `POST /scan/schedule` — cron-based recurring scans; `GET /scan/schedule` |
| `reports.py` | `GET /reports` — list reports; `GET /reports/{id}` — full markdown; `GET /reports/{id}/summary` — JSON |

### 4.2 LangGraph Graph (`app/agents/supervisor.py`)

```
build_trend_scan_graph(rate_limiter, cache)
  → StateGraph(TrendScanState)
  → conditional fan-out: START → [scanner nodes] via Send()
  → fan-in: all scanners → collect_results (operator.add on raw_results)
  → sequential: collect_results → analyzer → content_saver → reporter → persist_results → END
```

**State schema (`TrendScanState`):**

| Field | Type | Description |
|-------|------|-------------|
| `scan_run_id` | `str` | FK to `scan_runs.id` |
| `platforms` | `list[str]` | Platforms requested |
| `options` | `dict` | `region`, `max_items_per_platform`, `include_comments`, `topics` |
| `raw_results` | `list[RawTrendData]` | Appended by each scanner (via `operator.add`) |
| `analyzed_trends` | `list[dict]` | LLM-enriched items |
| `cross_platform_groups` | `list[dict]` | Items trending on multiple platforms |
| `content_file_paths` | `list[str]` | Markdown files saved by content_saver |
| `report_content` | `str` | Generated markdown report |
| `report_file_path` | `str` | Path to saved report file |
| `errors` | `list[ScanError]` | Per-platform errors (via `operator.add`) |

### 4.3 Scanner Nodes (`app/agents/scanners/`)

All scanners inherit `BaseScannerNode` and implement a single method:

```python
class BaseScannerNode(ABC):
    async def __call__(self, state: TrendScanState) -> dict
        # 1. Check rate limit (Redis sliding window)
        # 2. Check Redis cache (30-min TTL)
        # 3. If cache miss → call self.fetch(options)
        # 4. Write result to cache
        # 5. Return {"raw_results": [RawTrendData(...)]}

    @abstractmethod
    async def fetch(self, options: dict) -> list[dict]: ...
```

**Available scanners:**

| Scanner | Platform ID | Data Source |
|---------|------------|-------------|
| `YouTubeScannerNode` | `youtube` | YouTube Data API v3 via `YouTubeTool` |
| `GoogleNewsScannerNode` | `google_news` | `google_news_trends_mcp` — trending keywords → news articles |
| `GoogleNewsTopicScannerNode` | `google_news_topic` | `google_news_trends_mcp` — predefined topic categories → news articles |

### 4.4 Analyzer Node (`app/agents/analyzer.py`)

- Receives all `raw_results` from state after fan-in
- Flattens items, processes in **chunks of 40** to stay within GPT-4o context
- Prompts the LLM to assign: `category`, `sentiment`, `lifecycle`, `relevance_score` (0–10), `related_topics`
- Computes `dedup_key` (SHA-256 of normalized title, first 16 hex chars)
- Detects **cross-platform groups** using Jaccard similarity (threshold 0.5) on normalized titles
- Falls back to default values if LLM fails (category="other", sentiment="neutral", etc.)

### 4.5 Content Saver Node (`app/agents/content_saver.py`)

- Receives `analyzed_trends` from state
- Separates items by platform:
  - `google_news` items → `content/trending/` directory
  - `google_news_topic` items → `content/latest/` directory
  - YouTube items are skipped (no full article content)
- Creates **structured markdown files** for each item with:
  - YAML frontmatter: title, source_url, author, published_at, crawled_at, platform, category, sentiment, relevance_score, tags, topic, trending_keyword
  - Markdown body: title, summary, full content, related topics, source link
- Filename format: `{slugified-title}-{timestamp}.md`
- Returns `content_file_paths` list to state

### 4.6 Reporter Node (`app/agents/reporter.py`)

- Receives `analyzed_trends` and `cross_platform_groups` from state
- Sorts trends by `relevance_score`, takes top 50 for detailed LLM analysis
- Computes aggregate stats (by platform, category, sentiment, lifecycle)
- **LLM Call #1**: Generates full Markdown report in Vietnamese (executive summary, market overview, ranking table, detailed analysis, content angles, cross-platform trends)
- **LLM Call #2**: Generates structured content angles JSON (2–3 per top trend) — separate call for parsing reliability
- Saves `report.md` + `summary.json` to `reports/{scan_run_id}/`
- Falls back to template-based report if LLM fails
- Returns `report_content` and `report_file_path` to state

### 4.7 Persist Node (`app/agents/supervisor.py → persist_results_node`)

- Opens a **fresh DB session** (independent of the request session)
- Updates `ScanRun` status → `completed` / `partial` / `failed`
- Bulk-inserts `TrendItem` rows with all analyzed fields
- Sets `duration_ms` after the full graph completes

---

## 5. LangGraph Workflow

```
Step 1 — Fan-out (parallel)
──────────────────────────
POST /api/v1/scan received
  └─ ScanRun created (status: pending) → committed to DB
  └─ Background task queued: run_scan(scan_run_id, request)

run_scan starts:
  └─ ScanRun → status: running
  └─ build_trend_scan_graph() instantiates scanner nodes
  └─ graph.ainvoke(initial_state)

route_to_scanners() sends state to each requested platform node via Send():
  ┌─ YouTubeScannerNode        ─────────────────────────────────────┐
  ├─ GoogleNewsScannerNode      ──── all run concurrently ──────────┤
  └─ GoogleNewsTopicScannerNode ────────────────────────────────────┘


Step 2 — Each Scanner (independently)
──────────────────────────────────────
  1. rate_limiter.check(platform)         # Redis ZADD sliding window
  2. cache.get("scan:{platform}:latest")  # Redis GET
     └─ HIT  → return cached items immediately
     └─ MISS → call platform API / library
  3. Fetch data (YouTube API / google_news_trends_mcp)
  4. cache.set(key, items, ttl=1800)      # Cache for 30 min
  5. Return RawTrendData appended to raw_results[]


Step 3 — Fan-in: collect_results
─────────────────────────────────
  Merges all RawTrendData entries (operator.add on list)
  Tallies: platforms_ok[], platforms_failed{platform: error}
  Passes state through to analyzer


Step 4 — Analyzer (LLM)
────────────────────────
  all_items = flatten(raw_results where error is None)
  for chunk in chunks(all_items, size=40):
      response = GPT-4o.ainvoke([system_prompt, human_prompt])
      merge: category, sentiment, lifecycle, relevance_score, related_topics
      compute: dedup_key = sha256(normalize(title))[:16]

  cross_platform_groups = detect_jaccard_similar(analyzed, threshold=0.5)
  score boost: × (1 + 0.2 × n_platforms) for cross-platform items


Step 5 — Content Saving
────────────────────────
  For each analyzed item (google_news / google_news_topic):
    - Generate YAML frontmatter + markdown body
    - Save to content/trending/ or content/latest/
    - Collect file paths

  Return: content_file_paths → state


Step 6 — Report Generation
──────────────────────────
  report_data = prepare(analyzed_trends, cross_platform_groups)
    - sort by relevance_score, take top 50 for detail
    - compute aggregate stats (by platform, category, sentiment)

  LLM Call #1 → GPT-4o (max_tokens=8192, temp=0.3)
    - Full Markdown report (Vietnamese): executive summary, market overview,
      ranking table, top-10 detailed analysis, content angles
    - Fallback: template-based report if LLM fails

  LLM Call #2 → GPT-4o (separate call for reliability)
    - Structured JSON array of content angles (2-3 per top trend)
    - Fields: platform, content_type, writing_style, hook, engagement

  Save to disk:
    reports/{scan_run_id}/{YYYY-MM-DD}_report.md
    reports/{scan_run_id}/{YYYY-MM-DD}_summary.json

  Return: report_content, report_file_path → state


Step 7 — Persist
─────────────────
  async with async_session_factory() as db:
      UPDATE scan_runs SET status, platforms_completed, platforms_failed,
                           report_file_path, ...
      INSERT INTO trend_items (one row per analyzed item)
      COMMIT

  UPDATE scan_runs SET duration_ms
```

---

## 6. Platform Data Sources

### YouTube — `app/tools/youtube_tool.py`

| Property | Value |
|----------|-------|
| **API** | YouTube Data API v3 |
| **Auth** | `YOUTUBE_API_KEY` (developer key) |
| **Quota** | 10,000 units / 24h |
| **Endpoint** | `videos.list(chart=mostPopular, regionCode=...)` |
| **Fields fetched** | title, description, tags, views, likes, comments, channel, thumbnail, duration |
| **Region support** | ISO 3166-1 alpha-2 (e.g. `US`, `VN`) |
| **Max results** | 50 per request |

### Google News (Trending) — `app/agents/scanners/google_news.py`

| Property | Value |
|----------|-------|
| **Library** | `google-news-trends-mcp` (0.2.7+) |
| **Auth** | None (public) |
| **Rate limit** | 60 requests / 60s |
| **Process** | 1. Fetch trending keywords → 2. For each keyword, fetch news articles |
| **Config** | `GOOGLE_NEWS_MAX_KEYWORDS` (default 10), `GOOGLE_NEWS_ARTICLES_PER_KEYWORD` (default 5), `GOOGLE_NEWS_PERIOD_DAYS` (default 7) |
| **Region support** | Geo-code mapping (e.g. `VN` → Vietnam, `US` → United States) |
| **Concurrency** | Async semaphore (limit 3) for parallel keyword fetching |
| **Fields fetched** | title, summary, full text, authors, publish_date, top_image, keywords, tags |

### Google News (Topic) — `app/agents/scanners/google_news_topic.py`

| Property | Value |
|----------|-------|
| **Library** | `google-news-trends-mcp` (0.2.7+) |
| **Auth** | None (public) |
| **Rate limit** | Shared with Google News (60/60s) |
| **Process** | Fetch news articles for predefined topic categories |
| **Config** | `GOOGLE_NEWS_DEFAULT_TOPICS` (default: TECHNOLOGY, BUSINESS, SCIENCE, HEALTH, ENTERTAINMENT), `GOOGLE_NEWS_TOPIC_ARTICLES_PER_TOPIC` (default 5), `GOOGLE_NEWS_TOPIC_PERIOD_DAYS` (default 7) |
| **Available topics** | 50+ categories (see `AVAILABLE_TOPICS` in scanner) |
| **Concurrency** | Async semaphore (limit 3) for parallel topic fetching |
| **Validation** | Topics checked against `AVAILABLE_TOPICS` list |

---

## 7. Infrastructure Layer

### Cache (`app/core/cache.py`)

```
Redis key: cache:scan:{platform}:latest
TTL: 1800 seconds (30 minutes)
Value: JSON array of trend items

Operation:
  GET  → json.loads(redis.get(f"cache:{key}"))
  SET  → redis.set(key, json.dumps(value), ex=ttl)
```

Cache is checked **before** every API call. A cache hit skips the external API entirely, making repeated scans within the 30-min window free of quota cost.

### Rate Limiter (`app/core/rate_limiter.py`)

Uses a **Redis sorted-set sliding window**:

```
Key:   ratelimit:{platform}
Score: unix timestamp of each request

Algorithm per request:
  1. ZREMRANGEBYSCORE key 0 (now - window)   # evict old entries
  2. ZCARD key                                # count current
  3. if count >= limit → raise RateLimitError
  4. ZADD key {now} now                       # record this request
  5. EXPIRE key window
```

| Platform | Limit | Window |
|----------|-------|--------|
| YouTube | 10,000 | 24h |
| Google News | 60 | 60s |

### Retry (`app/core/retry.py`)

Powered by **tenacity**:

```python
@with_retry(max_attempts=3)          # exponential backoff: 1s → 2s → 4s (max 30s)
@with_rate_limit_retry(max_attempts=2)  # longer backoff: 10s → 20s (max 60s)
```

Retries on: `ApiError`, `ScraperError`. Rate limit errors use a separate decorator with longer wait.

### Deduplication (`app/core/dedup.py`)

```
Step 1 — Normalize title:
  lowercase → strip accents (NFKD) → remove non-alphanumeric → collapse spaces

Step 2 — dedup_key:
  sha256(normalized_title[:100])[:16 hex chars]
  Stored on every TrendItem for exact-match dedup

Step 3 — Cross-platform similarity:
  Jaccard(words_a ∩ words_b, words_a ∪ words_b) ≥ threshold
  threshold=0.5 for cross-platform grouping
  threshold=0.7 for strict duplicate detection
```

---

## 8. Data Model

### `scan_runs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Scan run identifier |
| `status` | enum | `pending` / `running` / `completed` / `partial` / `failed` |
| `platforms_requested` | JSON `[]` | Platforms included in this scan |
| `platforms_completed` | JSON `[]` | Platforms that succeeded |
| `platforms_failed` | JSON `{}` | `{platform: error_message}` |
| `total_items_found` | int | Count of analyzed trend items |
| `langgraph_thread_id` | str | LangGraph execution ID |
| `report_file_path` | str | Path to generated report |
| `started_at` | timestamptz | Set by DB `server_default=now()` |
| `completed_at` | timestamptz | Set by persist node |
| `duration_ms` | int | Wall-clock time of the full graph |
| `error` | str | Top-level error if scan failed entirely |

### `trend_items`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | |
| `scan_run_id` | UUID FK | → `scan_runs.id` |
| `platform` | enum | `youtube` / `google_news` / `google_news_topic` |
| `title` | varchar(500) | Trend title / caption |
| `description` | text | Short description |
| `content_body` | text | Full content (article text, video description, etc.) |
| `source_url` | text | Direct link to the content |
| `tags` / `hashtags` | JSON `[]` | Platform tags and hashtags |
| `views` / `likes` / `comments_count` / `shares` | int | Engagement metrics |
| `trending_score` | float | Raw platform trending score |
| `thumbnail_url` / `video_url` | text | Media URLs |
| `image_urls` | JSON `[]` | Additional image URLs |
| `author_name` / `author_url` / `author_followers` | — | Creator info |
| `category` | str | LLM-assigned: `tech`, `fashion`, `food`, … |
| `sentiment` | enum | `positive` / `negative` / `neutral` / `mixed` |
| `lifecycle` | enum | `rising` / `peak` / `declining` |
| `relevance_score` | float | LLM score 0–10 |
| `related_topics` | JSON `[]` | LLM-suggested related keywords |
| `dedup_key` | varchar(255) | SHA-256 hash of normalized title |
| `cross_platform_ids` | JSON `[]` | IDs of same trend on other platforms |
| `raw_data` | JSON | Full original API response |
| `discovered_at` | timestamptz | `server_default=now()` |
| `published_at` | timestamptz | Original publish time from platform |

### `trend_comments`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | |
| `trend_item_id` | UUID FK | → `trend_items.id` |
| `author` | varchar(255) | Comment author |
| `text` | text | Comment body |
| `likes` | int | Like count (default 0) |
| `sentiment` | enum | LLM-assigned sentiment |
| `posted_at` | timestamptz | Original post time |
| `collected_at` | timestamptz | When we scraped it |

### `scan_schedules`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | |
| `cron_expression` | varchar(100) | Cron schedule |
| `platforms` | JSON `[]` | Platforms to scan |
| `is_active` | boolean | Schedule enabled |
| `last_run_at` | timestamptz | Last execution |
| `next_run_at` | timestamptz | Next scheduled execution |
| `created_at` | timestamptz | `server_default=now()` |

---

## 9. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/scan` | Trigger async scan; returns `scan_id` immediately (202) |
| `GET` | `/api/v1/scan/{scan_id}/status` | Poll scan lifecycle and per-platform results |
| `GET` | `/api/v1/trends` | Paginated list with filters: `platform`, `category`, `sentiment`, `lifecycle`, `min_score`, `sort_by` |
| `GET` | `/api/v1/trends/top` | Top N trends by timeframe (`24h` / `7d` / `30d`) |
| `GET` | `/api/v1/trends/{trend_id}` | Full detail including comments and raw data |
| `POST` | `/api/v1/scan/schedule` | Create cron-based recurring scan (201) |
| `GET` | `/api/v1/scan/schedule` | List all schedules |
| `GET` | `/api/v1/reports` | List generated reports (paginated) |
| `GET` | `/api/v1/reports/{scan_run_id}` | Full markdown report content |
| `GET` | `/api/v1/reports/{scan_run_id}/summary` | JSON summary with stats + content angles |
| `GET` | `/health` | Liveness check |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/redoc` | ReDoc |

---

## 10. MCP Integration

The project includes an MCP (Model Context Protocol) server that exposes Google News tools for external AI clients.

### Server (`app/mcp/server.py`)

- FastMCP instance named "Trending Content Scanner"
- Runs via stdio transport
- Registers tools from `app/mcp/tools/google_news.py`

### MCP Tools (`app/mcp/tools/google_news.py`)

| Tool | Description |
|------|-------------|
| `list_available_topics()` | Returns list of 50+ Google News topic categories |
| `get_news_by_topic(topic, period, max_results)` | Fetches news articles for a given topic, with configurable period and result limit |

These tools allow external Claude or AI clients to query Google News data through the MCP protocol, enabling integration with broader AI workflows.

---

## 11. Configuration & Environment

```env
# Database
DATABASE_URL=postgresql+asyncpg://scanner:scanner_pass@localhost:5432/trending_scanner

# Redis
REDIS_URL=redis://localhost:6379/0

# LLM (analyzer + reporter)
OPENAI_API_KEY=sk-...

# Platform APIs
YOUTUBE_API_KEY=...        # Google Cloud Console → YouTube Data API v3

# Google News Scanner Config
GOOGLE_NEWS_MAX_KEYWORDS=10              # Max trending keywords to fetch
GOOGLE_NEWS_ARTICLES_PER_KEYWORD=5       # Articles per keyword
GOOGLE_NEWS_PERIOD_DAYS=7                # Lookback period
GOOGLE_NEWS_DEFAULT_TOPICS=TECHNOLOGY,BUSINESS,SCIENCE,HEALTH,ENTERTAINMENT
GOOGLE_NEWS_TOPIC_ARTICLES_PER_TOPIC=5   # Articles per topic
GOOGLE_NEWS_TOPIC_PERIOD_DAYS=7          # Lookback period

# App
APP_ENV=development        # enables SQLAlchemy echo
LOG_LEVEL=INFO
```

### Infrastructure startup

```bash
# Start PostgreSQL 16 + Redis 7
docker-compose up -d postgres redis

# Apply DB migrations
cd ai-service
alembic upgrade head

# Start API server
uvicorn app.main:app --reload --port 8000
```

### File Structure

```
ai-service/
├── app/
│   ├── agents/
│   │   ├── scanners/
│   │   │   ├── base.py              (BaseScannerNode ABC)
│   │   │   ├── youtube.py           (YouTubeScannerNode)
│   │   │   ├── google_news.py       (GoogleNewsScannerNode)
│   │   │   └── google_news_topic.py (GoogleNewsTopicScannerNode)
│   │   ├── state.py                 (TrendScanState TypedDict)
│   │   ├── supervisor.py            (build_trend_scan_graph, run_scan)
│   │   ├── analyzer.py              (analyzer_node)
│   │   ├── content_saver.py         (content_saver_node)
│   │   └── reporter.py              (reporter_node)
│   ├── api/v1/
│   │   ├── schemas/
│   │   │   ├── scan.py              (ScanRequest, ScanResponse, etc.)
│   │   │   ├── report.py            (ReportContentResponse, ContentAngle, etc.)
│   │   │   ├── schedule.py          (ScheduleRequest, ScheduleResponse)
│   │   │   └── trend.py             (TrendSummary, TrendDetail, etc.)
│   │   ├── router.py                (main router)
│   │   ├── scan.py                  (scan endpoints)
│   │   ├── trends.py                (trend query endpoints)
│   │   ├── reports.py               (report endpoints)
│   │   └── schedule.py              (schedule endpoints)
│   ├── db/
│   │   ├── models/
│   │   │   ├── enums.py             (ScanStatus, Platform, Sentiment, TrendLifecycle)
│   │   │   ├── scan.py              (ScanRun)
│   │   │   ├── trend.py             (TrendItem)
│   │   │   ├── trend_comment.py     (TrendComment)
│   │   │   └── scan_schedule.py     (ScanSchedule)
│   │   ├── base.py                  (DeclarativeBase)
│   │   └── session.py               (engine, async_session_factory, get_db)
│   ├── core/
│   │   ├── cache.py                 (Cache class — Redis)
│   │   ├── rate_limiter.py          (RateLimiter — Redis sliding window)
│   │   ├── dedup.py                 (normalize, SHA-256, Jaccard similarity)
│   │   ├── retry.py                 (@with_retry decorators — tenacity)
│   │   ├── exceptions.py            (ScannerError hierarchy)
│   │   └── logging.py               (structlog setup)
│   ├── tools/
│   │   └── youtube_tool.py          (YouTubeTool — YouTube Data API v3)
│   ├── clients/
│   │   └── openai_client.py         (get_llm, get_report_llm)
│   ├── mcp/
│   │   ├── server.py                (FastMCP instance)
│   │   └── tools/
│   │       └── google_news.py       (MCP tools for Google News)
│   ├── config.py                    (Pydantic Settings)
│   ├── main.py                      (FastAPI app + lifespan)
│   └── dependencies.py              (get_redis, get_session)
├── content/
│   ├── trending/                    (google_news markdown files)
│   └── latest/                      (google_news_topic markdown files)
├── reports/                         (generated report files per scan)
├── alembic/                         (database migrations)
├── pyproject.toml
└── docker-compose.yml
```

---

*Generated from source: `ai-service/app/agents/`, `ai-service/app/tools/`, `ai-service/app/core/`, `ai-service/app/mcp/`*
