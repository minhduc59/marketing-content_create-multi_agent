# Database Architecture

This document covers the PostgreSQL database design: schema layout, role-based access control, table responsibilities, and how data flows through the system.

---

## 1. High-Level Architecture

The system uses a **single PostgreSQL 16 database** (`trending_scanner`) split into two logical schemas, each owned by a dedicated service role. This enforces a strict data ownership boundary at the database layer — services cannot accidentally write to data they don't own.

```
trending_scanner (database)
├── ai   schema  ─── owned by ai_svc      (Python ai-service / Alembic)
└── app  schema  ─── owned by backend_svc (NestJS backend / Prisma)
```

### Why two schemas instead of two databases?

A single database allows **cross-schema foreign key references via views or joins** without a network hop, simplifies backup/restore, and keeps the development environment trivial to spin up (`docker compose up -d postgres`). The privilege model (covered in section 3) enforces the same isolation guarantees you'd get from two separate databases, without the operational overhead.

---

## 2. Schema Ownership and Tooling

| Schema | Owner role | Migration tool | Tables managed |
|--------|-----------|----------------|---------------|
| `ai` | `ai_svc` | **Alembic** (`ai-service/alembic/`) | All AI pipeline data — scans, trends, content, publish records, video pipeline |
| `app` | `backend_svc` | **Prisma** (`backend/prisma/`) | All user-facing data — users, auth, sessions, audit logs |

**Important:** Alembic migrations run as the `scanner` **superuser**, not as `ai_svc`. This means tables in the `ai` schema are technically owned by `scanner` at the PostgreSQL level, even though `ai_svc` has full logical ownership. The `init-db.sql` bootstrap accounts for this with explicit `GRANT` statements and `DEFAULT PRIVILEGES` blocks (see section 3).

**Never run `prisma migrate` against `ai.*` tables** — Prisma only manages the `app` schema. Never run Alembic against `app.*` tables.

---

## 3. Roles and Privileges

Three PostgreSQL roles are active in the system:

### 3.1 `scanner` (superuser)

- The original database superuser, kept as the Alembic migration runner.
- Has `ALL` on both schemas.
- **Not used by any application service at runtime.** Only used by Alembic (`DATABASE_URL` in `ai-service/.env` points to this role) and for administrative one-off queries.
- In production you would rotate this to a dedicated migration role; for the thesis demo it stays simple.

### 3.2 `ai_svc` — AI Service role

- Owns the `ai` schema logically.
- Has `ALL PRIVILEGES` on all `ai.*` tables and sequences — can `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, and `DROP` within its schema.
- Has `USAGE` + `SELECT` on the `app` schema — can read user records and auth data for ownership checks, but **cannot write to `app.*`**.
- Used by the Python FastAPI service at runtime.

### 3.3 `backend_svc` — NestJS Backend role

- Owns the `app` schema logically.
- Has `ALL PRIVILEGES` on all `app.*` tables and sequences.
- Has `USAGE` + `SELECT` on all `ai.*` tables — can read all AI pipeline data.
- Has **narrow write access** to specific `ai.*` tables (see below). All other `ai.*` tables are read-only for this role.

#### Narrow write surface on `ai` schema for `backend_svc`

The backend writes to `ai.*` tables only for user-facing interactions that cannot reasonably be delegated to the ai-service without adding a synchronous HTTP round-trip.

| Table | Permissions | Reason |
|-------|------------|--------|
| `ai.video_tasks` | `INSERT, UPDATE` | User creates a clip task; backend polls and updates progress |
| `ai.video_clips` | `INSERT, UPDATE` | User approves/rejects a clip (review endpoint) |
| `ai.content_posts` | `INSERT, UPDATE` | Auto-creates a `ContentPost` on clip approval; review queue updates status |
| `ai.brand_fonts` | `INSERT` | User uploads a custom font |
| `ai.caption_templates` | `INSERT` | User saves a caption style preset |

Everything else in `ai.*` — enrichment fields (`llm_score`, `storage_url`, `transcript_segment`), scan lifecycle, engagement slots, published posts — is written exclusively by `ai_svc`.

### 3.4 Privilege Summary Matrix

```
Table / Object             ai_svc          backend_svc      scanner
─────────────────────────  ──────────────  ───────────────  ──────────────
ai.* (all tables)          ALL             SELECT (default) ALL
ai.video_tasks             ALL             INSERT, UPDATE   ALL
ai.video_clips             ALL             INSERT, UPDATE   ALL
ai.content_posts           ALL             INSERT, UPDATE   ALL
ai.brand_fonts             ALL             INSERT           ALL
ai.caption_templates       ALL             INSERT           ALL
─────────────────────────  ──────────────  ───────────────  ──────────────
app.* (all tables)         SELECT          ALL              ALL
```

### 3.5 Default Privileges for Future Tables

Because Alembic creates new tables as `scanner` (not `ai_svc`), PostgreSQL's per-table `GRANT` does not automatically apply to newly created tables. The bootstrap file sets `DEFAULT PRIVILEGES` so any table Alembic creates in the future inherits the correct grants:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE scanner IN SCHEMA ai
  GRANT ALL ON TABLES TO ai_svc;

ALTER DEFAULT PRIVILEGES FOR ROLE scanner IN SCHEMA ai
  GRANT SELECT ON TABLES TO backend_svc;
```

