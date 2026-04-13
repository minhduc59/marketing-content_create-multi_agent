# Feature Roadmap — Technology Trend & TikTok Content Pipeline

## Tong quan tien do

```
Phase 1 (Done)          Phase 2 (Done)            Phase 3 (Done)
│                       │                         │
├─ HackerNews Crawler  ─┼─ TikTok Post Gen       ─┼─ NestJS Backend        ─│
├─ AI Analysis         ─┤─ Image Generation      ─┤─ JWT Auth + OAuth      ─│
└─ Report Generation   ─┘─ Auto-Review Loop      ─┘─ Next.js Frontend     ─┘
                                                   ─ TikTok Publishing     ─┘
```

---

## Phase 1 — HackerNews → Analysis → Reports (DONE)

**Focus:** Crawl HackerNews, analyze with GPT-4o, generate reports.

### AI Service (FastAPI + LangGraph)
- [x] FastAPI project setup
- [x] LangGraph linear pipeline (supervisor.py)
- [x] HackerNews scanner (Firebase API, article crawling, tech filtering)
- [x] GPT-4o trend analyzer (quality scoring, sentiment, lifecycle, engagement prediction)
- [x] Content saver (markdown articles to reports/{scan_id}/articles/)
- [x] Vietnamese trend report + content angles JSON
- [x] Database persistence (ScanRun, TrendItem, TrendComment)
- [x] REST API (scan, trends, reports, schedule)
- [x] Redis rate limiting + caching
- [x] Docker Compose (PostgreSQL + Redis)
- [x] Alembic migrations

---

## Phase 2 — TikTok Post Generation (DONE)

**Focus:** Auto-generate TikTok photo posts from analyzed trends with images and auto-review.

### Post Generator Agent (`ai-service/app/agents/post_generator/`)
- [x] Strategy alignment node (load trends, select angles + formats)
- [x] Content generation node (7 TikTok post formats with hooks, CTA, hashtags)
- [x] Image prompt creation node (BFL-optimized prompts)
- [x] Image generation node (BFL API integration)
- [x] Auto-review node (7 weighted criteria scoring)
- [x] Revision loop (score < 7 → revise, max 2 iterations)
- [x] Output packaging node (save to storage + PostgreSQL)
- [x] ContentPost database model with full metadata

### Post Formats
- [x] quick_tips, hot_take, trending_breakdown, did_you_know
- [x] tutorial_hack, myth_busters, behind_the_tech

---

## Phase 3 — Backend, Frontend & TikTok Publishing (DONE)

**Focus:** Full-stack app with auth, dashboard UI, and TikTok publishing.

### Backend (NestJS — `backend/`)
- [x] NestJS project with 11 modules
- [x] JWT authentication (access + refresh tokens)
- [x] Google OAuth via Passport
- [x] Multi-schema Prisma (app schema + ai schema read-only mirror)
- [x] AI Service HTTP client (typed proxy to all ai-service endpoints)
- [x] Scans, Trends, Posts, Publish, Reports controllers
- [x] TikTok OAuth flow controller
- [x] WebSocket gateway (Socket.IO) for real-time scan/publish progress
- [x] Rate limiting (ThrottlerModule: 100 req/60s)
- [x] Database role isolation (ai_svc + backend_svc roles)
- [x] Docker Compose integration + init-db.sql bootstrap

### Frontend (Next.js 14 — `frontend/`)
- [x] Next.js 14 App Router with auth + app route groups
- [x] Login / Register pages (email + Google OAuth)
- [x] Dashboard with KPI metrics
- [x] Trends listing with filters (sentiment, lifecycle, category)
- [x] Content posts management (list, detail, status update)
- [x] Media library (generated images)
- [x] Schedule view
- [x] Analytics page
- [x] Settings (accounts, keywords)
- [x] Zustand stores (auth, pipeline, settings, ui)
- [x] TanStack Query hooks for all API endpoints
- [x] Real-time updates via Socket.IO (scan progress, publish progress)

### Publish Post Agent (`ai-service/app/agents/publish_post/`)
- [x] Resolve and validate node (load post, check status, resolve image URL)
- [x] Golden hour calculation (EngagementTimeSlot data)
- [x] Scheduler node (publish now vs APScheduler deferred)
- [x] TikTok publish node (photo post API, retry 3x, polling)
- [x] TikTok OAuth token management (Fernet encryption)
- [x] PublishedPost, UserPlatformToken, EngagementTimeSlot models
- [x] Caption assembly (caption + hashtags + CTA)

---

## Phase 4 — Future Enhancements (Planned)

- [ ] LinkedIn publishing (in addition to TikTok)
- [ ] Performance analytics agent (post-publish metrics)
- [ ] Strategy optimization feedback loop
- [ ] Multi-platform content adaptation
- [ ] Monitoring & observability (error tracking, metrics)
- [ ] Production cloud deployment

---

## Technical Priorities

| Priority | Item | Status |
|----------|------|--------|
| P0 | HackerNews crawler | Done |
| P0 | GPT-4o trend analysis | Done |
| P0 | Report generation (Vietnamese) | Done |
| P0 | REST API + Database | Done |
| P0 | TikTok post generation (7 formats) | Done |
| P0 | Image generation (BFL) | Done |
| P0 | Auto-review with revision loop | Done |
| P0 | NestJS backend + JWT auth | Done |
| P0 | TikTok publishing + golden hour | Done |
| P0 | Next.js frontend dashboard | Done |
| P0 | Real-time WebSocket updates | Done |
| P1 | LinkedIn publishing | Planned |
| P1 | Performance analytics | Planned |
| P2 | Production deployment | Planned |
