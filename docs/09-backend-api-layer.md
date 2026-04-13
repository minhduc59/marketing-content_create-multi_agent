# 09 — NestJS Backend API Layer

## 1. Context & Goals

The `marketing-content` thesis project previously shipped a single FastAPI
`ai-service` that owned everything: the LangGraph pipelines, the database
access, and a wide-open REST API (no auth, `allow_origins=["*"]`, single
dev user). That was fine for Sprint-1 through Sprint-6 but could not host
a real dashboard.

This doc describes the **NestJS Backend API Layer** introduced alongside
multi-user support. It sits in front of the FastAPI service and provides:

1. **Authentication** — email+password (bcrypt + JWT) and Google OAuth.
2. **Authorization** — JWT access + rotating refresh tokens, role guard
   (`admin` / `user`).
3. **Multi-user isolation** — every user-owned row in the `ai` schema is
   tagged with a `user_id` FK; the gateway refuses to return another
   user's data.
4. **API gateway** — fast Prisma reads for dashboard list/detail views;
   transparent HTTP proxy to FastAPI for LangGraph pipeline triggers.
5. **Real-time status** — Socket.IO gateway that lets the frontend
   subscribe to a scan or publish and receive progress events without
   polling.

## 2. Database strategy (decided 2026-04-11)

**Single Postgres instance, two logical schemas.**

| Schema | Owner               | Managed by | Contents |
|--------|---------------------|------------|----------|
| `ai`   | `ai-service` role   | Alembic    | `scan_runs`, `trend_items`, `trend_comments`, `content_posts`, `published_posts`, `engagement_time_slots`, `scan_schedules`, `user_platform_tokens` |
| `app`  | `backend` role      | Prisma     | `users`, `auth_identities`, `refresh_tokens`, `audit_logs` |

**Why not two databases?** Distributed transactions, CDC duplication,
and double ops cost for a thesis demo.

**Why not one flat schema?** Ownership blur — Alembic and Prisma would
fight over the same migration history.

Cross-schema ownership is enforced by two Postgres roles with disjoint
default grants (see `backend/docker/init-db.sql`):

- `ai_svc` — full write on `ai`, `SELECT` on `app`.
- `backend_svc` — full write on `app`, `SELECT` on `ai`, plus
  `UPDATE` on `ai.content_posts` and `ai.published_posts` (the narrow
  mutation surface used by the dashboard review queue).

Row-level isolation: every `ai.*` row that belongs to a user carries a
UUID column — `triggered_by`, `created_by`, `published_by`, `owner_id`,
or `user_id`. The backend always filters by the caller's JWT sub; the
ai-service enforces the same filter via the `X-User-Id` header set by
the gateway.

`ai.trend_items` and `ai.engagement_time_slots` stay global — they
represent shared HackerNews data and shared engagement statistics, and
there is no benefit to duplicating them per-user.

## 3. What was implemented

### 3.1 ai-service changes