This means new migrations only need to add explicit `GRANT` statements for tables that require **write** access from `backend_svc` — read access is automatic.

---

## 4. Table Reference

### 4.1 `app` schema — NestJS / Prisma

These tables store the user identity layer. The NestJS backend is the sole writer.

| Table | Purpose |
|-------|---------|
| `users` | Core user record — email, password hash, display name, TikTok linkage, Zernio profile IDs |
| `auth_identities` | Provider identities — maps `(provider, providerUserId)` to a `user_id`. Supports `local` (email/password) and `google` OAuth |
| `refresh_tokens` | JWT refresh token tracking — stored as `token_hash`, with expiry and optional revocation timestamp |
| `post_review_events` | Immutable audit trail for every approve/reject action a user takes on a `ContentPost` |
| `audit_logs` | General action log — `(userId, action, resource, resourceId)` |
| `zernio_webhook_events` | Idempotency log for inbound Zernio webhooks — prevents double-processing on retries |

### 4.2 `ai` schema — Python / Alembic

These tables store the full AI content pipeline from crawl to publish. The Python ai-service is the primary writer; the NestJS backend has narrow write access where noted.

#### Scan Pipeline

| Table | Purpose |
|-------|---------|
| `scan_runs` | Top-level scan lifecycle record. Status: `pending → running → completed / partial / failed`. One scan produces many trend items. |
| `trend_items` | A single HackerNews story after AI analysis — category, sentiment, lifecycle, relevance/quality scores, content angles. Read-only for backend. |
| `trend_comments` | Raw HN comments attached to a trend item. Read-only for backend. |
| `scan_schedules` | Cron expressions for recurring scans. Managed by the ai-service scheduler. |

#### Content Pipeline

| Table | Purpose |
|-------|---------|
| `content_posts` | An AI-generated TikTok post draft — caption, hashtags, CTA, image prompt, format, review score. Status: `draft → approved / needs_revision / flagged_for_review → published`. Backend can INSERT (video flow) and UPDATE (status). |
| `published_posts` | Publish tracking record — TikTok publish ID, golden hour slot, retry count, final status. Written by the ai-service publisher. |
| `engagement_time_slots` | Aggregated golden-hour data per platform — used by the scheduler to pick optimal publish times. |
| `user_platform_tokens` | Encrypted OAuth tokens (Fernet) per user per platform (TikTok). Written by the ai-service OAuth callback. |

#### Video Clipper Pipeline

| Table | Purpose |
|-------|---------|
| `brand_fonts` | A user's custom font asset — storage URL, public ID, optional default flag. Backend-insertable. |
| `caption_templates` | A named caption style preset — font size, color, outline, vertical position. Backend-insertable. |
| `video_tasks` | A video processing job — source type/ref, font + caption template references, status/progress, optional scan run linkage. Backend-insertable/updatable. |
| `video_clips` | An individual clip extracted from a video task — time range, scores (LLM, hook, engagement), transcript segment, review status. Backend-insertable/updatable during review. |

---

## 5. Entity Relationship Overview

```
app.users
  │  (user_id FK — logical, not enforced by PG FK constraint across schemas)
  │
  ├─── ai.scan_runs (triggered_by)
  │       └─── ai.trend_items (scan_run_id)
  │               └─── ai.trend_comments (trend_item_id)
  │       └─── ai.content_posts (scan_run_id)
  │               └─── ai.published_posts (content_post_id) ──CASCADE DELETE
  │               └─── ai.video_clips (content_post_id) ──1:1 unique
  │       └─── ai.video_tasks (scan_run_id, optional)
  │
  ├─── ai.video_tasks (user_id)
  │       ├─── ai.brand_fonts (font_id, optional)
  │       ├─── ai.caption_templates (caption_template_id, optional)
  │       └─── ai.video_clips (task_id) ──CASCADE DELETE
  │               └─── ai.published_posts (published_post_id, optional)
  │
  ├─── ai.brand_fonts (user_id, optional)
  ├─── ai.caption_templates (user_id, optional)
  └─── ai.user_platform_tokens (user_id, optional)

app.post_review_events (content_post_id → ai.content_posts, no FK enforced)
```

