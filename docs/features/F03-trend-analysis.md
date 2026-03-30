# F03: Trend Analysis (Trend Analyzer)

> LLM-powered analysis of raw trends: auto-categorization, sentiment detection, lifecycle scoring, and relevance ranking.

## Overview

| Property | Value |
|----------|-------|
| **Agent** | Trending-Scanner (sub-task: analysis) |
| **Pipeline Stage** | 2 |
| **Trigger** | `current_stage = "trends_crawled"` |
| **Status** | Implemented |
| **Key files** | `ai-service/app/agents/analyzer.py`, `ai-service/app/core/dedup.py` |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `raw_trends` | `List[Object]` | Raw trend data from Stage 1 `{topic, volume, platform, region, engagement_metrics}` |
| `historical_performance` | `List[Object]` | Past post performance data for context |
| `current_strategy` | `Object` | `{tone, style, brand_voice}` — current content strategy |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `ranked_trends` | `List[Object]` | `{topic, score, sentiment, lifecycle, category, related_topics}` |
| `suggested_topics` | `List[String]` | Recommended content topics derived from analysis |

---

## Processing Logic

```
1. Receive raw_trends from Stage 1 (fan-in collected results)
2. Flatten all items with platform tags
3. Compute dedup_key (SHA256 of normalized title)
4. Detect cross-platform groups via Jaccard similarity (threshold 0.5)
5. Chunk items into 40-item batches (context window management)
6. For each batch:
   a. Send to Claude Sonnet with ANALYZER_SYSTEM_PROMPT
   b. Parse JSON response (handle markdown code blocks)
   c. On LLM failure → fallback defaults (neutral/rising/5.0)
7. Merge analysis results back into trend items
8. Apply cross-platform score boost (+20% per additional platform)
9. Sort by relevance_score descending
10. Update current_stage → "trends_analyzed"
```

---

## 16 Categories

The analyzer classifies each trend into one of 16 categories:

| # | Category | Examples |
|---|----------|----------|
| 1 | `tech` | AI, gadgets, software launches |
| 2 | `fashion` | Clothing trends, fashion weeks |
| 3 | `food` | Recipes, restaurant reviews, food trends |
| 4 | `beauty` | Skincare, makeup, beauty hacks |
| 5 | `fitness` | Workouts, gym culture, wellness |
| 6 | `business` | Startups, finance, marketing |
| 7 | `entertainment` | Movies, TV shows, celebrities |
| 8 | `gaming` | Video games, esports, streaming |
| 9 | `education` | Learning, courses, study tips |
| 10 | `health` | Medical, mental health, nutrition |
| 11 | `travel` | Destinations, travel tips, tourism |
| 12 | `sports` | Football, basketball, Olympics |
| 13 | `music` | Artists, albums, concerts, viral sounds |
| 14 | `politics` | Government, policy, elections |
| 15 | `lifestyle` | Home decor, relationships, daily life |
| 16 | `other` | Anything not fitting above categories |

---

## Sentiment Analysis

| Sentiment | Definition |
|-----------|------------|
| `positive` | Enthusiastic, optimistic, celebratory tone |
| `negative` | Critical, alarming, controversial tone |
| `neutral` | Informational, factual, balanced tone |
| `mixed` | Contains both positive and negative elements |

---

## Lifecycle Detection

| Phase | Criteria |
|-------|----------|
| `rising` | New trend gaining momentum, increasing search volume and engagement |
| `peak` | Maximum visibility, high engagement, widespread discussion |
| `declining` | Engagement dropping, being replaced by newer trends |

---

## Relevance Scoring (0-10)

Scoring factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| Cross-platform presence | High | Trend appears on multiple platforms |
| Engagement metrics | High | Views, likes, comments, shares relative to platform norms |
| Timeliness | Medium | How recently the trend emerged |
| Content creation potential | Medium | How easily the trend can be turned into marketing content |

---

## Cross-Platform Grouping

- **Title normalization:** Unicode stripping, lowercase, remove special characters and accents
- **Dedup key:** SHA256 hash of normalized title (first 16 hex chars)
- **Jaccard similarity:** Word overlap ratio between titles, threshold `0.5`
- **Score boost:** `+20%` per additional platform where the same trend appears
- **Group detection:** Trends appearing on 2+ platforms are grouped under a single entry

---

## Batch Processing

- **Chunk size:** 40 items per LLM call (context window management)
- **Prompt:** System prompt defines output JSON schema for category, sentiment, lifecycle, score, related_topics
- **Response parsing:** Handles both raw JSON and markdown-wrapped code blocks (` ```json ... ``` `)
- **Fallback on failure:** If LLM returns invalid JSON or errors out, defaults to `{sentiment: "neutral", lifecycle: "rising", score: 5.0}`

---

## Infrastructure

- **LLM:** Claude Sonnet via Anthropic SDK (`ai-service/app/clients/`)
- **Cache:** Redis — analyzed results cached for reuse
- **Dedup:** SHA256 hash computation (`ai-service/app/core/dedup.py`)
- **Logging:** structlog with JSON output in production

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/trends` | List trends with filtering (platform, category, sentiment, lifecycle, min_score) + pagination |
| `GET` | `/api/v1/trends/{id}` | Full trend detail with comments and analysis |
| `GET` | `/api/v1/trends/top` | Top ranked trends by time window (24h, 7d, 30d) |

---

## Database Tables

- `trend_items` — Enriched with AI-generated fields:
  - `category` (one of 16 categories)
  - `sentiment` (positive/negative/neutral/mixed)
  - `lifecycle_stage` (rising/peak/declining)
  - `relevance_score` (0.0 - 10.0)
  - `related_topics` (JSON array of 2-5 related keywords)
  - `cross_platform_count` (number of platforms where trend appears)
- `trend_comments` — Sampled comments with per-comment sentiment

---

## Dependencies

- Anthropic Claude Sonnet (LLM analysis)
- Redis (cache, dedup state)
- PostgreSQL (persistence)
- structlog (logging)

---

## Related Features

- [F02 Trend Discovery](F02-trend-discovery.md) — Provides `raw_trends` as input
- [F04 Report Generation](F04-report-generation.md) — Receives `ranked_trends` as input
- [F01 Orchestrator](F01-orchestrator-router.md) — Routes here when `current_stage = "trends_crawled"`