| File | Change |
|------|--------|
| `ai-service/alembic/versions/f2a3b4c5d6e7_multi_user_ai_schema.py` | **NEW.** Creates `ai` + `app` schemas, `ALTER TABLE ... SET SCHEMA ai` for every existing table, adds `triggered_by`, `created_by`, `published_by`, `owner_id`, `user_id` columns plus a `UNIQUE (user_id, platform)` on `user_platform_tokens`. |
| `ai-service/alembic/env.py` | Added `include_schemas=True` and `version_table_schema="public"` so Alembic tracks migrations in `public` while managing `ai`. |
| `ai-service/app/db/models/*.py` | `__table_args__ = {"schema": "ai"}` on every model; FK strings updated from `scan_runs.id` → `ai.scan_runs.id`; added user-scoping columns (`ScanRun.triggered_by`, `ContentPost.created_by`, `PublishedPost.published_by`, `ScanSchedule.owner_id`, `UserPlatformToken.user_id`). |
| `ai-service/app/config.py` | New settings `BACKEND_ORIGIN`, `INTERNAL_API_KEY`, `REQUIRE_INTERNAL_AUTH`. |
| `ai-service/app/main.py` | CORS locked to `BACKEND_ORIGIN` in production; allows `X-User-Id`, `X-Internal-Api-Key`, `X-Request-Id` headers. |
| `ai-service/app/api/v1/deps.py` | **NEW.** `require_internal_auth` (shared API key check) and `get_current_user_id` (reads `X-User-Id` header). |
| `ai-service/app/api/v1/scan.py` | `POST /scan` stamps `triggered_by`; status lookup filters by user. |
| `ai-service/app/api/v1/posts.py` | `POST /posts/generate` forwards `user_id` into the LangGraph runner; list/detail/patch endpoints filter by `created_by`. |
| `ai-service/app/api/v1/publish.py` | Every endpoint depends on `get_current_user_id`; `_validate_post_for_publish` scopes its lookup; runner calls carry `user_id`. |
| `ai-service/app/agents/post_generator/runner.py` + `state.py` + `nodes/output_packaging.py` | Propagate `user_id` through LangGraph state so persisted `ContentPost` rows carry the owner. |
| `ai-service/app/agents/publish_post/runner.py` + `state.py` + `graph.py` | Same propagation for the publish pipeline → `PublishedPost.published_by`. |

### 3.2 New NestJS backend (`backend/`)

```
backend/
├── package.json              NestJS 10 + Prisma 5 + Passport + Socket.IO
├── tsconfig.json             strict TS, ES2022
├── nest-cli.json
├── Dockerfile                multi-stage Node 20 build
├── .env.example              all required env vars
├── docker/init-db.sql        bootstraps ai_svc + backend_svc Postgres roles
├── prisma/schema.prisma      multiSchema: owns `app`, mirrors `ai`
└── src/
    ├── main.ts               ValidationPipe, CORS, HttpExceptionFilter
    ├── app.module.ts         global JwtAuthGuard + ThrottlerGuard
    ├── prisma/               PrismaService (global)
    ├── common/
    │   ├── health.controller.ts
    │   └── http-exception.filter.ts
    ├── auth/
    │   ├── auth.module.ts    Passport + JWT
    │   ├── auth.service.ts   register, login, Google merge, refresh rotation
    │   ├── auth.controller.ts POST /auth/{register,login,refresh,logout} GET /auth/{me,google,google/callback}
    │   ├── dto/auth.dto.ts
    │   ├── strategies/       jwt, local, google
    │   ├── guards/           JwtAuthGuard (@Public opt-out), RolesGuard
    │   └── decorators/       @Public, @Roles, @CurrentUser
    ├── users/users.module.ts (placeholder — extension point)
    ├── ai-service/
    │   ├── ai-service.module.ts      HttpModule with baseURL from env
    │   └── ai-service.client.ts      Typed wrapper; injects X-User-Id + X-Internal-Api-Key on every call
    ├── trends/               GET /trends, /trends/top, /trends/:id  (Prisma direct)
    ├── scans/                GET /scans, /scans/:id  (Prisma);  POST /scans, GET /scans/:id/status  (proxy)
    ├── posts/                GET /posts, /posts/:id  (Prisma);  POST /posts/generate (proxy);  PATCH /posts/:id/status (direct write + audit log)
    ├── publish/              GET /publish/history  (Prisma);  POST/DELETE/GET /publish/...  (proxy)
    ├── reports/              GET /reports, /reports/:scanRunId  (Prisma, filtered by triggered_by)
    ├── tiktok-auth/          GET /auth/tiktok/login — 302s to FastAPI with ?state=<userId>
    └── status/
        ├── status.module.ts
        └── status.gateway.ts WebSocket /ws; rooms scan:<id> / publish:<id>;
                              JWT via handshake; polls ai-service every 2s
                              while a room has subscribers
```

### 3.3 Docker Compose

