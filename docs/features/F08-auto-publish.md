# F08: Auto Publish (Cross-post Engine)

> Automated cross-platform publishing to Facebook and Instagram with format adaptation, retry logic, and status tracking.

## Overview

| Property | Value |
|----------|-------|
| **Agent** | Publish-Post |
| **Pipeline Stage** | 7 |
| **Trigger** | `current_stage = "scheduled"` |
| **Status** | Planned (Sprint 5) |
| **Key files** | `backend/src/social/facebook.service.ts`, `backend/src/social/instagram.service.ts` (to be created) |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `schedule` | `List[Object]` | Schedule entries from Stage 6 `{platform, scheduled_at, content_id, media_urls}` |
| `content` | `Object` | Content + media URLs from Content Pool `{caption, hashtags, media_urls}` |
| `tokens` | `Object` | OAuth access tokens `{facebook: access_token, instagram: access_token}` |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `published_ids` | `List[String]` | Platform-specific post IDs (e.g., Facebook post ID, Instagram media ID) |
| `status` | `Object` | `{facebook: "published"/"failed", instagram: "published"/"failed"}` |
| `publish_time` | `String` | Actual publish timestamp (ISO 8601) |

---

## Processing Logic

```
1. BullMQ worker picks up delayed job at scheduled time
2. Load content + media from DB using content_id
3. Load OAuth tokens for target platform from social_accounts table
4. Adapt content per platform:
   a. Facebook: full caption + link preview format
   b. Instagram: shorter caption + hashtags at end
5. Publish to target platform:
   a. Facebook → Graph API /photos or /feed endpoint
   b. Instagram → 2-step container flow (create → poll → publish)
6. Record platform post ID + URL in published_posts table
7. Update schedule status → "PUBLISHED"
8. Notify user via WebSocket: { event: "post_published", platform, post_url }
9. Update current_stage → "published"

On failure:
10. Retry up to 3 attempts with exponential backoff (2s, 4s, 8s)
11. If all retries fail: update status → "FAILED", notify user
12. Log error for debugging
```

---

## Facebook Graph API

### Publish Photo Post

```typescript
// POST /{page-id}/photos
const response = await axios.post(
  `https://graph.facebook.com/v19.0/${pageId}/photos`,
  {
    url: mediaUrl,           // Public S3 URL
    caption: facebookCaption, // Full caption with hashtags
    access_token: pageAccessToken,
  }
);
const postId = response.data.id; // Facebook post ID
```

### Publish Text Post (with link)

```typescript
// POST /{page-id}/feed
const response = await axios.post(
  `https://graph.facebook.com/v19.0/${pageId}/feed`,
  {
    message: caption,
    link: linkUrl,           // Optional link preview
    access_token: pageAccessToken,
  }
);
```

### Required Scopes
- `pages_manage_posts`
- `pages_read_engagement`
- `pages_show_list`

### Rate Limits
- 200 calls / hour / page

---

## Instagram Graph API

### 2-Step Container Flow

Instagram requires a 2-step process (Content Publishing API):

```typescript
// Step 1: Create media container
const container = await axios.post(
  `https://graph.facebook.com/v19.0/${igUserId}/media`,
  {
    image_url: mediaUrl,      // Must be public HTTPS URL
    caption: instagramCaption, // Caption with hashtags
    access_token: accessToken,
  }
);
const containerId = container.data.id;

// Step 2: Poll until container is ready (1-5 min processing)
let status = "IN_PROGRESS";
while (status === "IN_PROGRESS") {
  await sleep(5000); // Poll every 5 seconds
  const check = await axios.get(
    `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`
  );
  status = check.data.status_code; // "FINISHED" | "ERROR" | "IN_PROGRESS"
}

// Step 3: Publish container
const publish = await axios.post(
  `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
  {
    creation_id: containerId,
    access_token: accessToken,
  }
);
const mediaId = publish.data.id; // Instagram media ID
```

### Requirements
- Image URL must be public HTTPS (S3 presigned URL or public bucket)
- Container processing takes 1-5 minutes
- Instagram Business or Creator account required

### Rate Limits
- 25 content publishing calls / Instagram user / 24h

---

## Cross-post Adapter

From 1 source content, adapt for each platform:

| Aspect | Facebook | Instagram |
|--------|----------|-----------|
| **Caption length** | Full (150-300 words) | Shorter (100-150 words) |
| **Hashtags** | Inline, 3-5 tags | At end or first comment, 15-20 tags |
| **Media format** | 1200×630 (feed) | 1080×1080 (feed) or 1080×1920 (story) |
| **Links** | Supported (link preview) | Not clickable in caption |
| **Emoji** | Moderate | Heavy use encouraged |

---

## Retry Logic

| Config | Value |
|--------|-------|
| **Max attempts** | 3 |
| **Backoff type** | Exponential |
| **Backoff delays** | 2s → 4s → 8s |
| **Retryable errors** | Network timeout, 5xx server errors, rate limit (429) |
| **Non-retryable errors** | 401 (token expired), 400 (invalid content), content policy violation |

On 429 (rate limit):
- Read `Retry-After` header
- Wait specified duration before retry
- If no header, use exponential backoff

---

## OAuth Token Management

| Field | Description |
|-------|-------------|
| `platform` | `facebook` or `instagram` |
| `access_token` | Long-lived page access token |
| `token_expiry` | Expiration date (Facebook: 60 days, Instagram: 60 days) |
| `refresh_token` | For token renewal before expiry |
| `page_id` | Facebook Page ID or Instagram Business Account ID |

- Tokens stored encrypted in `social_accounts` table
- Auto-refresh 7 days before expiry
- OAuth flow initiated from Settings page in frontend

---

## Infrastructure

- **Queue:** BullMQ worker processes delayed jobs
- **APIs:** Facebook Graph API v19.0, Instagram Content Publishing API
- **Storage:** PostgreSQL (published post records, OAuth tokens)
- **Notifications:** WebSocket (publish status updates)
- **Logging:** structlog with publish metrics (platform, duration, success/failure)

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/published` | List published posts (paginated) |
| `GET` | `/published/:id/status` | Check publish status per platform |
| `POST` | `/social/connect/:platform` | Initiate OAuth flow for platform |
| `DELETE` | `/social/disconnect/:platform` | Revoke platform access |
| `GET` | `/social/accounts` | List connected social accounts |

---

## Database Tables

- `published_posts` — Published post tracking:
  - Fields: `platformPostId`, `platformUrl`, `publishedAt`, `platform`, `publishStatus`
  - Relations: belongs to `post_schedule`, belongs to `content_draft`
- `social_accounts` — OAuth token storage:
  - Fields: `platform`, `accessToken` (encrypted), `tokenExpiry`, `refreshToken`, `pageId`, `pageName`
  - Relations: belongs to `user`
  - Index: `idx_social_accounts_user_platform` (unique per user + platform)

---

## Dependencies

- Facebook Graph API v19.0 (page publishing)
- Instagram Content Publishing API (2-step container flow)
- BullMQ + Redis (job execution)
- PostgreSQL (publish records, OAuth tokens)
- WebSocket (NestJS Gateway — real-time status)

---

## Related Features

- [F07 Scheduling](F07-scheduling.md) — Provides schedule entries to publish
- [F09 Performance Feedback](F09-performance-feedback.md) — Collects metrics from published posts
- [F01 Orchestrator](F01-orchestrator-router.md) — Routes here when `current_stage = "scheduled"`
