# RUNBOOK — marketing-content

How to run the full stack (Postgres + Redis + FastAPI ai-service + NestJS backend) locally and via Docker.

```
Postgres 16 ── Redis 7 ── ai-service (FastAPI :8000) ── backend (NestJS :3000) ── [frontend :3001]
```

---

## 0. Prerequisites

- Docker + Docker Compose
- Node.js 20+ and npm
- Python 3.11+
- `psql` client (optional; `docker exec` works too)

First-time checkout:

```bash
cd marketing-content
cp ai-service/.env.example ai-service/.env
cp backend/.env.example    backend/.env
```

Edit both `.env` files:
- `ai-service/.env` — set `OPENAI_API_KEY`, `TIKTOK_CLIENT_KEY`/`SECRET`, `TOKEN_ENCRYPTION_KEY`, `BFL_API_KEY`.
- `backend/.env` — set `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (any random 32+ char strings); Google OAuth is optional.

If you plan to enable the internal-auth handshake between backend → ai-service, pick one shared string and set it in **both** files:
- `ai-service/.env`: `REQUIRE_INTERNAL_AUTH=true`, `INTERNAL_API_KEY=<same>`
- `backend/.env`:    `AI_SERVICE_INTERNAL_API_KEY=<same>`

---

## 1. Start infrastructure (Postgres + Redis)

Two compose files exist. **Use only one at a time — they both bind 5432/6379.**

### Option A — Full stack (recommended for fresh dev machines)

```bash
docker compose up -d postgres redis
```

`backend/docker/init-db.sql` runs automatically on first boot and creates the `ai_svc` / `backend_svc` roles plus the `ai` and `app` schemas.

### Option B — If you already use `ai-service/docker-compose.yml`

```bash
cd ai-service
docker compose up -d postgres redis
cd ..
```

This variant does **not** mount `init-db.sql`, so you have to create the roles manually after first boot — see [Appendix A](#appendix-a--bootstrap-postgres-roles-manually).

Verify:

```bash
docker ps --filter 'publish=5432' --format '{{.Names}}'
# → ai-service-postgres-1   (or   marketing-content-postgres-1)
```

Either name works for the rest of this runbook; substitute it for `$PG`:

```bash
export PG=$(docker ps --filter 'publish=5432' --format '{{.Names}}' | head -1)
```

---

## 2. Run Alembic (ai-service schema)

```bash
cd ai-service
pip install -e ".[dev]"            # first time only
alembic upgrade head
cd ..
```

Expected result — the `ai` schema now contains all ai-service tables:

```bash
docker exec $PG psql -U scanner -d trending_scanner -c "\dt ai.*"
# scan_runs, trend_items, trend_comments, content_posts,
# published_posts, engagement_time_slots, scan_schedules,
# user_platform_tokens
```

And the current migration is the multi-user one:

```bash
docker exec $PG psql -U scanner -d trending_scanner \
  -c "SELECT version_num FROM public.alembic_version;"