`marketing-content/docker-compose.yml` (new, top-level) brings up the
full stack — `postgres` with `init-db.sql`, `redis`, `ai-service`,
and `backend`. The existing `ai-service/docker-compose.yml` is left in
place for solo ai-service work.

## 4. Runtime architecture

```
                    +------------------+
  Frontend (3001)  →|  NestJS :3000    |─────────────────┐
                    |  • JWT guard     |                 │
                    |  • Prisma reads  │ X-User-Id +     │
                    |  • Proxy calls   │ X-Internal-Api-Key│
                    +---------┬--------+                 │
                              │ Socket.IO /ws            │
                              │ (2s poll while           │
                              │  subscribed)             │
                              ▼                          ▼
                    +------------------+       +------------------+
                    | Postgres :5432   |◄──────|  FastAPI :8000   |
                    | schemas: ai, app |       |  ai-service      |
                    +------------------+       |  LangGraph       |
                         ▲                     +------------------+
                         │ Alembic
                         │ Prisma
```

**Request flow for a dashboard list** (e.g. "show my posts"):
1. Client sends `GET /posts` with `Authorization: Bearer <jwt>`.
2. `JwtAuthGuard` verifies the token, attaches `{userId, email, role}`.
3. `PostsController.list` calls `prisma.contentPost.findMany({ where: { createdBy: userId } })`.
4. Response returns directly from Postgres — ai-service is never touched.

**Request flow for a pipeline trigger** (e.g. "start a scan"):
1. Client sends `POST /scans` with JWT + body.
2. `ScansController.trigger` calls `AiServiceClient.triggerScan(userId, body)`.
3. The client adds `X-User-Id: <userId>` + `X-Internal-Api-Key: <shared>`.
4. FastAPI's `get_current_user_id` validates the header, stamps the new
   `ScanRun.triggered_by`, and launches the LangGraph background task.
5. FastAPI returns 202; backend returns 202 to the client.
6. Client opens a WebSocket to `/ws`, emits
   `subscribe { resource: "scan", id: <scanId> }`.
7. `StatusGateway` polls FastAPI every 2 s and pushes `scan.progress`
   events to the room until `scan.completed`.

## 5. Verification & Test Plan

### 5.1 Prerequisites

```bash
cd marketing-content
cp backend/.env.example backend/.env
# edit backend/.env: set JWT_ACCESS_SECRET + JWT_REFRESH_SECRET
cp ai-service/.env.example ai-service/.env   # if not already present
# set REQUIRE_INTERNAL_AUTH=true and INTERNAL_API_KEY=<same> in both .env files
```

### 5.2 Full stack via Docker

```bash
docker compose up -d postgres redis
# Apply schema
cd ai-service && alembic upgrade head && cd ..
cd backend && npm install && npx prisma migrate deploy && cd ..
docker compose up -d ai-service backend
```

### 5.3 Schema verification

```bash
docker compose exec postgres psql -U scanner -d trending_scanner -c "\dn"
# Expect: ai, app, public

docker compose exec postgres psql -U scanner -d trending_scanner -c "\dt ai.*"
# Expect: scan_runs, trend_items, content_posts, published_posts, ...

docker compose exec postgres psql -U scanner -d trending_scanner -c "\dt app.*"
# Expect: users, auth_identities, refresh_tokens, audit_logs
```

### 5.4 Auth round-trip

```bash
# Register
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@local.dev","password":"password123","displayName":"Demo"}'
# → { accessToken, refreshToken }

# Login again (idempotent credential check)
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@local.dev","password":"password123"}'

# Fetch profile
ACCESS=<accessToken from above>
curl -s http://localhost:3000/auth/me -H "Authorization: Bearer $ACCESS"
# → { id, email, displayName, role, createdAt }

# Rotate
REFRESH=<refreshToken>
curl -s -X POST http://localhost:3000/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}"
# → new { accessToken, refreshToken }

# Google OAuth (only if GOOGLE_CLIENT_ID set)
open http://localhost:3000/auth/google
```

### 5.5 Proxy path (trigger a scan through the gateway)

