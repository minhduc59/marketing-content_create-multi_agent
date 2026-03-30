# F09: Performance Feedback (Performance Upgrade Agent)

> Async cron-based metrics collection and AI-driven strategy evolution with versioning, guardrails, and rollback support.

## Overview

| Property | Value |
|----------|-------|
| **Agent** | Performance-Upgrade |
| **Pipeline Stage** | 8 (ASYNC) |
| **Trigger** | Cron job every 24h (NOT through Orchestrator) |
| **Status** | Planned (Sprint 6) |
| **Key files** | `ai-service/app/agents/analytics_agent.py` (to be created) |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `post_ids` | `List[String]` | Platform post IDs from Stage 7 (published posts > 24h old) |
| `metrics` | `Object` | `{likes, views, comments, shares, reach, impressions, saves, clicks}` |
| `strategy_v_n` | `Object` | Current strategy version `{tone, style_rules, content_preferences, posting_insights, version}` |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `performance_report` | `Object` | Analysis report `{top_performers, low_performers, patterns, recommendations}` |
| `strategy_v_n_plus_1` | `Object` | Updated strategy version with changes applied |
| `change_log` | `List[Object]` | `[{field, old_value, new_value, confidence, reason}]` |

---

## Processing Logic

```
1. Cron job triggers independently (NOT via Orchestrator pipeline)
2. Query published_posts table for posts published > 24h ago without metrics
3. For each post, fetch metrics from platform APIs:
   a. Facebook → Insights API (post_impressions, post_reactions_by_type_total, post_clicks)
   b. Instagram → Insights API (impressions, reach, likes, comments, saves)
4. Store metrics in post_analytics table
5. Generate performance report via LLM:
   a. Identify top 3 and bottom 3 performers
   b. Detect patterns (best time, best style, best topic category)
   c. Generate recommendations for strategy adjustment
6. Compare recommendations against current strategy v(N)
7. Apply guardrails (see below) to filter changes
8. Create strategy v(N+1) with approved changes
9. Store new strategy version with change log
10. Repeat on next cron cycle
```

---

## Strategy Object

The Strategy Object is the evolving "brain" that guides content generation:

```python
class ContentStrategy:
    # Identity
    version: int                     # Auto-incrementing version number
    updated_at: datetime             # Last update timestamp

    # Content preferences
    tone: str                        # "casual" | "professional" | "playful"
    style_rules: List[str]          # ["Use emoji sparingly", "Always include CTA"]
    brand_voice: str                 # Brand personality description
    content_preferences: dict        # {preferred_topics: [], avoid_topics: []}

    # Posting insights (learned from data)
    best_posting_hours: dict         # {facebook: [8, 12, 19], instagram: [7, 11, 21]}
    top_performing_hooks: List[str]  # Best opening lines from past posts
    avg_engagement_rate: float       # Baseline engagement rate

    # LLM recommendations
    llm_recommendations: List[str]   # Latest AI suggestions
    confidence_scores: dict          # {recommendation: confidence_float}
```

---

## Guardrails

Prevent over-optimization and strategy drift:

| Guardrail | Rule | Rationale |
|-----------|------|-----------|
| **Max changes per cycle** | 2 changes maximum | Prevent drastic strategy shifts |
| **Minimum sample size** | At least 5 posts between updates | Ensure statistically meaningful data |
| **Version history** | Full history preserved, any version can be restored | Allow rollback on performance drops |
| **Confidence threshold** | Only apply changes with confidence > 0.7 | Avoid low-confidence adjustments |

### Anti-Overfitting Logic

```python
def should_apply_change(change, current_strategy, recent_posts):
    # Rule 1: Max 2 changes per cycle
    if changes_this_cycle >= 2:
        return False

    # Rule 2: Minimum 5 posts since last strategy update
    posts_since_update = count_posts_after(current_strategy.updated_at)
    if posts_since_update < 5:
        return False

    # Rule 3: Confidence check
    if change.confidence < 0.7:
        return False

    return True
```

---

## Versioning

| Operation | Description |
|-----------|-------------|
| **Create v(N+1)** | Copy current strategy, apply changes, increment version |
| **Change log** | Record `{field, old_value, new_value, confidence, reason}` per change |
| **Rollback** | Restore any previous version by copying it as the new latest version |
| **Diff view** | Frontend shows side-by-side comparison between any two versions |

