# F02: Trend Discovery — HackerNews Technology Scanner

> Crawl trending technology content from Hacker News and normalize into a unified format for LinkedIn content creation.

## Overview

| Property | Value |
|----------|-------|
| **Pipeline Stage** | 1 — HN Crawling |
| **Status** | Implemented |
| **Data Source** | Hacker News (Firebase API) |
| **Target** | LinkedIn Technology Content |
| **Key files** | `ai-service/app/agents/scanners/hackernews.py`, `ai-service/app/tools/hackernews_tool.py` |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `platforms` | `list[str]` | `["hackernews"]` |
| `options` | `dict` | `{max_items_per_platform, include_comments}` |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `raw_results` | `list[RawTrendData]` | HackerNews items merged via `operator.add` |
| `errors` | `list[ScanError]` | Errors merged via `operator.add` |

---

## Processing Logic

```
1. Pipeline starts → hackernews_scanner node
2. Scanner (inherits BaseScannerNode):
   a. Check rate limit (Redis sliding window, 30 req/60s)
   b. Call HackerNewsTool.fetch_all(max_stories)
   c. Tool fetches top story IDs from Firebase API
   d. Fetch story details in parallel (with semaphore)
   e. Crawl article URLs to extract full text
   f. Filter for technology relevance (keyword matching)
   g. Return {"raw_results": [RawTrendData(...)]}
3. collect_results validates and logs statistics
```

---

## Data Extracted Per Item

| Category | Fields |
|----------|--------|
| **Core** | title, description, content_body, source_url |
| **HN Metrics** | hn_score, hn_comments, hn_author |
| **Article** | article_title, article_description, article_image_url |
| **Metadata** | published_at, hn_url |
| **Raw** | original HN API response preserved |

---

## Rate Limits

| Platform | Limit | Window |
|----------|-------|--------|
| HackerNews | 30 req | 60s |

---

## Infrastructure

- **Rate Limiter:** Redis sorted-set sliding window (`ratelimit:hackernews`)
- **Retry:** tenacity exponential backoff (3 attempts)
- **Dedup:** SHA-256 hash of normalized title → `dedup_key`
- **Graceful degradation:** FAILED status on scanner error

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/scan` | Trigger async HN scan (returns 202) |
| `GET` | `/api/v1/scan/{id}/status` | Poll scan progress |

---

## Dependencies

- Redis (rate limiting)
- PostgreSQL (persistence)
- httpx (HTTP client for HN Firebase API + article crawling)

---

## Related Features

- [F03 Trend Analysis](F03-trend-analysis.md) — Receives raw_results as input
- [F04 Report Generation](F04-report-generation.md) — Generates LinkedIn-focused reports