```bash
# 1. Start a scan
curl -s -X POST http://localhost:3000/scans \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"platforms":["hackernews"],"max_items_per_platform":10}'
# → 202 { scan_id, status: "pending", ... }

# 2. Poll status via NestJS
curl -s http://localhost:3000/scans/$SCAN_ID/status \
  -H "Authorization: Bearer $ACCESS"

# 3. Verify the row was stamped with our user_id
docker compose exec postgres psql -U scanner -d trending_scanner \
  -c "SELECT id, triggered_by FROM ai.scan_runs ORDER BY started_at DESC LIMIT 1;"
# triggered_by should match $USER_ID from /auth/me
```

### 5.6 Direct-read path

```bash
# Trends come from Prisma; take ai-service offline to prove the backend
# does not depend on it for read paths.
docker compose stop ai-service
curl -s "http://localhost:3000/trends?page=1&pageSize=5" \
  -H "Authorization: Bearer $ACCESS"
# → 200 (list still works)
docker compose start ai-service
```

### 5.7 Narrow write path (review queue)

```bash
# Approve a post — this is a direct Prisma UPDATE on ai.content_posts
# plus an audit row in app.audit_logs.
curl -s -X PATCH http://localhost:3000/posts/$POST_ID/status \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"status":"approved"}'

docker compose exec postgres psql -U scanner -d trending_scanner \
  -c "SELECT action, resource, resource_id FROM app.audit_logs ORDER BY created_at DESC LIMIT 1;"
# → post.status.update | content_post | <postId>
```

### 5.8 Multi-user isolation

```bash
# Register a second user
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"other@local.dev","password":"password123"}'
ACCESS2=<their token>

# User 2 should see zero posts even though user 1 has some.
curl -s "http://localhost:3000/posts" -H "Authorization: Bearer $ACCESS2"
# → { items: [], total: 0 }

# User 2 hitting user 1's scan gets 404.
curl -s "http://localhost:3000/scans/$USER1_SCAN_ID" \
  -H "Authorization: Bearer $ACCESS2"
# → 404 Not found
```

### 5.9 DB role isolation (defense in depth)

```bash
# backend_svc cannot INSERT into ai.trend_items
docker compose exec postgres psql -U backend_svc -d trending_scanner \
  -c "INSERT INTO ai.trend_items (id, scan_run_id, title, platform) VALUES (gen_random_uuid(), gen_random_uuid(), 'x', 'hackernews');"
# → ERROR: permission denied for table trend_items
```

### 5.10 WebSocket real-time

```bash
# Use wscat (npm i -g wscat)
wscat -c "ws://localhost:3000/ws?token=$ACCESS"
> {"event":"subscribe","data":{"resource":"scan","id":"<scanId>"}}
# Expect periodic `scan.progress` events, then `scan.completed`.
```

### 5.11 RBAC

```bash
# Only admins should hit admin-tagged endpoints; with the seed account
# having role=user, any @Roles('admin') route returns 403.
```

## 6. Open issues / future work

- **Unused shims** in the migration: columns are added as nullable UUIDs
  without a hard FK to `app.users(id)` because `app.users` lives in a
  different schema managed by Prisma. Once Prisma creates the table, a
  follow-up migration can add the FK (`ALTER TABLE ai.scan_runs ADD
  CONSTRAINT ... FOREIGN KEY (triggered_by) REFERENCES app.users(id)`).
- **Row-level security**: the plan calls for Postgres RLS policies on
  user-scoped `ai.*` tables. Not wired up in this sprint — the current
  defense is JWT in NestJS + `X-User-Id` check in FastAPI + DB roles. RLS
  is the v2 hardening step.
- **Status gateway polling** should move to Redis pub/sub. ai-service
  would publish on every `ScanRun.status` transition and the gateway
  would `SUBSCRIBE` instead of polling. TODO noted in `status.gateway.ts`.
- **Frontend (Next.js 15)** is still pending — Sprint 8 deliverable.
