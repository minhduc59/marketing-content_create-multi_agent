# F02: Trend Discovery (Trend Radar)

> Crawl trending data from multiple platforms and normalize into a unified format.

## Overview

| Property | Value |
|----------|-------|
| **Agent** | Trending-Scanner |
| **Pipeline Stage** | 1 |
| **Trigger** | `current_stage = "init"` |
| **Status** | Implemented |
| **Key files** | `ai-service/app/agents/scanners/`, `ai-service/app/tools/` |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `keywords` | `List[str]` | Industry keywords for targeted crawl |
| `platforms` | `List[str]` | Platforms to crawl (youtube, tiktok, twitter, instagram, google_trends, reddit) |
| `crawl_config` | `Object` | `{region, max_items_per_platform, include_comments}` |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `raw_trends` | `List[Object]` | `{topic, volume, platform, region, engagement_metrics}` |
| `crawl_timestamp` | `String` | ISO timestamp of crawl completion |
| `platforms_completed` | `List[str]` | Successfully crawled platforms |
| `platforms_failed` | `Dict[str, str]` | `{platform: error_message}` |

---

## Processing Logic

```
1. Orchestrator routes to Trending Scanner with current_stage = "init"
2. Fan-out: Send() dispatches to N platform scanner nodes in parallel
3. Each scanner:
   a. Check rate limit (Redis sliding window)
   b. Check Redis cache (30-min TTL)
   c. Cache miss → call platform API via Tool class
   d. Normalize response to RawTrendData format
   e. Write to cache
   f. Return {"raw_results": [RawTrendData(...)]}
4. Fan-in: operator.add merges all raw_results
5. collect_results tallies successes and failures
6. Update current_stage → "trends_crawled"
```

---

## Platform Scanners (6 nodes, concurrent)

| Scanner | API Source | Tool File | Key Data |
|---------|-----------|-----------|----------|
| **YouTube** | YouTube Data API v3 | `app/tools/youtube_tool.py` | Trending videos (mostPopular chart), metadata, stats |
| **TikTok** | RapidAPI `tiktok-api23` | `app/tools/tiktok_tool.py` | Trending feed, hashtags/challenges, play/like counts |
| **Twitter/X** | RapidAPI Twitter | `app/tools/twitter_tool.py` | Trending topics by country, top tweets, media |
| **Instagram** | RapidAPI Instagram | `app/tools/instagram_tool.py` | Trending reels, hashtag top posts, engagement |
| **Google Trends** | pytrends (unofficial) | `app/tools/google_trends_tool.py` | Daily trending searches, related rising queries |
| **Reddit** | Reddit PRAW | `app/tools/reddit_tool.py` | Hot posts from 17 subreddits, r/popular |

---

## Data Extracted Per Item

| Category | Fields |
|----------|--------|
| **Core** | title, description, content_body, source_url |
| **Tags** | hashtags, tags, related_topics |
| **Engagement** | views, likes, comments_count, shares, trending_score |
| **Media** | thumbnail_url, video_url, image_urls |
| **Author** | name, profile_url, follower_count |
| **Raw** | original API response preserved |

---

## Rate Limits

| Platform | Limit | Window |
|----------|-------|--------|
| YouTube | 10,000 units | 24h |
| TikTok | 500 req | 24h |
| Twitter | 500 req | 24h |
| Instagram | 500 req | 24h |
| Google Trends | 12 req | 60s |
| Reddit | 60 req | 60s |

---

## Infrastructure

- **Cache:** Redis, 30-min TTL per platform (`cache:scan:{platform}:latest`)
- **Rate Limiter:** Redis sorted-set sliding window (`ratelimit:{platform}`)
- **Retry:** tenacity exponential backoff (3 attempts, 1s → 2s → 4s)
- **Dedup:** SHA-256 hash of normalized title → `dedup_key` (16 hex chars)
- **Graceful degradation:** Partial status if some platforms fail

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/scan` | Trigger async scan (returns 202 with scan_id) |
| `GET` | `/api/v1/scan/{id}/status` | Poll scan progress |

---

## Database Tables

- `scan_runs` — Scan lifecycle tracking (status, duration, errors)
- `trend_items` — 30+ fields per trend item

---

## Dependencies

- Redis (cache + rate limit)
- Platform API keys (YouTube, RapidAPI, Reddit)
- PostgreSQL (persistence)

---

## Related Features

- [F03 Trend Analysis](F03-trend-analysis.md) — Receives raw_trends as input
- [F01 Orchestrator](F01-orchestrator-router.md) — Routes here when `current_stage = "init"`
