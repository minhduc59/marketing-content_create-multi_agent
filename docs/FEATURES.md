# Feature Implementation Graph

This document tracks all implemented and planned features. Focus: **LinkedIn** platform, **Technology** domain, **HackerNews** data source.

---

## Feature Index

| ID | Feature | Stage | Status |
|----|---------|-------|--------|
| F02 | [Trend Discovery](features/F02-trend-discovery.md) | HN Crawling | Implemented |
| F03 | [Trend Analysis](features/F03-trend-analysis.md) | Analysis | Implemented |
| F04 | [Report Generation](features/F04-report-generation.md) | Reporting | Implemented |
| F05 | LinkedIn Content Generation | Content Gen | Planned |
| F06 | LinkedIn Publishing | Publishing | Planned |

---

## Detailed Implementation Tree

### HackerNews → LinkedIn Pipeline (F02 + F03 + F04)

**Status:** Implemented | **Location:** `ai-service/`

```
HackerNews → LinkedIn Pipeline
│
├─── LangGraph Linear Pipeline
│    ├── Linear graph (no fan-out needed)            ← app/agents/supervisor.py
│    ├── Shared state (TrendScanState)               ← app/agents/state.py
│    ├── Background scan execution (async)           ← app/agents/supervisor.py:run_scan()
│    └── Graceful degradation (partial status)       ← ScanStatus.PARTIAL on failure
│
├─── HackerNews Scanner
│    ├── Top stories via Firebase API                ← app/agents/scanners/hackernews.py
│    ├── Full article text extraction                ← app/tools/hackernews_tool.py
│    ├── Technology relevance filtering              ← keyword-based tech filter
│    └── Rate limiting (30 req/60s)                  ← app/core/rate_limiter.py
│
├─── AI Analyzer (GPT-4o) — F03                      ← app/agents/analyzer.py
│    ├── Technology-focused categorization            ← tech/business/education/other
│    ├── Sentiment analysis                          ← positive/negative/neutral/mixed
│    ├── Trend lifecycle detection                   ← rising/peak/declining
│    ├── LinkedIn relevance scoring (0-10)           ← engagement + novelty + LinkedIn fit
│    ├── Related topics extraction                   ← 2-5 tech keywords per item
│    ├── Batch processing (40-item chunks)           ← context window management
│    └── Fallback on LLM failure                     ← defaults to neutral/rising/5.0
│
├─── Content Saver                                    ← app/agents/content_saver.py
│    ├── Save HN articles as markdown                ← YAML frontmatter + full content
│    └── Output: content/hackernews/{date}/{slug}.md
│
├─── Report Generation — F04                          ← app/agents/reporter.py
│    ├── Vietnamese LinkedIn trend report (LLM)      ← markdown with ranking table
│    ├── LinkedIn content angle suggestions           ← 2-3 per top trend
│    │   ├── Content types: post, article, carousel, poll, document
│    │   └── Writing styles: thought_leadership, professional, educational, etc.
│    ├── Fallback template on LLM failure
│    ├── Local file storage (reports/{scan_run_id}/)
│    └── JSON summary for programmatic access
│
├─── REST API Endpoints                               ← app/api/v1/
│    ├── POST /api/v1/scan                           ← Trigger HN scan (202)
│    ├── GET  /api/v1/scan/{id}/status               ← Scan progress
│    ├── GET  /api/v1/trends                         ← List + filter + paginate
│    ├── GET  /api/v1/trends/top                     ← Top ranked (24h/7d/30d)
│    ├── GET  /api/v1/trends/{id}                    ← Full detail
│    ├── GET  /api/v1/reports                        ← List reports
│    ├── GET  /api/v1/reports/{id}                   ← Full markdown report
│    └── GET  /api/v1/reports/{id}/summary           ← JSON summary + content angles
│
├─── Database Layer                                   ← app/db/
│    ├── ScanRun, TrendItem, TrendComment, ScanSchedule
│    ├── Platform enum: HACKERNEWS only
│    └── Alembic migrations
│
└─── Core Infrastructure                              ← app/core/
     ├── Rate Limiter (Redis sliding window)          ← HackerNews: 30/60s
     ├── Cache (Redis, 30-min TTL)
     ├── Dedup (SHA256 + Jaccard similarity)
     ├── Retry (tenacity exponential backoff)
     └── Structured logging (structlog)
```

---

### LinkedIn Content Generation (F05 — Planned)

```
LinkedIn Content Generation
│
├─── Read trend report + content angles
├─── Generate LinkedIn posts (multiple styles)
│    ├── thought_leadership — Industry vision
│    ├── professional — Data-driven insights
│    ├── storytelling — Personal experience
│    └── educational — How-to, tutorials
├─── Generate LinkedIn articles (long-form)
├─── Human review gate
└─── Content pool management
```

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `←` | File location or reference |
| `├──` | Sub-feature (has siblings below) |
| `└──` | Last sub-feature in group |
