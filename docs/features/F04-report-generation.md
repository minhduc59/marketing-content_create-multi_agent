# F04: Report Generation — LinkedIn Technology Report

> Generate comprehensive technology trend reports in Vietnamese Markdown format with LinkedIn content angle suggestions.

## Overview

| Property | Value |
|----------|-------|
| **Pipeline Stage** | 3 — Reporting |
| **Status** | Implemented |
| **Focus** | Vietnamese LinkedIn reports, Technology domain |
| **Key files** | `ai-service/app/agents/reporter.py`, `ai-service/app/agents/content_saver.py` |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `analyzed_trends` | `list[dict]` | Trends with category, sentiment, lifecycle, relevance_score |
| `cross_platform_groups` | `list[dict]` | Similar trend groupings |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `report_content` | `str` | Full Vietnamese Markdown report for LinkedIn |
| `report_file_path` | `str` | Path to saved report file |
| `content_file_paths` | `list[str]` | Paths to saved article markdown files |

---

## Two-Phase Generation

### Phase 1: Content Saver
Saves HackerNews articles as individual markdown files to `content/hackernews/{date}/`.

### Phase 2: Report Generation (Two LLM Calls)

**Call 1 — Vietnamese Markdown Report (GPT-4o, temp=0.3):**
- Technology trend overview for LinkedIn audience
- Trend ranking table (all items)
- Top 10 detailed analysis with LinkedIn relevance
- LinkedIn content suggestions

**Call 2 — Structured Content Angles JSON (GPT-4o, temp=0.3):**
- 2-3 content angles per top trend
- LinkedIn-specific content types: post, article, carousel, poll, document
- Writing styles: thought_leadership, professional, storytelling, educational, data_driven
- Vietnamese hooks ready to use

---

## Report Structure

```markdown
# Báo Cáo Xu Hướng Công Nghệ cho LinkedIn — {date}

## Tóm Tắt Tổng Quan
## Tổng Quan Thị Trường Công Nghệ
## Bảng Xếp Hạng Xu Hướng
## Phân Tích Chi Tiết — Top 10
## Gợi Ý Nội Dung LinkedIn
```

---

## File Output

| File | Location | Format |
|------|----------|--------|
| Report | `reports/{scan_run_id}/{date}_report.md` | Markdown |
| Summary | `reports/{scan_run_id}/{date}_summary.json` | JSON |
| Articles | `content/hackernews/{date}/{slug}.md` | Markdown |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/reports` | List generated reports |
| `GET` | `/api/v1/reports/{id}` | Full markdown report |
| `GET` | `/api/v1/reports/{id}/summary` | JSON summary with LinkedIn content angles |

---

## Related Features

- [F02 Trend Discovery](F02-trend-discovery.md) — Provides HackerNews data
- [F03 Trend Analysis](F03-trend-analysis.md) — Provides analyzed trends with scores