# → f2a3b4c5d6e7
```

---

## 3. Run Prisma (backend schema)

> **Important:** the NestJS Prisma schema mirrors `ai.*` for type-safe reads but Alembic owns those tables. Never run `prisma migrate dev` or `prisma db push` — they would try to destructively rewrite `ai.*`. Always use the hand-written migrations under `backend/prisma/migrations/`.

```bash
cd backend
npm install                        # first time only
npx prisma generate
npx prisma migrate deploy
cd ..
```

Expected output:

```
1 migration found in prisma/migrations
No pending migrations to apply.
```

Verify:

```bash
docker exec $PG psql -U scanner -d trending_scanner -c "\dt app.*"
# users, auth_identities, refresh_tokens, audit_logs, _prisma_migrations
```

If you get **P3005 "database schema is not empty"** on a fresh clone, follow [Appendix B](#appendix-b--baseline-prisma-on-existing-db).

---

## 4. Start the services
Two ways to develop                             
                                          
Option A: Docker only (simpler)
                                                    
# Start everything
docker compose up -d                              
                                                  
# See logs in real-time (like a terminal)
docker compose logs -f ai-service backend         
                                              
# See only ai-service logs                        
docker compose logs -f ai-service               
                                                    
# See only backend logs                 
docker compose logs -f backend                    
                                                    
# Restart after code changes (ai-service auto-reloads via volume mount)                    
docker compose restart backend                  
                                                    
# Stop everything
docker compose down                               
                                                  
  Option B: Local dev (better for debugging — 
  recommended)                            

  # Only start infra (database + redis) via Docker  
  docker compose up -d postgres redis
                                                    
  # Stop the app containers so they don't steal   
  ports
  docker compose stop ai-service backend            
                                              
  # Terminal 1 — ai-service (logs visible here)     
  cd ai-service                                   
  uvicorn app.main:app --reload --port 8000         
                                              
  # Terminal 2 — backend (logs visible here)        
  cd backend                                      
  npm run start:dev                                 
   
  This gives you live logs in each terminal,        
  hot-reload on save, and easier debugging.       

  Key commands cheat sheet                          
                                          
  ┌────────────────────────┬─────────────────────┐  
  │        Command         │    What it does     │  
  ├────────────────────────┼─────────────────────┤
  │ docker compose up -d   │ Start only DB +     │  
  │ postgres redis         │ Redis               │
  ├────────────────────────┼─────────────────────┤
  │ docker compose stop    │ Free up ports       │
  │ ai-service backend     │ 8000/3000           │
  ├────────────────────────┼─────────────────────┤  
  │ docker compose up -d   │ Start everything in │
  │                        │  background         │  
  ├────────────────────────┼─────────────────────┤
  │ docker compose logs -f │ Stream ai-service   │
  │  ai-service            │ logs                │
  ├────────────────────────┼─────────────────────┤
  │ docker compose logs -f │ Stream backend logs │
  │  backend               │                     │  
  ├────────────────────────┼─────────────────────┤
  │ docker compose restart │ Restart after       │  
  │  ai-service            │ changes             │
  ├────────────────────────┼─────────────────────┤
  │ docker compose down    │ Stop and remove all │
  │                        │  containers         │  
  ├────────────────────────┼─────────────────────┤
  │ docker compose ps      │ Show running        │  
  │                        │ containers + ports  │
  └────────────────────────┴─────────────────────┘

---

## 5. Smoke test

```bash
# 1. Health checks
curl http://localhost:8000/health          # {"status":"ok","service":"trending-scanner"}
curl http://localhost:3000/health          # {"status":"ok","service":"backend-gateway"}

# 2. Register a user
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@local.dev","password":"password123","displayName":"Demo"}'
# → { "accessToken": "...", "refreshToken": "..." }

ACCESS=<paste accessToken here>

# 3. Get profile
curl http://localhost:3000/auth/me -H "Authorization: Bearer $ACCESS"

# 4. Trigger a scan (proxied to ai-service)
curl -s -X POST http://localhost:3000/scans \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"platforms":["hackernews"],"max_items_per_platform":10}'

# 5. Watch real-time progress over WebSocket (optional)
#    npm i -g wscat
wscat -c "ws://localhost:3000/ws?token=$ACCESS"
> {"event":"subscribe","data":{"resource":"scan","id":"<scan_id>"}}
```

---

## 6. Common operations

| Task | Command |
|------|---------|
| Stop everything | `docker compose down` |
| Wipe DB and start over | `docker compose down -v` (deletes the postgres volume) |
| Tail ai-service logs | `docker compose logs -f ai-service` |
| Tail backend logs | `docker compose logs -f backend` |
| Open Postgres shell | `docker exec -it $PG psql -U scanner -d trending_scanner` |
| Run ai-service tests | `cd ai-service && pytest` |
| Lint ai-service | `cd ai-service && ruff check . && mypy --strict .` |
| Lint backend | `cd backend && npm run lint` |

### Schema changes

**Add a column to an `ai.*` table:**
1. Edit the SQLAlchemy model in `ai-service/app/db/models/`.
2. `cd ai-service && alembic revision --autogenerate -m "describe change"`
3. Review the generated file under `alembic/versions/`.
4. `alembic upgrade head`
5. Update `backend/prisma/schema.prisma` to mirror the new column (keep the `@@schema("ai")` tag).
6. `cd backend && npx prisma generate` — clients pick up the new field.

**Add a column to an `app.*` table:**
1. Edit `backend/prisma/schema.prisma`.
2. Hand-write a new file `backend/prisma/migrations/<timestamp>_<name>/migration.sql` containing the DDL — do **not** use `prisma migrate diff` against the live DB.
3. `npx prisma migrate deploy`
4. `npx prisma generate`

---

## Appendix A — Bootstrap Postgres roles manually

Only needed if you started Postgres without the top-level `docker-compose.yml` (i.e. the `init-db.sql` never ran).

```bash
docker exec -i $PG psql -U scanner -d trending_scanner <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ai_svc') THEN
    CREATE ROLE ai_svc LOGIN PASSWORD 'ai_svc_pass';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='backend_svc') THEN
    CREATE ROLE backend_svc LOGIN PASSWORD 'backend_pass';
  END IF;
