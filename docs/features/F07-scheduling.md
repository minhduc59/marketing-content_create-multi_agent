# F07: Scheduling (Golden Hour Scheduler)

> Analyze historical engagement data to find optimal posting times and create BullMQ delayed jobs for automated publishing.

## Overview

| Property | Value |
|----------|-------|
| **Agent** | Publish-Post |
| **Pipeline Stage** | 6 |
| **Trigger** | `human_review = "approved"` OR `review_disabled` |
| **Status** | Planned (Sprint 5) |
| **Key files** | `backend/src/queue/publisher.queue.ts` (to be created), `ai-service/app/agents/scheduler.py` (to be created) |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `approved_content` | `Object` | Approved content from Content Pool (caption, hashtags, script, platform variants) |
| `media_urls` | `List[String]` | S3 URLs of approved media assets |
| `historical_engagement` | `List[Object]` | Past post performance `{platform, posted_at, likes, comments, shares, reach}` |
| `timezone` | `String` | User timezone, default `"Asia/Ho_Chi_Minh"` |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `schedule` | `List[Object]` | `[{platform, scheduled_at, content_id, media_urls}]` |
| `golden_hours` | `Object` | `{platform: {weekday: [best_hours]}}` |
| `redis_queue_tasks` | `List[Object]` | BullMQ delayed job references `{job_id, delay_ms, platform}` |

---

## Processing Logic

```
1. Fetch historical analytics from post_analytics table
2. Calculate golden hours per platform:
   a. Group posts by platform + weekday + hour
   b. Compute engagement_rate = (likes + comments*2 + shares*3) / reach
   c. Rank hours by average engagement_rate
   d. Select top 3 hours per weekday per platform
   e. If < 30 historical posts → use default schedules
3. Suggest schedule for next 7 days:
   a. Match approved content to best available time slots
   b. Avoid scheduling conflicts (no 2 posts on same platform within 2 hours)
   c. Respect timezone setting
4. Create BullMQ delayed jobs:
   a. Calculate delay_ms = scheduled_at - now()
   b. Create job with content_id, platform, media_urls
   c. Set attempts: 5, backoff: { type: "exponential", delay: 2000 }
5. Store PostSchedule records in DB
6. Update current_stage → "scheduled"
```

---

## Golden Hour Algorithm

```python
def calculate_golden_hours(analytics: List[PostAnalytics], platform: str) -> Dict[int, List[int]]:
    """
    Returns {weekday(0-6): [top_3_hours]} for a given platform.
    """
    # Group by weekday + hour
    buckets = defaultdict(list)
    for post in analytics:
        if post.platform == platform:
            weekday = post.posted_at.weekday()
            hour = post.posted_at.hour
            engagement_rate = (
                post.likes + post.comments * 2 + post.shares * 3
            ) / max(post.reach, 1)
            buckets[(weekday, hour)].append(engagement_rate)

    # Average engagement per bucket
    averages = {
        key: sum(rates) / len(rates)
        for key, rates in buckets.items()
    }

    # Top 3 hours per weekday
    golden = defaultdict(list)
    for (weekday, hour), avg in sorted(averages.items(), key=lambda x: -x[1]):
        if len(golden[weekday]) < 3:
            golden[weekday].append(hour)

    return dict(golden)
```

---

## Default Schedules

When insufficient historical data (< 30 posts):

| Platform | Default Posting Times | Rationale |
|----------|----------------------|-----------|
| **Facebook** | 08:00, 12:00, 19:00 | Morning commute, lunch break, evening scroll |
| **Instagram** | 07:00, 11:00, 21:00 | Early morning, pre-lunch, late evening peak |

All times in user's configured timezone (default: `Asia/Ho_Chi_Minh`).

---

## BullMQ Configuration

```typescript
// backend/src/queue/publisher.queue.ts
const publisherQueue = new Queue('publisher', {
  connection: { host: 'redis', port: 6379 },
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s, 4s, 8s, 16s, 32s
    },
    removeOnComplete: { count: 100 }, // keep last 100 completed
    removeOnFail: { count: 50 },      // keep last 50 failed
  },
});

// Add delayed job
await publisherQueue.add('publish-post', {
  content_id: scheduleItem.content_id,
  platform: scheduleItem.platform,
  media_urls: scheduleItem.media_urls,
}, {
  delay: scheduleItem.scheduled_at - Date.now(), // ms until publish time
  jobId: `publish-${scheduleItem.content_id}-${scheduleItem.platform}`,
});
```

---

## Calendar View Integration

Frontend displays schedule as a calendar:

| Feature | Implementation |
|---------|---------------|
| **Calendar component** | `react-big-calendar` or shadcn calendar |
| **Events** | Each scheduled post = calendar event with platform icon |
| **Drag-and-drop** | Reschedule by dragging event to new time slot |
| **Post preview** | Hover/click event → show content preview with image |
| **Status badges** | `scheduled` (blue), `publishing` (yellow), `published` (green), `failed` (red) |

---

## Conflict Resolution

- **Same platform:** Minimum 2-hour gap between posts
- **Cross-platform:** Posts can be scheduled simultaneously on different platforms
- **Rescheduling:** PATCH endpoint updates both DB record and BullMQ job (remove old, create new)
- **Cancellation:** DELETE endpoint removes both DB record and BullMQ job

---

## Infrastructure

- **Queue:** BullMQ (Redis-backed delayed jobs)
- **Cache:** Redis (queue state)
- **Database:** PostgreSQL (schedule records, analytics for golden hour calculation)
- **Frontend:** react-big-calendar or shadcn calendar component

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/schedule/create` | Create schedule for approved content |
| `GET` | `/schedule` | List all scheduled posts (calendar format: `{date, events[]}`) |
| `PATCH` | `/schedule/:id` | Reschedule (update time, updates BullMQ job) |
| `DELETE` | `/schedule/:id` | Cancel scheduled post (removes BullMQ job) |
| `GET` | `/schedule/golden-hours` | Get calculated golden hours per platform |

---

## Database Tables

- `post_schedules` — Schedule records:
  - `ScheduleStatus` enum: `SCHEDULED`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `CANCELLED`
  - Fields: `scheduledAt`, `platform`, `bullJobId`, `customCaption`, `customHashtags`, `timezone`
  - Index: `idx_post_schedules_status_time` for queue polling
  - Relations: belongs to `content_draft`, belongs to `user`

---

## Dependencies

- BullMQ + Redis (delayed job queue)
- PostgreSQL (schedule records, analytics data)
- react-big-calendar / shadcn (frontend calendar)
- WebSocket (real-time schedule status updates)

---

## Related Features

- [F05 Content Generation](F05-content-generation.md) — Source content from Content Pool
- [F06 Media Creation](F06-media-creation.md) — Media assets referenced in schedule
- [F08 Auto Publish](F08-auto-publish.md) — Executes scheduled posts at the designated time
- [F10 Human Review Gate](F10-human-review-gate.md) — Gate before scheduling (approval required)
- [F01 Orchestrator](F01-orchestrator-router.md) — Routes here after approval or when review disabled
