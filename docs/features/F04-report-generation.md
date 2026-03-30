# F04: Report Generation (Trend Reporter)

> Generate comprehensive trend reports in Markdown format with market overview, ranking tables, and content angle suggestions.

## Overview

| Property | Value |
|----------|-------|
| **Agent** | Trending-Scanner (sub-task: report) |
| **Pipeline Stage** | 3 |
| **Trigger** | `analyzer` node completes in LangGraph |
| **Status** | Implemented |
| **Key files** | `ai-service/app/agents/reporter.py` |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `analyzed_trends` | `list[dict]` | Analyzed and ranked trends from Stage 2 with category, sentiment, lifecycle, relevance_score |
| `cross_platform_groups` | `list[dict]` | Grouped trends appearing on multiple platforms |
| `scan_run_id` | `str` | UUID of the current scan run |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `report_content` | `str` | Full Markdown report content |
| `report_file_path` | `str` | Relative path to saved report file (e.g., `reports/{scan_run_id}/2026-03-27_report.md`) |

Files saved to disk:
- `reports/{scan_run_id}/{YYYY-MM-DD}_report.md` — Full markdown report
- `reports/{scan_run_id}/{YYYY-MM-DD}_summary.json` — Structured JSON with content angles

---

## Processing Logic

```
1. Receive analyzed_trends and cross_platform_groups from Stage 2
2. Prepare report data:
   a. Sort all trends by relevance_score (descending)
   b. Select top 50 items for detailed LLM analysis
   c. Compute aggregate statistics (by platform, category, sentiment, lifecycle)
   d. Strip large fields (raw_data, content_body) to save LLM tokens
3. LLM Call #1 — Generate full Markdown report (max_tokens=8192, temp=0.3):
   a. Executive Summary — top 5 trends overview + key takeaway
   b. Market Overview — category/sentiment distribution, platform observations
   c. Trend Ranking Table — ALL trends sorted by score
   d. Detailed Analysis — top 10 with engagement data and content opportunity
   e. Content Angle Suggestions — 2-3 ideas per top trend
   f. Cross-Platform Trends — grouped analysis
4. LLM Call #2 — Generate structured content angles JSON (separate call for reliability):
   a. Top 10 trends → 2-3 content angles each
   b. Returns pure JSON array (no markdown)
5. Build summary JSON from Python data + LLM content angles
6. Save report.md + summary.json to reports/{scan_run_id}/
7. Fallback: If LLM fails, generate template-based report using Python string formatting
8. Return report_content and report_file_path to state
9. persist_results_node saves report_file_path to ScanRun in database
```

---

## Report Structure

The generated Markdown report follows this template:

```markdown
# Trend Report — {date}

## Executive Summary
- Top 5 trends at a glance with WHY they matter
- Cross-platform phenomena
- Key takeaway for content strategy

## Market Overview
- Category distribution analysis
- Sentiment analysis summary
- Platform-specific observations
- Emerging themes

## Trend Ranking

| Rank | Title | Platform | Category | Score | Sentiment | Lifecycle |
|------|-------|----------|----------|-------|-----------|-----------|
| 1 | ...   | youtube  | tech     | 9.2   | positive  | rising    |

## Detailed Analysis — Top 10 Trends

### 1. {Trend Name}
- **Platform:** youtube | **Score:** 9.2/10 | **Lifecycle:** rising
- **Engagement:** 1.2M views, 45K likes, 3.2K comments
- **Why it's trending:** ...
- **Content opportunity:** ...

## Content Angle Suggestions

### {Trend Title}
1. **reel_script** for **instagram**
   - **Style:** trendy
   - **Hook:** "Did you know that..."
   - **Estimated engagement:** high
   - **Why this works:** ...

## Cross-Platform Trends
Trends appearing on multiple platforms with combined analysis.
```

---

## Content Angle Suggestions

For each top trend, the LLM generates 2-3 content ideas:

| Field | Type | Description |
|-------|------|-------------|
| `trend_title` | `str` | The trend this angle targets |
| `platform` | `str` | Target platform (facebook, instagram, tiktok, youtube) |
| `content_type` | `str` | post, reel_script, carousel, story, short_video, thread |
| `writing_style` | `str` | trendy, professional, storytelling, educational, humorous |
| `hook` | `str` | Specific, engaging opening line ready to use |
| `estimated_engagement` | `str` | high / medium / low based on trend score |
| `rationale` | `str` | Why this content angle works |

---

## Storage

- **Development:** `ai-service/reports/{scan_run_id}/{YYYY-MM-DD}_report.md`
- **Production:** AWS S3 / Cloudflare R2 (future)
- **Path pattern:** `reports/{scan_run_id}/{YYYY-MM-DD}_report.md`
- **Content type:** `text/markdown` + `application/json`
- **Database:** `report_file_path` column on `scan_runs` table

---

## Infrastructure

- **LLM:** GPT-4o via langchain-openai — report generation (max_tokens=8192, temp=0.3)
- **Two-call strategy:** Separate calls for markdown report and structured JSON (reliability)
- **Fallback:** Template-based report on LLM failure (Python string formatting)
- **Logging:** structlog with report generation metrics
- **File I/O:** pathlib + synchronous write (small files, ~20-50KB)

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/reports` | List all generated reports (paginated) |
| `GET` | `/api/v1/reports/{scan_run_id}` | Full markdown report content |
| `GET` | `/api/v1/reports/{scan_run_id}/summary` | JSON summary with content angles |

---

## Database Changes

- Added `report_file_path` (nullable String) column to `scan_runs` table
- Migration: `alembic/versions/a1b2c3d4e5f6_add_report_file_path_to_scan_runs.py`

---

## How to Run & Test

```bash
# 1. Start infrastructure
cd ai-service && docker-compose up -d postgres redis

# 2. Apply migrations (includes report_file_path column)
alembic upgrade head

# 3. Start server
uvicorn app.main:app --reload --port 8000

# 4. Trigger a scan (report is generated automatically)
curl -X POST http://localhost:8000/api/v1/scan \
  -H "Content-Type: application/json" \
  -d '{"platforms": ["google_trends"], "options": {"region": "US", "max_items_per_platform": 10}}'

# 5. Wait for scan to complete
curl http://localhost:8000/api/v1/scan/{scan_id}/status

# 6. List reports
curl http://localhost:8000/api/v1/reports

# 7. Read full report
curl http://localhost:8000/api/v1/reports/{scan_run_id}

# 8. Get structured summary with content angles
curl http://localhost:8000/api/v1/reports/{scan_run_id}/summary

# 9. Verify files on disk
ls ai-service/reports/{scan_run_id}/
# Expected: 2026-03-27_report.md, 2026-03-27_summary.json
```

---

## Dependencies

- GPT-4o via langchain-openai (report generation + content angles)
- PostgreSQL (report_file_path metadata)
- pathlib (local file storage)
- structlog (logging)

---

## Related Features

- [F03 Trend Analysis](F03-trend-analysis.md) — Provides `analyzed_trends` as input
- [F05 Content Generation](F05-content-generation.md) — Reads report files and content angles as context for content creation
- [F01 Orchestrator](F01-orchestrator-router.md) — Reporter is wired as a LangGraph node between analyzer and persist_results