END$$;

ALTER ROLE backend_svc WITH LOGIN PASSWORD 'backend_pass';
ALTER ROLE ai_svc      WITH LOGIN PASSWORD 'ai_svc_pass';

CREATE SCHEMA IF NOT EXISTS ai  AUTHORIZATION ai_svc;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION backend_svc;

GRANT USAGE  ON SCHEMA app TO ai_svc;
GRANT USAGE  ON SCHEMA ai  TO backend_svc;
GRANT SELECT ON ALL TABLES IN SCHEMA ai TO backend_svc;
GRANT UPDATE ON ai.content_posts, ai.published_posts TO backend_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ai TO backend_svc;
GRANT ALL ON SCHEMA ai  TO scanner;
GRANT ALL ON SCHEMA app TO scanner;

ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO ai_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai  GRANT SELECT ON TABLES TO backend_svc;
ALTER DEFAULT PRIVILEGES FOR ROLE ai_svc IN SCHEMA ai
  GRANT SELECT, UPDATE ON TABLES TO backend_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai  GRANT USAGE, SELECT ON SEQUENCES TO backend_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO ai_svc;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
\du
SQL
```

Verify `backend_svc` can log in:

```bash
docker exec $PG bash -c 'PGPASSWORD=backend_pass psql -h 127.0.0.1 -U backend_svc -d trending_scanner -c "SELECT current_user;"'
# → backend_svc
```

---

## Appendix B — Baseline Prisma on existing DB

If `prisma migrate deploy` fails with **P3005 "The database schema is not empty"**, it's because the `ai.*` tables exist (correctly — Alembic made them) but Prisma has no record of its own migrations. Apply the init migration manually and mark it resolved:

```bash
cd backend

# 1. Copy the migration SQL into the container and run as backend_svc
docker cp prisma/migrations/20260411000000_init/migration.sql $PG:/tmp/app_init.sql
docker exec $PG psql -U backend_svc -d trending_scanner -f /tmp/app_init.sql

# 2. Tell Prisma the migration is already applied
npx prisma migrate resolve --applied 20260411000000_init

# 3. Confirm
npx prisma migrate deploy
# → "No pending migrations to apply."
```

---

## Appendix C — Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `P1000 Authentication failed ... backend_svc` | Role missing or password mismatch | [Appendix A](#appendix-a--bootstrap-postgres-roles-manually) |
| `P3005 database schema is not empty` | Prisma sees `ai.*` tables, no migration history | [Appendix B](#appendix-b--baseline-prisma-on-existing-db) |
| `port 5432/6379 is already allocated` | Two compose files running at once | `docker compose -f ai-service/docker-compose.yml down` then start the top-level one |
| Backend returns 401 on every call | Missing `Authorization: Bearer <jwt>` header | Log in first; attach the `accessToken` |
| ai-service returns 401 "Missing X-User-Id header" | You hit the FastAPI port directly instead of through the backend | Either go through `:3000`, or set `REQUIRE_INTERNAL_AUTH=false` in `ai-service/.env` |
| `prisma migrate diff` generated ALTER statements for `ai.*` | Never run diff against live DB; types don't byte-match Alembic | Hand-write the migration SQL, touch only `app.*` |
| WebSocket disconnects immediately | Missing or expired JWT in `?token=` | Pass a fresh access token |
