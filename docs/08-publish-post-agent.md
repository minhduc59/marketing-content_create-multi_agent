# 08 — Publish Post Agent (Stage 6 & Stage 7)

> **Scope:** ai-service only (FastAPI + LangGraph). Development-first (local filesystem + ngrok).
> **Version:** 0.3.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [File Structure](#3-file-structure)
4. [Database Schema](#4-database-schema)
5. [Configuration](#5-configuration)
6. [LangGraph Pipeline](#6-langgraph-pipeline)
7. [TikTok API Integration](#7-tiktok-api-integration)
8. [API Endpoints Reference](#8-api-endpoints-reference)
9. [Golden Hour Algorithm](#9-golden-hour-algorithm)
10. [Storage & Static Files](#10-storage--static-files)
11. [Setup & Run Instructions](#11-setup--run-instructions)
12. [Testing Guide](#12-testing-guide)
13. [Data Flow Diagrams](#13-data-flow-diagrams)
14. [Error Handling & Edge Cases](#14-error-handling--edge-cases)
15. [Environment Variables Reference](#15-environment-variables-reference)

---

## 1. Overview

The Publish Post Agent completes the content lifecycle by adding two stages to the pipeline:

| Stage | Name | Purpose |
|-------|------|---------|
| Stage 6 | **Golden Hour Scheduler** | Calculates the optimal posting time based on historical engagement data, then schedules a delayed job |
| Stage 7 | **Auto Publish** | Calls the TikTok Content Posting API to publish a photo post when the scheduled time arrives |

### What Changed

- **20 new files** created
- **9 existing files** modified
- **3 new database tables** + **2 new enums**
- **9 new API endpoints** (publish + OAuth)
- **1 new LangGraph graph** (standalone, not appended to scan pipeline)

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Separate LangGraph graph** (not inline in scan pipeline) | Publishing happens hours/days after content generation — it's a distinct lifecycle event |
| **APScheduler + Redis** instead of Bull queue | Project already depends on `apscheduler>=3.10.0`. No Node.js sidecar needed. |
| **Fernet (AES-128-CBC) encryption** for OAuth tokens | Simple, well-understood. Swappable to AWS KMS later. |
| **In-process APScheduler** in FastAPI lifespan | Sufficient for dev. Separate worker process can be added for production. |
| **Extend existing `StorageBackend`** with `get_public_url()` | Zero code changes when switching from local filesystem to S3. |

---

## 2. Architecture

### System Context

```
                                    ┌──────────────────┐
                                    │   TikTok API     │
                                    │  Content Posting  │
                                    └────────▲─────────┘
                                             │
┌─────────────┐    ┌──────────────┐    ┌─────┴──────────┐    ┌──────────┐
│  Frontend   │───▶│  FastAPI     │───▶│  Publish Post  │───▶│ PostgreSQL│
│  (planned)  │    │  API Gateway │    │  Agent (Graph)  │    │          │
└─────────────┘    └──────┬───────┘    └─────┬──────────┘    └──────────┘
                          │                  │
                          │            ┌─────▼──────────┐
                          │            │  APScheduler   │
                          └───────────▶│  (Redis store) │
                                       └────────────────┘
```

### Agent Internal Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Publish Post Graph                        │
│                                                             │
│  START                                                      │
│    │                                                        │
│    ▼                                                        │
│  ┌─────────────────────┐                                    │
│  │ resolve_and_validate │  Load post, create PublishedPost  │
│  │                     │  record, resolve image URL,        │
│  │                     │  assemble caption, validate token  │
│  └──────────┬──────────┘                                    │
│             │                                               │
│             ▼                                               │
│  ┌─────────────────────┐                                    │
│  │    golden_hour      │  Query engagement_time_slots,      │
│  │                     │  compute weighted scores,          │
│  │                     │  pick next optimal slot            │
│  └──────────┬──────────┘                                    │
│             │                                               │
│             ▼                                               │
│  ┌─────────────────────┐                                    │
│  │     scheduler       │  If within 2min → "publish_now"   │
│  │                     │  Else → create APScheduler job     │
│  └──────────┬──────────┘                                    │
│             │                                               │
│        ┌────┴────┐                                          │
│        │ route   │                                          │
│   ┌────▼───┐ ┌───▼────┐                                    │
│   │publish │ │  END   │  (scheduled for later)              │
│   │ _now   │ └────────┘                                     │
│   └────┬───┘                                                │
│        │                                                    │
│        ▼                                                    │
│  ┌─────────────────────┐                                    │
│  │     publish         │  Creator info → init post →        │
│  │                     │  poll status → retry on failure    │
│  └──────────┬──────────┘                                    │
│             │                                               │
│             ▼                                               │
│           END                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. File Structure

### New Files (20)

```
ai-service/
├── alembic/versions/
│   └── e1f2a3b4c5d6_add_publish_tables.py      # Migration: 3 new tables + 2 enums
│
├── app/
│   ├── agents/publish_post/
│   │   ├── __init__.py                          # Package marker
│   │   ├── constants.py                         # Engagement weights, retry delays, limits
│   │   ├── state.py                             # PublishPostState TypedDict
│   │   ├── schemas.py                           # GoldenHourSlot, GoldenHourResult Pydantic models
│   │   ├── caption_assembler.py                 # Assemble caption + hashtags + CTA (2200 char limit)
│   │   ├── golden_hour.py                       # Engagement score calculation & optimal time selection
│   │   ├── scheduler_node.py                    # LangGraph node: schedule or publish_now routing
│   │   ├── publish_node.py                      # LangGraph node: TikTok API call with retry logic
│   │   ├── graph.py                             # LangGraph StateGraph assembly & compilation
│   │   ├── runner.py                            # Entry point: run_publish_pipeline() + APScheduler job
│   │   └── token_manager.py                     # Fernet encrypt/decrypt, token refresh, auto-refresh
│   │
│   ├── clients/
│   │   └── tiktok_client.py                     # Async TikTok API: creator info, photo post, status poll
│   │
│   ├── api/v1/
│   │   ├── publish.py                           # Router: 7 publish endpoints
│   │   ├── auth.py                              # Router: TikTok OAuth login + callback
│   │   └── schemas/
│   │       └── publish.py                       # Request/response Pydantic schemas
│   │
│   └── db/models/
│       ├── user_platform_token.py               # Encrypted OAuth tokens
│       ├── published_post.py                    # Publish attempt tracking
│       └── engagement_time_slot.py              # Golden hour engagement data
```

### Modified Files (9)

```
ai-service/
├── pyproject.toml                               # + cryptography>=43.0.0
├── app/
│   ├── main.py                                  # + StaticFiles mount, APScheduler lifespan, v0.3.0
│   ├── config.py                                # + TikTok, encryption, publishing, golden hour settings
│   ├── core/
│   │   ├── storage.py                           # + get_public_url(), delete() on StorageBackend
│   │   └── rate_limiter.py                      # + "tiktok": (6, 60)
│   ├── api/v1/
│   │   └── router.py                            # + publish_router, auth_router
│   └── db/models/
│       ├── enums.py                             # + PublishStatus, PublishMode enums
│       ├── content_post.py                      # + published_posts relationship
│       └── __init__.py                          # + register new models/enums
```

---

## 4. Database Schema

### 4.1 New Enums

```python
class PublishStatus(str, Enum):
    PENDING = "pending"          # Scheduled, waiting for job to fire
    PROCESSING = "processing"    # TikTok API call in progress
    PUBLISHED = "published"      # Successfully published
    FAILED = "failed"            # All retries exhausted
    CANCELLED = "cancelled"      # User cancelled scheduled publish

class PublishMode(str, Enum):
    AUTO = "auto"                # Golden hour scheduling
    MANUAL = "manual"            # User-triggered (immediate or custom time)
```

### 4.2 Table: `user_platform_tokens`

Stores encrypted TikTok OAuth tokens (single-user dev mode).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | |
| `platform` | String(20) | Default "tiktok" |
| `access_token_encrypted` | Text | Fernet-encrypted access token |
| `refresh_token_encrypted` | Text | Fernet-encrypted refresh token |
| `token_expires_at` | DateTime(tz) | When access token expires |
| `tiktok_open_id` | String | TikTok user identifier |
| `scopes` | JSON | Granted OAuth scopes |
| `creator_info_cache` | JSON | Cached TikTok creator capabilities |
| `is_active` | Boolean | False if refresh fails (user must re-authorize) |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |

### 4.3 Table: `published_posts`

Tracks every publish attempt (success, failure, scheduled, cancelled).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | |
| `content_post_id` | UUID FK→content_posts | Which post was published |
| `platform` | String(20) | Default "tiktok" |
| `publish_mode` | PublishMode enum | "auto" or "manual" |
| `status` | PublishStatus enum | Current status |
| `privacy_level` | String(50) | TikTok privacy level |
| `tiktok_publish_id` | String | TikTok's publish_id from /content/init |
| `platform_post_id` | String | TikTok's publicly_available_post_id |
| `golden_hour_slot` | String(11) | e.g. "19:00-19:30" |
| `scheduled_at` | DateTime(tz) | When the job is set to fire |
| `published_at` | DateTime(tz) | Actual publish timestamp |
| `scheduler_job_id` | String | APScheduler job reference |
| `assembled_caption` | Text | Full caption sent to TikTok |
| `error_message` | Text | Last error message |
| `retry_count` | Integer | Number of retry attempts used |
| `api_response` | JSON | Raw TikTok API response for debugging |
| `created_at` | DateTime(tz) | |
| `updated_at` | DateTime(tz) | |

**Indexes:** `content_post_id`, `status`

### 4.4 Table: `engagement_time_slots`

Stores pre-computed engagement scores per 30-minute time slot for golden hour calculation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | |
| `platform` | String(20) | Default "tiktok" |
| `time_slot` | String(11) | e.g. "07:00-07:30" |
| `slot_index` | Integer | 0-47 (48 slots per day) |
| `avg_views` | Float | Average views for posts in this slot |
| `avg_likes` | Float | Average likes |
| `avg_comments` | Float | Average comments |
| `avg_shares` | Float | Average shares |
| `weighted_score` | Float | Pre-computed engagement score |
| `sample_count` | Integer | Number of posts analyzed |
| `updated_at` | DateTime(tz) | |

**Unique constraint:** `(platform, slot_index)`

### 4.5 Relationship Added

`ContentPost.published_posts` → one-to-many → `PublishedPost` (cascade delete)

---

## 5. Configuration

New settings added to `app/config.py` (loaded from `.env`):

```env
# ─── TikTok API ───
TIKTOK_CLIENT_KEY=                          # From TikTok Developer Platform
TIKTOK_CLIENT_SECRET=                       # From TikTok Developer Platform
TIKTOK_REDIRECT_URI=http://localhost:8000/api/v1/auth/tiktok/callback
TIKTOK_DEFAULT_PRIVACY=SELF_ONLY            # SELF_ONLY until app passes TikTok review

# ─── Token Encryption ───
TOKEN_ENCRYPTION_KEY=                       # Fernet key (see generation command below)

# ─── Publishing ───
STORAGE_PUBLIC_BASE_URL=http://localhost:8000/static   # ngrok HTTPS URL for TikTok
PUBLISH_MAX_RETRIES=3                       # Max retry attempts per publish
PUBLISH_POLL_INTERVAL=10                    # Seconds between status polls
PUBLISH_POLL_MAX_ATTEMPTS=30                # Max poll attempts (10s × 30 = 5min timeout)

# ─── Golden Hour ───
DEFAULT_GOLDEN_HOURS=07:00,12:00,19:00      # UTC+7 fallback for new users
TIMEZONE=Asia/Ho_Chi_Minh
```

### Generate a Fernet Encryption Key

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the output into your `.env` as `TOKEN_ENCRYPTION_KEY`.

---

## 6. LangGraph Pipeline

### 6.1 State Definition (`PublishPostState`)

```python
class PublishPostState(TypedDict):
    # Input
    content_post_id: str            # UUID of ContentPost to publish
    publish_mode: str               # "auto" | "manual"
    scheduled_time_override: str    # ISO timestamp or "" for auto
    privacy_level: str              # TikTok privacy level

    # Resolved during execution
    published_post_id: str          # DB record created at start
    access_token: str               # Decrypted TikTok token
    tiktok_open_id: str
    image_public_url: str           # Public URL for TikTok PULL_FROM_URL
    assembled_caption: str          # Full text: caption + hashtags + CTA

    # Golden hour
    golden_hour_result: dict        # GoldenHourResult serialized

    # TikTok API results
    creator_info: dict
    tiktok_publish_id: str          # From /content/init response
    platform_post_id: str           # From poll status (after TikTok moderation)

    # Final
    publish_status: str             # "published" | "failed" | "scheduled"
    error: str
```

### 6.2 Node Descriptions

| Node | File | Purpose |
|------|------|---------|
| `resolve_and_validate` | `graph.py` | Load ContentPost, validate status=approved, create PublishedPost row, resolve image public URL, assemble caption, validate TikTok token |
| `golden_hour` | `golden_hour.py` | Query engagement_time_slots, compute weighted scores, pick next optimal slot. Falls back to defaults if <10 samples. |
| `scheduler` | `scheduler_node.py` | If target time within 2min → set "publish_now". Else → create APScheduler delayed job, set "scheduled". |
| `publish` | `publish_node.py` | Call TikTok Creator Info API → init photo post → poll status. Retry up to 3x with 30s/60s/120s backoff. |

### 6.3 Conditional Routing

```
After scheduler node:
  - publish_status == "publish_now" → go to "publish" node
  - publish_status == "scheduled"   → go to END (APScheduler fires later)
```

### 6.4 Entry Point

```python
from app.agents.publish_post.runner import run_publish_pipeline

result = await run_publish_pipeline(
    content_post_id="<uuid>",
    mode="auto",                        # or "manual"
    scheduled_time=None,                # datetime for manual scheduled
    privacy_level="SELF_ONLY",          # or "PUBLIC_TO_EVERYONE" after review
)
```

**Returns:**
```python
{
    "content_post_id": "uuid",
    "published_post_id": "uuid",
    "publish_status": "published" | "failed" | "scheduled",
    "tiktok_publish_id": "string",
    "platform_post_id": "string",
    "error": ""
}
```

---

## 7. TikTok API Integration

### 7.1 API Flow (3 Steps)

```
Step 1: POST /v2/post/publish/creator_info/query/
        → Get privacy_level_options, max_video_post_per_day
        → Validate requested privacy level is allowed

Step 2: POST /v2/post/publish/content/init/
        → Send: photo_images (PULL_FROM_URL), title, description, privacy_level
        → Receive: publish_id
        → post_mode: DIRECT_POST, media_type: PHOTO

Step 3: POST /v2/post/publish/status/fetch/
        → Poll every 10s, max 30 attempts (5 min timeout)
        → Terminal states: PUBLISH_COMPLETE | FAILED
```

### 7.2 TikTok Client (`app/clients/tiktok_client.py`)

| Method | Description |
|--------|-------------|
| `query_creator_info(access_token)` | Returns `CreatorInfo` dataclass with capabilities |
| `init_photo_post(access_token, photo_urls, title, description, privacy_level)` | Returns `publish_id` string |
| `poll_publish_status(access_token, publish_id)` | Returns `PublishResult` dataclass |
| `is_retryable_error(fail_reason)` | Returns bool — checks against non-retryable error set |

### 7.3 Retry Logic

- **Max 3 retries** with exponential backoff: 30s → 60s → 120s
- **Retryable:** `server_error`, `timeout`, network failures, `poll_timeout`
- **Non-retryable:** `spam_risk_too_many_posts`, `scope_not_authorized`, `picture_size_check_failed`, `token_not_authorized`, `invalid_publish_id`
- Token refresh does NOT count as a retry attempt

### 7.4 Token Management (`app/agents/publish_post/token_manager.py`)

| Function | Description |
|----------|-------------|
| `encrypt_token(plaintext) → str` | Fernet encrypt |
| `decrypt_token(ciphertext) → str` | Fernet decrypt |
| `get_valid_token(db) → (access_token, open_id)` | Auto-refreshes if expiring within 5 minutes |
| `refresh_tiktok_token(refresh_token) → dict` | POST to TikTok OAuth refresh endpoint |
| `save_tokens(db, access, refresh, expires_in, open_id)` | Encrypt and upsert into DB |

### 7.5 Rate Limiting

TikTok limit: **6 requests per minute** per `access_token`.
Added to `app/core/rate_limiter.py` as `"tiktok": (6, 60)`.

---

## 8. API Endpoints Reference

### 8.1 TikTok OAuth

#### `GET /api/v1/auth/tiktok/login`

Redirects the user to TikTok's OAuth authorization page.

**Response:** `302 Redirect` to `https://www.tiktok.com/v2/auth/authorize/...`

**Prerequisites:** `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` must be set in `.env`.

---

#### `GET /api/v1/auth/tiktok/callback?code=...&state=...`

TikTok redirects here after user grants permission. Exchanges the authorization code for tokens, encrypts them, and stores in the database.

**Response:**
```json
{
    "message": "TikTok authorization successful. Tokens saved.",
    "open_id": "user_tiktok_id",
    "scopes": "video.publish"
}
```

---

### 8.2 Publishing

#### `POST /api/v1/publish/{post_id}` — Publish Immediately

**Request Body:**
```json
{
    "privacy_level": "SELF_ONLY"
}
```

**Response (202):**
```json
{
    "published_post_id": "pending",
    "mode": "manual",
    "status": "processing",
    "scheduled_at": null,
    "message": "Post submitted for immediate publishing. Check status via GET /publish/history."
}
```

---

#### `POST /api/v1/publish/{post_id}/schedule` — Schedule at Custom Time

**Request Body:**
```json
{
    "scheduled_at": "2026-04-11T19:00:00+07:00",
    "privacy_level": "SELF_ONLY"
}
```

**Response (202):**
```json
{
    "published_post_id": "pending",
    "mode": "manual",
    "status": "scheduled",
    "scheduled_at": "2026-04-11T12:00:00Z",
    "message": "Post scheduled for 2026-04-11T12:00:00+00:00."
}
```

---

#### `POST /api/v1/publish/{post_id}/auto` — Auto-Publish via Golden Hour

**Request Body:**
```json
{
    "privacy_level": "SELF_ONLY"
}
```

**Response (202):**
```json
{
    "published_post_id": "pending",
    "mode": "auto",
    "status": "processing",
    "scheduled_at": null,
    "message": "Post submitted for golden hour scheduling."
}
```

---

#### `DELETE /api/v1/publish/{post_id}/schedule` — Cancel Scheduled Publish

**Response (200):**
```json
{
    "message": "Scheduled publish cancelled",
    "post_id": "uuid"
}
```

---

#### `GET /api/v1/publish/history` — Publish History

**Query Params:** `status` (optional), `page` (default 1), `page_size` (default 20, max 100)

**Response:**
```json
{
    "items": [
        {
            "id": "uuid",
            "content_post_id": "uuid",
            "platform": "tiktok",
            "status": "published",
            "publish_mode": "auto",
            "golden_hour_slot": "19:00-19:30",
            "scheduled_at": "2026-04-10T12:00:00Z",
            "published_at": "2026-04-10T12:00:15Z",
            "error_message": null,
            "retry_count": 0,
            "created_at": "2026-04-10T10:00:00Z"
        }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
}
```

---

#### `GET /api/v1/publish/golden-hours` — Golden Hour Analysis

**Response:**
```json
{
    "top_slots": [
        {"slot_time": "19:00-19:30", "slot_index": 38, "weighted_score": 85.2, "sample_count": 15},
        {"slot_time": "12:00-12:30", "slot_index": 24, "weighted_score": 72.1, "sample_count": 12},
        {"slot_time": "07:00-07:30", "slot_index": 14, "weighted_score": 65.0, "sample_count": 10}
    ],
    "selected_slot": {"slot_time": "19:00-19:30", "slot_index": 38, "weighted_score": 85.2, "sample_count": 15},
    "scheduled_at": "2026-04-10T19:00:00+07:00",
    "is_fallback": false
}
```

When `is_fallback: true`, the system is using default slots (07:00, 12:00, 19:00 UTC+7) because there are fewer than 10 published posts in the engagement data.

---

#### `GET /api/v1/publish/{published_post_id}/status` — Check Publish Status

**Response:**
```json
{
    "id": "uuid",
    "content_post_id": "uuid",
    "platform": "tiktok",
    "status": "published",
    "publish_mode": "auto",
    "privacy_level": "SELF_ONLY",
    "tiktok_publish_id": "tiktok_pub_123",
    "platform_post_id": "tiktok_post_456",
    "golden_hour_slot": "19:00-19:30",
    "scheduled_at": "2026-04-10T12:00:00Z",
    "published_at": "2026-04-10T12:00:15Z",
    "error_message": null,
    "retry_count": 0,
    "created_at": "2026-04-10T10:00:00Z"
}
```

---

## 9. Golden Hour Algorithm

### How It Works

1. Divide 24 hours into **48 time slots** of 30 minutes each (index 0 = 00:00-00:30, index 47 = 23:30-00:00)
2. For each slot, compute a weighted engagement score:

```
score = (0.2 × avg_views) + (0.3 × avg_likes) + (0.3 × avg_comments) + (0.2 × avg_shares)
```

3. Sort all 48 slots by score descending, pick **top 3**
4. From the top 3, find the **next upcoming slot** from `now()` in the configured timezone
5. If all 3 slots have passed today, schedule for the first slot **tomorrow**

### Fallback Behavior

When fewer than **10 published posts** exist in `engagement_time_slots`, the algorithm falls back to platform defaults:

- **07:00 UTC+7** (morning commute)
- **12:00 UTC+7** (lunch break)
- **19:00 UTC+7** (evening leisure)

These are optimized for TikTok tech content consumption in the Vietnam timezone.

### Weight Rationale

| Metric | Weight | Why |
|--------|--------|-----|
| Views | 0.2 | Passive signal — TikTok shows content widely |
| Likes | 0.3 | Active engagement, signals content quality |
| Comments | 0.3 | Highest-value signal — TikTok algorithm prioritizes comment engagement |
| Shares | 0.2 | Viral distribution signal |

---

## 10. Storage & Static Files

### Development Mode

In development (`APP_ENV=development`), the ai-service directory is mounted as a static file server:

```
FastAPI app.mount("/static", StaticFiles(directory="ai-service/"), name="static")
```

This means a file at `ai-service/posts/{scan_run_id}/image.png` is accessible at:
```
http://localhost:8000/static/posts/{scan_run_id}/image.png
```

### Public URL Resolution

The `StorageBackend.get_public_url(key)` method resolves storage keys to publicly accessible URLs:

| Environment | Backend | URL Pattern |
|-------------|---------|-------------|
| Development | `LocalStorage` | `{STORAGE_PUBLIC_BASE_URL}/{key}` → `https://ngrok-domain.ngrok-free.app/static/posts/...` |
| Production | `S3Storage` | Presigned S3 URL (1-hour expiry) |

### ngrok for TikTok PULL_FROM_URL

TikTok's `PULL_FROM_URL` requires a **publicly accessible HTTPS URL** to download images from. In development, use ngrok:

```bash
# Start ngrok tunnel to your FastAPI server
ngrok http 8000 --domain=your-stable-subdomain.ngrok-free.app

# Set in .env
STORAGE_PUBLIC_BASE_URL=https://your-stable-subdomain.ngrok-free.app/static
```

**Important:** Register the ngrok domain as a verified URL property on the [TikTok Developer Platform](https://developers.tiktok.com).

---

## 11. Setup & Run Instructions

### 11.1 Prerequisites

- Python 3.11+
- PostgreSQL 16 running (via Docker or local)
- Redis 7 running (via Docker or local)
- TikTok Developer account with an app created (for OAuth)
- ngrok installed (for TikTok image pulling in dev)

### 11.2 Step-by-Step Setup

```bash
# 1. Start infrastructure
cd /path/to/marketing-content/ai-service
docker-compose up -d postgres redis

# 2. Install dependencies (includes new cryptography package)
pip install -e ".[dev]"

# 3. Generate a Fernet encryption key
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Copy the output

# 4. Configure .env — add these to your existing .env file:
cat >> .env << 'EOF'

# TikTok API
TIKTOK_CLIENT_KEY=your_client_key_here
TIKTOK_CLIENT_SECRET=your_client_secret_here
TIKTOK_REDIRECT_URI=http://localhost:8000/api/v1/auth/tiktok/callback
TIKTOK_DEFAULT_PRIVACY=SELF_ONLY

# Token Encryption
TOKEN_ENCRYPTION_KEY=your_generated_fernet_key_here

# Publishing
STORAGE_PUBLIC_BASE_URL=http://localhost:8000/static
PUBLISH_MAX_RETRIES=3
PUBLISH_POLL_INTERVAL=10
PUBLISH_POLL_MAX_ATTEMPTS=30

# Golden Hour
DEFAULT_GOLDEN_HOURS=07:00,12:00,19:00
TIMEZONE=Asia/Ho_Chi_Minh
EOF

# 5. Run database migration
alembic upgrade head

# 6. Start the server
uvicorn app.main:app --reload --port 8000

# 7. (Optional) Start ngrok for TikTok API testing
ngrok http 8000 --domain=your-subdomain.ngrok-free.app
# Then update STORAGE_PUBLIC_BASE_URL in .env with the ngrok URL
```

### 11.3 Verify Installation

```bash
# Check health
curl http://localhost:8000/health

# Check API docs
open http://localhost:8000/docs

# Check golden hours endpoint (should return fallback slots)
curl http://localhost:8000/api/v1/publish/golden-hours

# Check publish history (should return empty list)
curl http://localhost:8000/api/v1/publish/history
```

---

## 12. Testing Guide

### 12.1 Verify Database Migration

```bash
cd ai-service

# Check migration status
alembic current
# Should show: e1f2a3b4c5d6 (head)

# Verify tables exist
python3 -c "
from sqlalchemy import create_engine, inspect
from app.config import get_settings
engine = create_engine(get_settings().sync_database_url)
tables = inspect(engine).get_table_names()
for t in ['user_platform_tokens', 'published_posts', 'engagement_time_slots']:
    print(f'{t}: {\"EXISTS\" if t in tables else \"MISSING\"}')"
```

### 12.2 Test Golden Hours API (No TikTok Required)

```bash
# Should return fallback slots (is_fallback: true) since no engagement data exists
curl -s http://localhost:8000/api/v1/publish/golden-hours | python3 -m json.tool
```

**Expected response:**
```json
{
    "top_slots": [
        {"slot_time": "07:00-07:30", "slot_index": 14, "weighted_score": 0.0, "sample_count": 0},
        {"slot_time": "12:00-12:30", "slot_index": 24, "weighted_score": 0.0, "sample_count": 0},
        {"slot_time": "19:00-19:30", "slot_index": 38, "weighted_score": 0.0, "sample_count": 0}
    ],
    "selected_slot": {...},
    "scheduled_at": "...",
    "is_fallback": true
}
```

### 12.3 Test Caption Assembly (Unit Test, No Dependencies)

```bash
python3 -c "
from app.agents.publish_post.caption_assembler import assemble_caption

# Test basic assembly
result = assemble_caption(
    caption='AI is transforming how we build software. Here are 5 key trends.',
    hashtags=['AI', 'TechTrends', 'Software', 'Coding'],
    cta='Follow for daily tech insights!'
)
print(result)
print(f'\nLength: {len(result)} / 2200 chars')
"
```

### 12.4 Test Token Encryption (No TikTok Required)

```bash
# Ensure TOKEN_ENCRYPTION_KEY is set in .env
python3 -c "
from app.agents.publish_post.token_manager import encrypt_token, decrypt_token

original = 'test_access_token_12345'
encrypted = encrypt_token(original)
decrypted = decrypt_token(encrypted)
print(f'Original:  {original}')
print(f'Encrypted: {encrypted[:50]}...')
print(f'Decrypted: {decrypted}')
print(f'Match: {original == decrypted}')
"
```

### 12.5 Test TikTok OAuth Flow (Requires TikTok App)

```bash
# 1. Open in browser — redirects to TikTok login
open http://localhost:8000/api/v1/auth/tiktok/login

# 2. After granting permission, TikTok redirects to callback
#    Tokens are automatically encrypted and stored

# 3. Verify token was saved
python3 -c "
import asyncio
from sqlalchemy import select
from app.db.session import async_session_factory
from app.db.models.user_platform_token import UserPlatformToken

async def check():
    async with async_session_factory() as db:
        result = await db.execute(select(UserPlatformToken))
        token = result.scalar_one_or_none()
        if token:
            print(f'Platform: {token.platform}')
            print(f'Open ID: {token.tiktok_open_id}')
            print(f'Expires: {token.token_expires_at}')
            print(f'Active: {token.is_active}')
        else:
            print('No token found')
asyncio.run(check())
"
```

### 12.6 Test Manual Publish (Requires Token + Approved Post)

```bash
# 1. First, run a scan with post generation to create content
curl -X POST http://localhost:8000/api/v1/scan \
  -H "Content-Type: application/json" \
  -d '{
    "platforms": ["hackernews"],
    "options": {
      "max_items_per_platform": 10,
      "include_comments": false,
      "generate_posts": true,
      "post_gen_options": {"num_posts": 1}
    }
  }'

# 2. Wait for scan to complete, then list posts
curl -s http://localhost:8000/api/v1/posts | python3 -m json.tool

# 3. Approve a post (replace POST_ID with actual UUID)
curl -X PATCH http://localhost:8000/api/v1/posts/POST_ID/status \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'

# 4. Publish immediately
curl -X POST http://localhost:8000/api/v1/publish/POST_ID \
  -H "Content-Type: application/json" \
  -d '{"privacy_level": "SELF_ONLY"}'

# 5. Check publish history
curl -s http://localhost:8000/api/v1/publish/history | python3 -m json.tool
```

### 12.7 Test Scheduled Publish

```bash
# Schedule for 30 minutes from now (replace POST_ID and adjust time)
curl -X POST http://localhost:8000/api/v1/publish/POST_ID/schedule \
  -H "Content-Type: application/json" \
  -d '{"scheduled_at": "2026-04-10T20:00:00+07:00", "privacy_level": "SELF_ONLY"}'

# Check it's scheduled
curl -s http://localhost:8000/api/v1/publish/history?status=pending | python3 -m json.tool

# Cancel it
curl -X DELETE http://localhost:8000/api/v1/publish/POST_ID/schedule
```

### 12.8 Test Auto-Publish (Golden Hour)

```bash
# Auto-publish — the system calculates the optimal time
curl -X POST http://localhost:8000/api/v1/publish/POST_ID/auto \
  -H "Content-Type: application/json" \
  -d '{"privacy_level": "SELF_ONLY"}'
```

### 12.9 Validation Error Tests

```bash
# Try to publish a draft post (should return 400)
curl -X POST http://localhost:8000/api/v1/publish/DRAFT_POST_ID \
  -H "Content-Type: application/json" \
  -d '{"privacy_level": "SELF_ONLY"}'
# Expected: 400 "Only 'approved' posts can be published"

# Try to publish a non-existent post (should return 404)
curl -X POST http://localhost:8000/api/v1/publish/00000000-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"privacy_level": "SELF_ONLY"}'
# Expected: 404 "Post not found"

# Schedule in the past (should return 400)
curl -X POST http://localhost:8000/api/v1/publish/POST_ID/schedule \
  -H "Content-Type: application/json" \
  -d '{"scheduled_at": "2020-01-01T00:00:00Z"}'
# Expected: 400 "scheduled_at must be in the future"
```

---

## 13. Data Flow Diagrams

### Flow A: Auto Publish (Full Pipeline)

```
User: POST /api/v1/publish/{post_id}/auto
  │
  ▼
FastAPI → BackgroundTask: run_publish_pipeline(mode="auto")
  │
  ▼
[resolve_and_validate]
  ├── Load ContentPost from DB → validate status = "approved"
  ├── Create PublishedPost row (status = "processing")
  ├── Resolve image URL: storage.get_public_url(post.image_path)
  ├── Assemble caption: caption + hashtags + CTA
  └── Get/refresh TikTok access token
  │
  ▼
[golden_hour]
  ├── Query engagement_time_slots (platform = "tiktok")
  ├── If < 10 samples → fallback to 07:00, 12:00, 19:00 UTC+7
  ├── Else → compute weighted scores, pick top 3
  └── Find next upcoming slot from now
  │
  ▼
[scheduler]
  ├── If target time within 2 min → publish_status = "publish_now"
  └── Else → create APScheduler delayed job → publish_status = "scheduled"
  │
  ├─── (publish_now) ──────────────────────┐
  │                                        ▼
  │                                  [publish]
  │                                    ├── Creator Info API → validate permissions
  │                                    ├── Init Photo Post API → get publish_id
  │                                    ├── Poll Status (10s × 30 attempts)
  │                                    │   ├── PUBLISH_COMPLETE → success
  │                                    │   └── FAILED → retry (max 3, backoff 30/60/120s)
  │                                    ├── On success: status → "published"
  │                                    └── On failure: status → "failed"
  │                                        │
  └─── (scheduled) ───────┐                ▼
                           │              END
                           ▼
                     APScheduler fires at golden_hour
                           │
                           ▼
                     run_publish_pipeline_job()
                     (re-enters the graph, publishes immediately)
```

### Flow B: Manual Immediate Publish

```
User: POST /api/v1/publish/{post_id}  {"privacy_level": "SELF_ONLY"}
  │
  ▼
FastAPI → BackgroundTask: run_publish_pipeline(mode="manual", scheduled_time=None)
  │
  ▼
[resolve_and_validate] → [golden_hour] → [scheduler]
  │                                          │
  │  (scheduled_time_override is empty       │
  │   AND golden_hour picks next slot        │
  │   which may be in the future)            │
  │                                          │
  │  If mode="manual" AND no scheduled_time: │
  │  golden_hour still runs but scheduler    │
  │  sees the result and routes accordingly  │
  ▼                                          ▼
[publish] → TikTok API → END
```

### Flow C: Manual Scheduled Publish

```
User: POST /api/v1/publish/{post_id}/schedule  {"scheduled_at": "2026-04-11T19:00:00+07:00"}
  │
  ▼
FastAPI → BackgroundTask: run_publish_pipeline(mode="manual", scheduled_time=<datetime>)
  │
  ▼
[resolve_and_validate] → [golden_hour] → [scheduler]
                                              │
                            scheduled_time_override is set
                            target_time = 2026-04-11T19:00 (future)
                                              │
                                              ▼
                                    APScheduler job created
                                    PublishedPost.status = "pending"
                                              │
                                              ▼
                                            END
                                              │
                         ... (time passes) ...│
                                              ▼
                         APScheduler fires → run_publish_pipeline_job()
                                              │
                                              ▼
                                    [full graph re-run]
                                    scheduler sees time is now
                                    → routes to "publish_now"
                                              │
                                              ▼
                                    [publish] → TikTok API → END
```

---

## 14. Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Token expired mid-publish** | Auto-refreshes via `get_valid_token()`. Does NOT count as a retry. |
| **No engagement data (new user)** | Falls back to default golden hours: 07:00, 12:00, 19:00 UTC+7. |
| **Post already published** | Returns `409 Conflict` (checks `published_posts` for existing `PUBLISHED` record). |
| **Post status is "draft"** | Returns `400 Bad Request`. Only `approved` posts can be published. |
| **All 3 retries exhausted** | Sets `published_posts.status = "failed"`, stores error message. |
| **TikTok app unaudited** | All posts restricted to `SELF_ONLY` privacy. Expected during development. |
| **ngrok tunnel is down** | TikTok returns FAILED with `picture_download_failed`. Non-retryable until ngrok is back. |
| **Concurrent publish for same post** | First succeeds; second gets `409 Conflict` (duplicate check in `resolve_and_validate`). |
| **APScheduler job fires for deleted post** | `resolve_and_validate` raises ValueError, logged and skipped. |
| **Token refresh fails (revoked access)** | Token marked `is_active=False`. User must re-authorize via `/auth/tiktok/login`. |
| **Schedule time in the past** | API returns `400 Bad Request`. |
| **Cancel non-existent schedule** | Returns `404`. |

---

## 15. Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql+asyncpg://...` | PostgreSQL connection |
| `REDIS_URL` | Yes | `redis://localhost:6379/0` | Redis connection |
| `OPENAI_API_KEY` | Yes | | GPT-4o API key |
| `TIKTOK_CLIENT_KEY` | For publish | | TikTok app client key |
| `TIKTOK_CLIENT_SECRET` | For publish | | TikTok app client secret |
| `TIKTOK_REDIRECT_URI` | For publish | `http://localhost:8000/api/v1/auth/tiktok/callback` | OAuth callback URL |
| `TIKTOK_DEFAULT_PRIVACY` | No | `SELF_ONLY` | Default privacy for unaudited apps |
| `TOKEN_ENCRYPTION_KEY` | For publish | | Fernet key for token encryption |
| `STORAGE_PUBLIC_BASE_URL` | For publish | `http://localhost:8000/static` | Public URL base (ngrok in dev) |
| `PUBLISH_MAX_RETRIES` | No | `3` | Max publish retry attempts |
| `PUBLISH_POLL_INTERVAL` | No | `10` | Seconds between TikTok status polls |
| `PUBLISH_POLL_MAX_ATTEMPTS` | No | `30` | Max poll attempts (10×30 = 5min) |
| `DEFAULT_GOLDEN_HOURS` | No | `07:00,12:00,19:00` | Fallback posting times (UTC+7) |
| `TIMEZONE` | No | `Asia/Ho_Chi_Minh` | Timezone for golden hour calculation |
| `APP_ENV` | No | `development` | `development` or `production` |
| `S3_BUCKET` | For prod | | S3 bucket name |
| `S3_REGION` | For prod | `ap-southeast-1` | S3 region |
| `S3_PREFIX` | For prod | `trending-scanner` | S3 key prefix |
