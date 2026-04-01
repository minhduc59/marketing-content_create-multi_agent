# F03: Trend Analysis — LinkedIn Technology Focus

> GPT-4o analysis of HackerNews trends: technology categorization, sentiment detection, lifecycle scoring, and LinkedIn relevance ranking.

## Overview

| Property | Value |
|----------|-------|
| **Pipeline Stage** | 2 — Analysis |
| **Status** | Implemented |
| **Focus** | LinkedIn audience, Technology domain |
| **Key files** | `ai-service/app/agents/analyzer.py`, `ai-service/app/core/dedup.py` |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `raw_results` | `list[RawTrendData]` | Raw HackerNews data from Stage 1 |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `analyzed_trends` | `list[dict]` | Items enriched with category, sentiment, lifecycle, relevance_score, related_topics |
| `cross_platform_groups` | `list[dict]` | Grouped similar trends (by title similarity) |

---

## Processing Logic

```
1. Receive raw_results from HackerNews scanner
2. Flatten all items with platform tags
3. Compute dedup_key (SHA256 of normalized title)
4. Chunk items into 40-item batches
5. For each batch:
   a. Send to GPT-4o with LinkedIn-focused ANALYZER_SYSTEM_PROMPT
   b. Parse JSON response (handle markdown code blocks)
   c. On LLM failure → fallback defaults (neutral/rising/5.0)
6. Merge analysis results back into trend items
7. Detect similar trends via Jaccard similarity (threshold 0.5)
```

---

## Categories (Technology-focused)

| # | Category | Examples |
|---|----------|----------|
| 1 | `tech` | AI/ML, programming, software, hardware, startups |
| 2 | `business` | Startups, finance, management, strategy |
| 3 | `education` | Learning, courses, career development |
| 4 | `other` | Anything not fitting above categories |

---

## Relevance Scoring (0-10) — LinkedIn Focus

| Factor | Weight | Description |
|--------|--------|-------------|
| LinkedIn relevance | High | How well the topic fits LinkedIn technology audience |
| HN engagement | High | HN score and comment count |
| Timeliness | Medium | How recently the trend emerged |
| Content creation potential | Medium | How easily it becomes LinkedIn thought leadership content |

---

## Dedup & Similarity

- **Dedup key:** SHA256 hash of normalized title (first 16 hex chars)
- **Jaccard similarity:** Word overlap ratio between titles, threshold `0.5`
- **Title normalization:** Unicode stripping, lowercase, remove special characters

---

## Infrastructure

- **LLM:** GPT-4o via `langchain-openai` — max_tokens=4096, temperature=0
- **Dedup:** SHA256 hash computation (`ai-service/app/core/dedup.py`)
- **Batch size:** 40 items per LLM call
- **Fallback:** defaults to `{sentiment: "neutral", lifecycle: "rising", score: 5.0}`

---

## Related Features

- [F02 Trend Discovery](F02-trend-discovery.md) — Provides `raw_results` as input
- [F04 Report Generation](F04-report-generation.md) — Receives `analyzed_trends` as input