**Cross-schema FKs:** PostgreSQL enforces FK constraints only within the same schema (or with explicit cross-schema references). The `user_id` columns in `ai.*` tables are **not** declared as PostgreSQL FKs pointing to `app.users` — they are logical foreign keys maintained by application code. This avoids circular migration dependencies between Alembic and Prisma.

---

## 6. Data Flow Workflows

### 6.1 Trend Scan → Post Generation → Publish

```
[Cron / API trigger]
        │
        ▼
ai.scan_runs (status=running)
        │ HN Scanner node
        ▼
ai.trend_items (many per scan)
        │ Analyzer node
        ▼
ai.trend_items updated (category, sentiment, scores)
        │ Post Generator pipeline
        ▼
ai.content_posts (status=draft, content_type='photo')
        │ Human review via NestJS
        ▼
ai.content_posts (status=approved)         ← backend_svc UPDATE
ai.post_review_events (approve event)      ← backend_svc INSERT
        │ Publish pipeline (ai-service)
        ▼
ai.published_posts (status=pending → published)
```

### 6.2 Video Clipper Pipeline

```
[User: POST /video-tasks via NestJS]
        │
        ▼
ai.brand_fonts + ai.caption_templates      ← backend_svc INSERT (if new)
ai.video_tasks (status=queued)             ← backend_svc INSERT
        │ ai-service worker picks up task
        ▼
ai.video_tasks (status=processing, progress=%)    ← ai_svc UPDATE
        │ Clips extracted, scored, stored
        ▼
ai.video_clips[] (status=draft, llm_score, hook_score, ...)  ← ai_svc INSERT
ai.video_tasks (status=completed)                             ← ai_svc UPDATE
        │
        │ [User: PATCH /video-clips/:id/review via NestJS]
        ▼
ai.video_clips (status=approved|rejected, feedback)  ← backend_svc UPDATE

        │ (when all clips in task reach a terminal status)
        ▼
ai.content_posts (content_type='video', status=approved)  ← backend_svc INSERT
ai.video_clips (content_post_id linked)                   ← backend_svc UPDATE
        │
        ▼
ai-service publishNow → ai.published_posts             ← ai_svc INSERT/UPDATE
```

### 6.3 Status State Machines

**`ai.video_tasks.status`** (VARCHAR, no PG enum — allows future values without migrations):
```
queued → processing → completed
                   ↘ failed
```

**`ai.video_clips.status`** (VARCHAR):
```
draft → approved → published
     ↘ rejected
```

**`ai.content_posts.status`** (PG enum `ContentStatus`):
```
draft → approved → published
      ↘ needs_revision → draft  (revision loop)
      ↘ flagged_for_review
```

**`ai.published_posts.status`** (PG enum `PublishStatus`):
```
pending → processing → published
                    ↘ failed → pending  (retry)
        cancelled
```

---

## 7. Migration Strategy

### Alembic (ai schema)

All `ai.*` schema changes go through Alembic. Migrations live in `ai-service/alembic/versions/` and are applied with:

```bash
cd ai-service && alembic upgrade head
```

Migration history (abbreviated):

| Revision | Change |
|----------|--------|
| `f254285a977d` | Initial schema — `scan_runs`, `trend_items`, `content_posts`, `published_posts` |
| `f2a3b4c5d6e7` | Multi-user: moved all tables to `ai` schema, added `user_id` columns |
| `e1f2a3b4c5d6` | Added publish tables (`published_posts`, `engagement_time_slots`) |
| `d1e2f3a4b5c6` | Moved enums to `ai` schema |
| `b9c0d1e2f3a4` | Added `content_posts` table |
| `a9b8c7d6e5f4` | Video clipper: `brand_fonts`, `caption_templates`, `video_tasks`, `video_clips` |

### Prisma (app schema)

All `app.*` schema changes go through Prisma migrations:

```bash
cd backend && npx prisma migrate dev --name <description>
```

### Bootstrapping a fresh environment

`backend/docker/init-db.sql` runs **once** at Postgres container first-init (via Docker's `/docker-entrypoint-initdb.d/` mechanism). It creates the roles and sets up the privilege structure. After that:

```bash
docker compose up -d postgres

# ai schema
cd ai-service && alembic upgrade head

# app schema
cd backend && npx prisma migrate deploy
```

**If Postgres already has data** (volume exists), `init-db.sql` does not re-run. Role or privilege changes made to `init-db.sql` must be applied manually via `psql -U scanner`.
