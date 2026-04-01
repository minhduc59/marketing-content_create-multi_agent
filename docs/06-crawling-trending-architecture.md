# Crawling Technology Trends — Architecture & Workflow

> Stage 1 of the LinkedIn content pipeline: discovering trending technology topics from Hacker News for LinkedIn content creation.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Component Breakdown](#4-component-breakdown)
5. [LangGraph Workflow](#5-langgraph-workflow)
6. [Data Source: HackerNews](#6-data-source-hackernews)
7. [Infrastructure Layer](#7-infrastructure-layer)
8. [Data Model](#8-data-model)
9. [API Endpoints](#9-api-endpoints)
10. [Configuration & Environment](#10-configuration--environment)

---

## 1. Overview

The crawling stage is a **linear LangGraph pipeline** that scans HackerNews for trending technology content. Results are analyzed by GPT-4o for LinkedIn relevance, saved as markdown files, and persisted to PostgreSQL with a generated Vietnamese report.

```
POST /api/v1/scan → HN Scanner → Collect → Analyze (LLM) → Save Content → Report (LLM) → Persist
```

**Key design goals:**
- **Technology focus** — HackerNews as sole data source (high-quality tech content)
- **LinkedIn target** — analysis and reports optimized for LinkedIn thought leadership
- Results are **cached for 30 minutes** in Redis
- **Rate limits** enforced using a Redis sliding-window counter (30 req/60s)
- **Deduplication** via SHA-256 hash + Jaccard similarity
- **Content saved to disk** as structured markdown files
- **Vietnamese-language reports** with LinkedIn content angle suggestions

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Web Framework** | FastAPI 0.115 | REST API, async request handling |
| **Agent Orchestration** | LangGraph 1.x | Linear pipeline graph |
| **LLM / Analysis** | OpenAI GPT-4o via `langchain-openai` | Categorization, sentiment, LinkedIn relevance, report generation |
| **Database** | PostgreSQL 16 + SQLAlchemy 2.0 async + asyncpg | Persistent storage |
| **Cache / Rate Limit** | Redis 7 | 30-min result cache, sliding-window rate limiting |
| **Migrations** | Alembic | Schema versioning |
| **HTTP Client** | httpx | HackerNews Firebase API + article crawling |
| **Retry Logic** | tenacity | Exponential backoff on API failures |
| **Logging** | structlog | Structured JSON logs |
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
│  │   │     │                                             │  │    │
│  │   │     ▼                                             │  │    │
│  │   │  [HackerNews Scanner]                             │  │    │
│  │   │     │                                             │  │    │
│  │   │     ▼                                             │  │    │
│  │   │  [collect_results]                                │  │    │
│  │   │     │                                             │  │    │
│  │   │     ▼                                             │  │    │
│  │   │  [analyzer]  ◀── GPT-4o (LinkedIn tech focus)     │  │    │
│  │   │     │                                             │  │    │
│  │   │     ▼                                             │  │    │
│  │   │  [content_saver]  → content/hackernews/{date}/    │  │    │
│  │   │     │                                             │  │    │
│  │   │     ▼                                             │  │    │
│  │   │  [reporter]  ◀── GPT-4o (Vietnamese LinkedIn)     │  │    │
│  │   │     │  → reports/{scan_run_id}/                   │  │    │
│  │   │     ▼                                             │  │    │
│  │   │  [persist_results]                                │  │    │
│  │   │     │                                             │  │    │
│  │   │    END                                            │  │    │
│  │   └──────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

         ┌──────────┐          ┌──────────────────┐
         │  Redis   │          │   PostgreSQL      │
         │  Rate    │          │  scan_runs        │
         │  Limiter │          │  trend_items      │
         └──────────┘          │  trend_comments   │
                               │  scan_schedules   │
                               └──────────────────┘

         ┌──────────────────┐  ┌──────────────────┐
         │  content/        │  │  reports/         │
         │  hackernews/     │  │  {scan_run_id}/   │
         │  {date}/  *.md   │  │  report.md        │
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
| `reports.py` | `GET /reports` — list reports; `GET /reports/{id}` — markdown; `GET /reports/{id}/summary` — JSON |

### 4.2 LangGraph Graph (`app/agents/supervisor.py`)

```
build_trend_scan_graph(rate_limiter)
  → StateGraph(TrendScanState)
  → linear: START → hackernews_scanner → collect_results → analyzer → content_saver → reporter → persist_results → END
```

### 4.3 HackerNews Scanner (`app/agents/scanners/hackernews.py`)

Inherits `BaseScannerNode`, implements `fetch()`:
- Calls `HackerNewsTool.fetch_all(max_stories)`
- Tool fetches top story IDs from Firebase API
- Crawls article URLs in parallel (with semaphore)
- Filters for technology relevance
- Returns structured items

### 4.4 Analyzer Node (`app/agents/analyzer.py`)

- Receives `raw_results` from HackerNews scanner
- Processes in **chunks of 40** for GPT-4o context management
- Classifies: `category` (tech/business/education/other), `sentiment`, `lifecycle`, `relevance_score` (0–10 for LinkedIn)
- Computes `dedup_key` (SHA-256), detects similar trends via Jaccard similarity
- Falls back to defaults if LLM fails

### 4.5 Content Saver Node (`app/agents/content_saver.py`)

- Saves HackerNews articles as markdown to `content/hackernews/{date}/`
- YAML frontmatter: hn_title, hn_score, hn_comments, hn_author, article metadata
- Filename format: `{date}_{slugified-title}.md`

### 4.6 Reporter Node (`app/agents/reporter.py`)

- **LLM Call #1**: Vietnamese LinkedIn technology trend report (executive summary, ranking, detailed analysis, LinkedIn content suggestions)
- **LLM Call #2**: Structured content angles JSON for LinkedIn (post, article, carousel, poll, document)
- Saves `report.md` + `summary.json` to `reports/{scan_run_id}/`
- Falls back to template if LLM fails

### 4.7 Persist Node

- Updates `ScanRun` status → `completed` / `failed`
- Bulk-inserts `TrendItem` rows
- Sets `duration_ms`

---

## 5. LangGraph Workflow

```
Step 1 — Scan Trigger
─────────────────────
POST /api/v1/scan received
  └─ ScanRun created (status: pending) → committed to DB
  └─ Background task queued: run_scan(scan_run_id, request)

run_scan starts:
  └─ ScanRun → status: running
  └─ build_trend_scan_graph() instantiates HackerNews scanner
  └─ graph.ainvoke(initial_state)


Step 2 — HackerNews Scanner
────────────────────────────
  1. rate_limiter.check("hackernews")      # Redis sliding window (30/60s)
  2. HackerNewsTool.fetch_all(max_stories)
     a. Fetch top story IDs from Firebase API
     b. Fetch story details in parallel
     c. Crawl article URLs → extract text
     d. Filter for technology relevance
  3. Return RawTrendData → raw_results[]


Step 3 — Collect Results
─────────────────────────
  Validates results, logs statistics
  Passes state through to analyzer


Step 4 — Analyzer (GPT-4o, temp=0)
────────────────────────────────────
  all_items = flatten(raw_results where error is None)
  for chunk in chunks(all_items, size=40):
      response = GPT-4o.ainvoke([system_prompt, human_prompt])
      merge: category, sentiment, lifecycle, relevance_score, related_topics
      compute: dedup_key = sha256(normalize(title))[:16]

  Detect similar trends via Jaccard similarity (threshold 0.5)


Step 5 — Content Saving
────────────────────────
  For each HackerNews article:
    - Generate YAML frontmatter + markdown body
    - Save to content/hackernews/{date}/
    - Collect file paths


Step 6 — Report Generation (GPT-4o, temp=0.3)
──────────────────────────────────────────────
  LLM Call #1 → Vietnamese LinkedIn technology report
  LLM Call #2 → Structured LinkedIn content angles JSON

  Save to disk:
    reports/{scan_run_id}/{YYYY-MM-DD}_report.md
    reports/{scan_run_id}/{YYYY-MM-DD}_summary.json


Step 7 — Persist
─────────────────
  UPDATE scan_runs SET status, platforms_completed, report_file_path, ...
  INSERT INTO trend_items (one row per analyzed item)
  UPDATE scan_runs SET duration_ms
```

---

## 6. Data Source: HackerNews

### `app/tools/hackernews_tool.py`

| Property | Value |
|----------|-------|
| **API** | HackerNews Firebase API |
| **Auth** | None (public) |
| **Base URL** | `https://hacker-news.firebaseio.com/v0` |
| **Rate limit** | 30 requests / 60s (polite limit) |
| **Process** | 1. Fetch top story IDs → 2. Fetch details → 3. Crawl articles → 4. Filter tech |
| **Fields fetched** | title, url, score, descendants (comments), by (author), time |
| **Article extraction** | HTML → text, title, description, image URL |
| **Tech filtering** | Keyword-based relevance check |

---

## 7. Infrastructure Layer

### Rate Limiter (`app/core/rate_limiter.py`)

Uses a **Redis sorted-set sliding window**:

| Platform | Limit | Window |
|----------|-------|--------|
| HackerNews | 30 | 60s |

### Retry (`app/core/retry.py`)

Powered by **tenacity**: exponential backoff (3 attempts, 1s → 2s → 4s)

### Deduplication (`app/core/dedup.py`)

```
Step 1 — Normalize title: lowercase → strip accents → remove non-alphanumeric
Step 2 — dedup_key: sha256(normalized_title[:100])[:16 hex chars]
Step 3 — Similarity: Jaccard(words_a, words_b) ≥ 0.5 threshold
```

---

## 8. Data Model

### `trend_items`

| Column | Type | Description |
|--------|------|-------------|
| `platform` | enum | `hackernews` |
| `title` | varchar(500) | Article title |
| `content_body` | text | Full article text |
| `category` | str | LLM-assigned: `tech`, `business`, `education`, `other` |
| `sentiment` | enum | `positive` / `negative` / `neutral` / `mixed` |
| `lifecycle` | enum | `rising` / `peak` / `declining` |
| `relevance_score` | float | LinkedIn relevance 0–10 |
| `related_topics` | JSON `[]` | Technology keywords |

(See `app/db/models/` for full schema)

---

## 9. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/scan` | Trigger HackerNews scan (202) |
| `GET` | `/api/v1/scan/{scan_id}/status` | Poll scan progress |
| `GET` | `/api/v1/trends` | List with filters + pagination |
| `GET` | `/api/v1/trends/top` | Top trends by timeframe |
| `GET` | `/api/v1/trends/{trend_id}` | Full detail with comments |
| `POST` | `/api/v1/scan/schedule` | Create cron schedule |
| `GET` | `/api/v1/scan/schedule` | List schedules |
| `GET` | `/api/v1/reports` | List reports |
| `GET` | `/api/v1/reports/{scan_run_id}` | Full markdown report |
| `GET` | `/api/v1/reports/{scan_run_id}/summary` | JSON summary + LinkedIn content angles |

---

## 10. Configuration & Environment

```env
# Database
DATABASE_URL=postgresql+asyncpg://scanner:scanner_pass@localhost:5432/trending_scanner

# Redis
REDIS_URL=redis://localhost:6379/0

# LLM (analyzer + reporter)
OPENAI_API_KEY=sk-...

# App
APP_ENV=development
LOG_LEVEL=INFO
```

### File Structure

```
ai-service/
├── app/
│   ├── agents/
│   │   ├── scanners/
│   │   │   ├── base.py              (BaseScannerNode ABC)
│   │   │   └── hackernews.py        (HackerNewsScannerNode)
│   │   ├── state.py                 (TrendScanState TypedDict)
│   │   ├── supervisor.py            (build_trend_scan_graph, run_scan)
│   │   ├── analyzer.py              (analyzer_node — LinkedIn tech focus)
│   │   ├── content_saver.py         (content_saver_node)
│   │   └── reporter.py              (reporter_node — Vietnamese LinkedIn)
│   ├── api/v1/
│   │   ├── schemas/                 (Pydantic models)
│   │   ├── scan.py, trends.py, reports.py, schedule.py
│   │   └── router.py
│   ├── db/models/                   (SQLAlchemy models)
│   ├── core/                        (rate_limiter, dedup, retry, exceptions)
│   ├── tools/
│   │   └── hackernews_tool.py       (HN Firebase API wrapper)
│   ├── clients/
│   │   └── openai_client.py         (GPT-4o clients)
│   ├── config.py                    (Pydantic Settings)
│   └── main.py                      (FastAPI app)
├── content/hackernews/              (saved articles by date)
├── reports/                         (generated reports by scan)
├── alembic/                         (migrations)
└── pyproject.toml
```