```
Strategy v1 (initial) → v2 (tone: casual→professional) → v3 (added "Always include data") → ...
                                                            ↑
                                                       Rollback target
```

---

## Metrics Collection

### Facebook Insights API

| Metric | API Field | Description |
|--------|-----------|-------------|
| Impressions | `post_impressions` | Total times post was displayed |
| Reach | `post_impressions_unique` | Unique users who saw the post |
| Reactions | `post_reactions_by_type_total` | Like, love, wow, haha, sad, angry |
| Clicks | `post_clicks` | Link clicks, photo clicks, other clicks |
| Shares | `post_activity.shares` | Number of shares |

### Instagram Insights API

| Metric | API Field | Description |
|--------|-----------|-------------|
| Impressions | `impressions` | Total times media was seen |
| Reach | `reach` | Unique accounts that saw the media |
| Likes | `likes` | Like count |
| Comments | `comments` | Comment count |
| Saves | `saved` | Number of saves |
| Shares | `shares` | Number of shares (Reels) |

---

## LLM Performance Analysis

Prompt template for generating performance insights:

```
You are a social media performance analyst. Analyze the following post metrics
and current content strategy, then recommend specific improvements.

Current Strategy (v{N}):
{strategy_json}

Post Performance Data (last {period}):
{metrics_json}

Tasks:
1. Identify top 3 and bottom 3 performing posts with reasons
2. Detect patterns: best posting times, best content styles, best topic categories
3. Recommend max 2 specific strategy changes with confidence scores (0.0-1.0)
4. Each recommendation must include: field to change, new value, confidence, reasoning

Output format: JSON
```

---

## Cron Schedule

| Job | Schedule | Description |
|-----|----------|-------------|
| **Metrics collection** | Every 6 hours | Fetch latest metrics for recent posts |
| **Performance report** | Weekly (Sunday 23:00) | Generate weekly performance report |
| **Strategy update** | Every 24 hours | Evaluate and potentially update strategy |

---

## Infrastructure

- **Cron:** NestJS Schedule module (or APScheduler in Python)
- **APIs:** Facebook Insights API, Instagram Insights API
- **LLM:** Claude Sonnet (performance analysis, strategy recommendations)
- **Database:** PostgreSQL (metrics storage, strategy versioning)
- **Logging:** structlog with analysis metrics

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/analytics/overview` | Dashboard overview (7d / 30d aggregate) |
| `GET` | `/analytics/posts` | Per-post performance metrics (sortable, paginated) |
| `GET` | `/analytics/best-times` | Golden hours analysis based on collected data |
| `GET` | `/analytics/report` | Latest weekly performance report |
| `GET` | `/analytics/strategy` | Current strategy version with change history |
| `POST` | `/analytics/strategy/rollback/:version` | Rollback to specific strategy version |

---

## Database Tables

- `post_analytics` — Per-post metrics:
  - Fields: `likes`, `comments`, `shares`, `reach`, `impressions`, `saves`, `clicks`, `engagementRate`
  - Index: `idx_post_analytics_post_time` for time-range queries
  - Relations: belongs to `published_post`
- `content_strategy_feedback` — Strategy evolution:
  - Fields: `preferredStyles` (JSON), `avoidTopics` (JSON), `bestPostingHours` (JSON), `topPerformingHooks` (JSON), `llmRecommendations` (JSON), `version`, `changeLog` (JSON)
  - Relations: belongs to `user`

---

## Dependencies

- Facebook Insights API (post metrics)
- Instagram Insights API (media metrics)
- Anthropic Claude Sonnet (performance analysis)
- PostgreSQL (metrics + strategy persistence)
- NestJS Schedule / APScheduler (cron jobs)

---

## Related Features

- [F08 Auto Publish](F08-auto-publish.md) — Provides published post IDs for metrics collection
- [F05 Content Generation](F05-content-generation.md) — Strategy feeds back into content generation style/tone
- [F07 Scheduling](F07-scheduling.md) — Golden hours updated by feedback data
- [F01 Orchestrator](F01-orchestrator-router.md) — Runs independently, NOT routed by Orchestrator
