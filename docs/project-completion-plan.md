# Project Completion Plan — AI Marketing Multi-Agent System
**Deadline:** June 10, 2026 | **Weekdays:** 5h/day | **Weekends:** 6h/day
**Total budget:** 28 weekdays × 5h + 10 weekend days × 6h = **200h**

---

## Current Status & Productivity Assessment

### Honest State of the Codebase (May 4, 2026)

| Layer | Actual % | Previous Estimate | Reality Check |
|-------|----------|-------------------|---------------|
| Frontend (Next.js) | **60%** | ~~100%~~ | Pages exist but lack error states, loading states, real-time data, mobile responsiveness; admin panel entirely missing |
| Backend (NestJS) | 90% | 90% | Accurate — core controllers done, user management minimal |
| AI Service — Pipeline 1 (Trend Scanning) | 95% | 95% | Works but schedule executor never fires |
| AI Service — Pipeline 2 (Post Generation) | 90% | 90% | Works; using BFL not Lumina (thesis gap) |
| AI Service — Pipeline 3 (Publish Post) | 85% | 90% | Works; token auto-refresh not wired |
| Performance Feedback Agent (Stage 8) | 0% | 0% | Entirely missing |
| Scan schedule executor | 10% | — | DB model only; no job runner |
| Lumina Image 2.0 self-hosted | 0% | 0% | Not started |
| AWS CDK Deployment | 0% | — | Not started |
| Admin Panel (Frontend) | 0% | — | Not started |
| **Overall** | **~55%** | ~~95%~~ | |

---

### What Is Working Well

- **Architecture is sound.** The 3-tier split (Next.js → NestJS → FastAPI) is clean and the LangGraph pipeline topology is correct. No architectural rework needed.
- **Pipelines 1–3 are structurally complete.** The hardest design work is done; remaining gaps are wiring and feature additions, not redesigns.
- **Frontend routing and state management are solid.** All page routes exist, Zustand stores are set up, TanStack Query hooks are defined. The 40% gap is UI quality, not structure.
- **DB schema is mature.** 18 Alembic migrations, multi-schema PostgreSQL setup — this will not need significant changes.

---

### What Is Blocking Progress

| Issue | Risk | Action Required |
|-------|------|-----------------|
| 3 uncommitted files (`card.tsx`, `detail-sheet.tsx`, `use-pipeline-board.ts`) | Low | Commit today — fragmented state creates merge confusion |
| No integration tests for any pipeline | High | Regressions will be invisible as you add Stage 8 + Lumina |
| Scan schedule executor never fires | High | Existing scheduled scans in DB are silently broken |
| TikTok/LinkedIn API not submitted | Critical | Every day of delay = less time to test live publishing |
| Frontend estimated at 100% when it is 60% | High | Underestimated scope led to under-allocated time |
| No GPU access plan for Lumina | High | Week 3 will stall without pre-arranged GPU |

---

### Productivity Recommendations

1. **Commit daily, every session.** Even WIP commits. Git blame is your audit trail when debugging integration failures across three services.
2. **Write one integration test per pipeline node as you complete it.** Not after. Discovering Stage 8 breaks Pipeline 2 during Week 5 testing is very expensive.
3. **Use weekends for frontend exclusively.** UI work is visually satisfying and easier to context-switch into after a break. Keep backend/AI work for weekday deep-focus blocks.
4. **Time-box Lumina hard.** If the self-hosted inference endpoint is not serving images by May 22 EOD, activate the Replicate backup immediately. Do not let Lumina slip into Week 5.
5. **Submit LinkedIn/TikTok apps today before writing a single line of code.** These are the longest external lead times in the project.
6. **AWS CDK: start minimal.** Deploy just ECS + RDS + Redis first (Week 4 weekend). Add CloudFront and ALB in Week 5. Avoid over-engineering the CDK stack.
7. **Block your calendar.** 5h weekday + 6h weekend is significant. Protect these blocks — a single missed weekend session = 6h lost that cannot be recovered.

---

## Gap Analysis: Thesis Requirements vs Current Implementation

| # | Requirement | Status | Gap |
|---|-------------|--------|-----|
| 1 | Orchestrator Router Workflow (rule-based, no LLM for routing) | ✅ Done | — |
| 2 | Trending Scanner: crawl → quality filtering → deep analysis | ✅ Done | — |
| 3 | Report Generation: `.md` report + processed content JSON files | ✅ Done | — |
| 4 | Post Generation: 7 formats, strategy alignment | ✅ Done | — |
| 5 | Auto-Review loop (score < 7 → revise, max 2 retries) | ✅ Done | — |
| 6 | **Visual Factory — Lumina Image 2.0 self-hosted + LoRA (LeX-10K)** | ❌ Missing | Using BFL; thesis requires self-hosted Lumina with LoRA fine-tuning |
| 7 | Golden Hour Scheduler + platform publish (2 modes: auto/manual) | ✅ Done | Token auto-refresh not wired |
| 8 | **Performance Feedback Agent (Stage 8 — async 24h cron)** | ❌ Missing | No metrics collection, no strategy versioning |
| 9 | **Cron-based scan schedule executor** | ❌ Incomplete | DB model exists; job runner never fires |
| 10 | Human Review Gate (approve/reject with feedback injection) | ✅ Done | — |
| 11 | Daemon mode (continuous pipeline, configurable interval) | ⚠️ Partial | One-time mode works; daemon loop not wired end-to-end |
| 12 | **Frontend — existing pages to production quality (60% → 100%)** | ⚠️ Partial | Missing: error states, loading skeletons, empty states, real-time WebSocket, mobile responsive, form validation |
| 13 | **Frontend — Admin Panel** | ❌ Missing | User management, system monitoring, content moderation, global settings |
| 14 | Backend API Gateway (NestJS + JWT + WebSocket) | ✅ ~90% | — |
| 15 | **LinkedIn/TikTok API developer approval** | ❌ Not submitted | External dependency — submit TODAY |
| 16 | **AWS CDK production deployment** | ❌ Missing | No cloud infrastructure defined |

---

## Summary of Remaining Work

### Critical (blocks thesis completion)
1. **Submit LinkedIn developer app** — today; LinkedIn API takes 3–7 days (much faster than TikTok)
2. **Submit TikTok developer app** — today; 2–4 week approval timeline
3. **Lumina Image 2.0 self-hosted** — largest technical task; GPU required
4. **Performance Feedback Agent (Stage 8)** — async metrics + strategy versioning
5. **Scan schedule executor** — wire APScheduler to fire cron-based scans
6. **Frontend: finish existing pages** — add error/loading/empty states, real-time updates, mobile
7. **Frontend: Admin Panel** — full CRUD UI for user mgmt, system health, content moderation
8. **AWS CDK deployment** — ECS, RDS, Redis, S3, CloudFront, ALB, Secrets Manager

### Stabilization (prevents regressions)
9. Commit 3 uncommitted files
10. TikTok token auto-refresh
11. Daemon mode end-to-end wiring
12. Integration tests for each pipeline

---

## 6-Week Detailed Timeline

**Period:** May 4 – June 10, 2026
**Structure:** Mon–Fri = 5h deep work (backend/AI) | Sat–Sun = 6h each (frontend/CDK)

---

### Week 1 — May 4–10 | Foundation, API Submissions, Scheduling
**Goal:** Submit platform API apps, fix all pipeline wiring gaps, smoke-test end-to-end.

#### Weekdays (25h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Mon May 4 | **Submit LinkedIn developer app** (linkedin.com/developers) — request `w_member_social`, `r_liteprofile` scopes; **Submit TikTok developer app** — request `video.publish` + `video.upload` scopes | 2h | Both apps submitted (clocks start) |
| Mon May 4 | Commit uncommitted files: `card.tsx`, `detail-sheet.tsx`, `use-pipeline-board.ts` | 0.5h | Clean git state |
| Mon May 4 | Wire **scan schedule executor**: on app startup APScheduler reads all active `ScanSchedule` rows, registers cron jobs, each job fires `POST /api/v1/scan`; handle job de-duplication on restart | 2.5h | Scheduled scans auto-trigger |
| Tue May 5 | **TikTok token auto-refresh**: detect 401 in `tiktok_client.py`, call TikTok refresh endpoint, update `UserPlatformToken` in DB, retry original request transparently | 5h | OAuth tokens stay valid |
| Wed May 6 | Wire **daemon mode** end-to-end: after `published` state in `supervisor.py`, sleep `interval_hours` then re-enter `init`; expose `daemon_mode` (bool) + `interval_hours` (int, default 6) in scan API request body | 5h | Continuous pipeline cycles |
| Thu May 7 | Full pipeline smoke test: trigger scan → analyze → report → generate post → BFL image → mock publish; document every failure | 5h | End-to-end confirmed working |
| Fri May 8 | Fix all bugs from smoke test; write one happy-path integration test using pytest + httpx against local stack | 5h | Green integration test committed |

#### Weekend (12h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Sat May 9 | **Admin panel scaffold** in Next.js: create `(admin)/` route group, admin layout with sidebar nav (Users, System, Content, Settings), protect all admin routes with `role === 'admin'` guard | 6h | Admin shell navigable, auth guard working |
| Sun May 10 | **Admin — User Management page**: table of all users with search, role badge (admin/user), deactivate/reactivate action; wire to `GET /v1/admin/users` + `PATCH /v1/admin/users/:id` (add these 2 backend endpoints) | 6h | User list + role management working |

**Week 1 total: 37h**

---

### Week 2 — May 11–17 | Performance Feedback Agent + Admin Panel
**Goal:** Implement Stage 8 fully; build admin system monitoring and content moderation.

#### Weekdays (25h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Mon May 11 | Design Stage 8: research LinkedIn `GET /v2/socialActions/{shareUrn}` metrics API + TikTok `/v2/video/query/`; add `ContentStrategy` SQLAlchemy model (JSON blob `rules`, int `version`, timestamp `created_at`); Alembic migration | 5h | DB schema + API contracts defined |
| Tue May 12 | Implement `performance_feedback` node: for each `published` post crossing 24h mark, query platform API for likes/views/comments/shares, compute `engagement_rate = (likes + comments + shares) / views`, persist to `PublishedPost.metrics` JSON column | 5h | Metrics collected from platform |
| Wed May 13 | Implement strategy update logic: aggregate format performance across last N posts, identify top 2 improvements, apply guardrails (max 2 changes/cycle, min 5 posts between updates, confidence score ≥ 0.7 per change), insert new `ContentStrategy` row with `version = prev + 1` | 5h | Strategy versioning with guardrails and rollback |
| Thu May 14 | Wire APScheduler 24h cron: `collect_post_metrics()` checks every hour for posts that crossed 24h without metrics; also updates `EngagementTimeSlot` aggregates for golden hour recalculation; add `GET /api/v1/strategy` endpoint to expose current + history | 5h | Cron fires, golden hour recalibrates |
| Fri May 15 | Write integration test for Stage 8; verify rollback (`PATCH /api/v1/strategy/rollback` → decrement to previous version); document Stage 8 in Swagger | 5h | Stage 8 fully tested + documented |

#### Weekend (12h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Sat May 16 | **Admin — System Monitoring page**: pipeline health cards (last scan time, last post generated, last publish); scan run history table with status badges; error log viewer (last 50 errors from structured logs); real-time via WebSocket | 6h | Ops visibility into pipeline |
| Sun May 17 | **Admin — Content Moderation page**: table of all `ContentPost` records across all users, filter by status, preview modal (caption + image), force-approve / force-reject / flag actions; wire to existing `PATCH /v1/posts/:id/status` | 6h | Admin can moderate any post |

**Week 2 total: 37h**

---

### Week 3 — May 18–24 | Lumina Image 2.0 Setup + Frontend Quality Pass 1
**Goal:** Get self-hosted Lumina running; polish existing frontend pages (first pass).

> **Highest-risk week.** Arrange GPU access before Monday May 18.
> **Recommended:** RunPod A100 PCIe (~$1.50/h) for inference; Kaggle notebook (free 30h GPU/week) for LoRA training.

#### Weekdays (25h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Mon May 18 | Provision GPU environment: install `diffusers==0.27`, `peft`, `xformers`, `accelerate`; download Lumina Image 2.0 base weights from HuggingFace (`Alpha-VLLM/Lumina-Image-2.0`); verify basic inference with a test prompt | 5h | Lumina inference confirmed on GPU |
| Tue May 19 | Build self-hosted FastAPI inference service: `POST /generate` accepts `{prompt: str, width: int, height: int, seed: int}` → returns PNG bytes; add `/health` endpoint; Dockerize | 5h | Self-hosted inference endpoint live |
| Wed May 20 | Download **LeX-10K dataset** from HuggingFace; preprocess into `(image, caption)` pairs; write LoRA training config: `rank=16, alpha=32, lr=1e-4, 1000 steps, batch_size=4, gradient_checkpointing=true` | 5h | Dataset ready, config validated |
| Thu May 21 | **Launch LoRA fine-tuning** (start at 9 AM — runs ~10–14h on A100); monitor loss via TensorBoard; adjust lr if loss plateaus after 300 steps | 5h | Training job running, loss decreasing |
| Fri May 22 | Evaluate LoRA output: generate 20 test thumbnails with Vietnamese and English tech text overlays; compare text legibility vs base model; if quality acceptable export adapter weights; if not, adjust config and re-run | 5h | LoRA weights validated (or re-run queued) |

#### Weekend (12h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Sat May 23 | **Frontend quality pass 1 — loading states**: add `Skeleton` components to all data-fetching pages (dashboard, trends, content, pipeline, analytics); replace bare spinners with shimmer skeletons matching layout | 6h | No layout shift on data load |
| Sun May 24 | **Frontend quality pass 1 — error states**: add error boundary at page level, `<ErrorCard>` component for API failures with retry button; handle 401 (redirect to login), 403 (show forbidden), 500 (show error + support contact) consistently across all pages | 6h | All API failure scenarios handled gracefully |

**Week 3 total: 37h**

---

### Week 4 — May 25–31 | Lumina Integration + LinkedIn + Frontend Quality Pass 2
**Goal:** Replace BFL with Lumina; add LinkedIn publish support; complete frontend polish.

#### Weekdays (25h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Mon May 25 | Implement `LuminaClient` in `ai-service/app/clients/lumina_client.py`: call self-hosted inference endpoint, 3x retry with exponential backoff, save image bytes to S3/local storage, return public URL | 5h | Lumina client integrated in ai-service |
| Tue May 26 | **Brand template overlay** with Pillow: load Lumina output, overlay brand logo (top-right corner, 15% width), apply slight dark gradient at bottom for text legibility, render title text (custom font, white, bottom-left) | 5h | Branded thumbnails generated |
| Wed May 27 | Replace BFL in `image_generation.py` with Lumina; update `image_prompt_creation` node to generate Lumina-optimized prompt (positive-only, descriptive, TikTok visual style); resize output to 1080×1350px (4:5), max 20MB JPEG; update S3 upload | 5h | Pipeline uses Lumina end-to-end |
| Thu May 28 | **LinkedIn publish integration**: add `Platform.LINKEDIN` enum; implement `linkedin_client.py` (OAuth2 UGC Posts API: upload image → `POST /v2/assets`, create share → `POST /v2/ugcPosts`); add LinkedIn token management to `UserPlatformToken`; update publish node to route by platform | 5h | LinkedIn publish working |
| Fri May 29 | End-to-end test: full scan → Lumina image → LinkedIn publish; verify image URL resolves from S3 in publish node; test both TikTok and LinkedIn paths through publish pipeline | 5h | Both platforms publish successfully |

#### Weekend (12h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Sat May 30 | **Frontend quality pass 2 — empty states + real-time**: add illustrated empty states to trends, content, pipeline, analytics pages; connect WebSocket `scan.progress` + `post.status` events to live-update cards without page refresh; add toast notifications for pipeline events | 6h | App feels live and responsive |
| Sun May 31 | **AWS CDK — project setup**: create `infrastructure/` CDK app (TypeScript); define `VpcStack` (2 AZs, public + private subnets); `DataStack` (RDS PostgreSQL db.t3.medium, ElastiCache Redis cache.t3.micro); `EcrStack` (3 repos: ai-service, backend, lumina); deploy to `ap-southeast-1` | 6h | VPC + RDS + Redis + ECR provisioned on AWS |

**Week 4 total: 37h**

---

### Week 5 — June 1–7 | Testing + AWS CDK Services + Platform Live Test
**Goal:** Full integration testing; complete AWS CDK ECS + ALB; test live platform publish.

#### Weekdays (25h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Mon June 1 | **LinkedIn API status**: if approved (likely by now) → test live UGC post with real image from S3; if TikTok approved → test TikTok Direct Post; document any platform-specific format adjustments needed | 5h | At least LinkedIn live publish confirmed |
| Tue June 2 | Integration test suite: Human Review Gate (approve → publish, reject → feedback injected into re-generation prompt); Daemon mode (2 complete cycles, verify strategy version increments); all tests committed | 5h | Review gate + daemon mode verified |
| Wed June 3 | Integration test suite: concurrent requests (3 parallel scan triggers); Redis rate limiter enforcement (HN: 30 req/60s); DB connection pool under load (10 concurrent API calls); log analysis for silent errors | 5h | System stable under realistic load |
| Thu June 4 | Bug fixing sprint: address all failures from Mon–Wed tests; fix any Lumina timeout issues; verify TikTok/LinkedIn token refresh under long-running daemon sessions | 5h | All critical bugs resolved |
| Fri June 5 | Update Swagger docs for all new endpoints (Stage 8, LinkedIn, admin); write `RUNBOOK.md` update for AWS deployment; add `healthz` endpoint to ai-service and backend that checks DB + Redis connectivity | 5h | Docs complete, health checks wired |

#### Weekend (12h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Sat June 6 | **AWS CDK — ECS Fargate services**: define `AppStack` with ECS cluster; Fargate task definitions for `ai-service` (2 vCPU, 4GB) and `backend` (1 vCPU, 2GB); ALB with HTTPS listener (ACM cert); target groups with `/healthz` health checks; Secrets Manager for all env vars | 6h | ai-service + backend running on Fargate |
| Sun June 7 | **AWS CDK — Lumina + S3 + CloudFront**: EC2 launch type task with g4dn.xlarge GPU for Lumina inference service; S3 bucket with lifecycle rules (delete raw images after 30 days); CloudFront distribution in front of S3 with signed URLs; update ai-service config to use CDN URLs | 6h | Lumina on GPU EC2, media served via CloudFront |

**Week 5 total: 37h**

---

### Week 6 — June 8–10 | Deploy to AWS + Demo
**Goal:** Push all services to AWS, prepare demo, final thesis checklist.

#### Weekdays (15h)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Mon June 8 | **Deploy to AWS**: `cdk deploy --all`; run Alembic migrations against RDS; run Prisma migrate against RDS app schema; smoke-test all endpoints via ALB DNS; validate Lumina generates images in cloud env | 5h | All services live on AWS |
| Tue June 9 | **Admin panel — final page**: Settings page with global config (quality_threshold slider, review_enabled toggle, daemon interval selector, platform toggles); wire to backend `GET/PATCH /v1/admin/settings`; test strategy rollback UI in analytics | 5h | Admin panel 100% complete |
| Wed June 10 | **Demo preparation**: seed 10 real HN articles, generate 5 Lumina-branded posts, schedule 2 for LinkedIn; record 3-min demo video covering all 8 stages + admin panel; final thesis requirements checklist review | 5h | Project complete, demo recorded |

**Week 6 total: 15h**

---

## Hour Budget Summary

| Week | Period | Weekday | Weekend | Total | Focus |
|------|--------|---------|---------|-------|-------|
| Week 1 | May 4–10 | 25h | 12h | **37h** | Foundation, API submissions, schedule executor, admin scaffold |
| Week 2 | May 11–17 | 25h | 12h | **37h** | Stage 8 (Performance Feedback), admin monitoring + moderation |
| Week 3 | May 18–24 | 25h | 12h | **37h** | Lumina setup + LoRA, frontend loading/error states |
| Week 4 | May 25–31 | 25h | 12h | **37h** | Lumina integration, LinkedIn, frontend empty states + real-time, AWS CDK data layer |
| Week 5 | June 1–7 | 25h | 12h | **37h** | Integration testing, AWS CDK app layer + Lumina GPU |
| Week 6 | June 8–10 | 15h | 0h | **15h** | AWS deploy, admin settings page, demo |
| **Total** | | **140h** | **60h** | **200h** | |

---

## LinkedIn — Primary Platform Backup Plan

**Context:** LinkedIn is the backup platform if TikTok API approval is delayed beyond June 1. LinkedIn API approval is 3–7 days (vs TikTok's 2–4 weeks) making it a much safer fallback.

**Content format adjustments for LinkedIn:**
- Image: 1200×627px (1.91:1 ratio) instead of TikTok's 1080×1350px
- Caption: up to 3000 chars (vs TikTok's 2200) — more room for detailed tech content
- Hashtags: 3–5 (vs TikTok's 5–10) — LinkedIn penalizes hashtag overuse
- No thumbnail overlay required — LinkedIn renders image natively

**Implementation plan (Week 4, Thu May 28):**
```
LinkedIn OAuth2 flow → UserPlatformToken (platform=LINKEDIN)
POST /v2/assets?action=registerUpload  → get upload URL
PUT {uploadUrl} with image bytes       → upload image
POST /v2/ugcPosts with imageAsset URN  → publish post
GET /v2/socialActions/{shareUrn}       → collect metrics (Stage 8)
```

**Trigger condition:** TikTok not approved by May 28 → switch demo platform to LinkedIn entirely. Keep TikTok code in codebase, documented as "pending API approval."

---

## Lumina Image 2.0 — Backup Plan

**Trigger condition:** Self-hosted inference not serving images by May 22 EOD, OR LoRA fine-tuning quality unacceptable after 2 training runs.

| Option | Description | Effort |
|--------|-------------|--------|
| **Replicate API** | Deploy Lumina Image 2.0 to Replicate.com — same model, pay-per-call (~$0.005/image), no GPU management | 4h to integrate |
| **HuggingFace Inference Endpoints** | Deploy base Lumina (no LoRA) to HF Endpoints with T4 GPU — free tier available | 4h to integrate |
| **Thesis justification** | Architecture document specifies self-hosting; cloud GPU endpoint is the deployment implementation — acceptable substitution with documented rationale + cost analysis | 1h to write |

**Decision gate: Friday May 22.** If LoRA weights do not produce legible text on tech thumbnails after 2 training runs, activate Replicate immediately and recover the time for testing.

---

## AWS CDK Architecture

```
Internet
    │
    ▼
Route 53 (optional) → CloudFront (CDN for S3 media)
    │                       │
    ▼                       ▼
ALB (HTTPS, ACM cert)    S3 Bucket (images, reports)
    │
    ├── /api/*  → ECS Fargate: backend (NestJS, 1vCPU/2GB)
    ├── /ai/*   → ECS Fargate: ai-service (FastAPI, 2vCPU/4GB)
    └── /img/*  → ECS EC2 g4dn.xlarge: lumina-inference (GPU)
                         │
                    ┌────┴────┐
                  RDS          ElastiCache
              PostgreSQL 16    Redis 7
              db.t3.medium     cache.t3.micro
              (Multi-AZ)       (single node)

Secrets Manager → all service env vars
ECR → 3 repositories (ai-service, backend, lumina)
```

**CDK stacks in `infrastructure/lib/`:**
- `vpc-stack.ts` — VPC, 2 AZs, public/private subnets, NAT gateway
- `data-stack.ts` — RDS, ElastiCache, Security Groups
- `ecr-stack.ts` — 3 ECR repositories
- `app-stack.ts` — ECS cluster, Fargate services, ALB, target groups
- `lumina-stack.ts` — EC2 launch type with GPU, Lumina service
- `storage-stack.ts` — S3, CloudFront, bucket policies
- `secrets-stack.ts` — Secrets Manager entries for all env vars

**Estimated AWS monthly cost (dev/demo):** ~$120–180/month
(RDS t3.medium ~$50, ElastiCache t3.micro ~$15, g4dn.xlarge on-demand ~$50 if left on, Fargate ~$20, S3+CloudFront ~$5)

---

## Frontend Admin Panel — Scope

| Page | Features | Backend Endpoints Needed |
|------|----------|--------------------------|
| **User Management** | Table: all users, search, role badge, deactivate/activate, promote to admin | `GET /v1/admin/users`, `PATCH /v1/admin/users/:id` |
| **System Monitoring** | Pipeline health cards, scan run history, error log viewer (last 50), WebSocket real-time | `GET /v1/admin/system/health`, existing scan + post APIs |
| **Content Moderation** | All posts across users, status filter, preview modal, force-approve/reject/flag | `GET /v1/admin/posts`, existing `PATCH /v1/posts/:id/status` |
| **Global Settings** | `quality_threshold` slider, `review_enabled` toggle, daemon `interval_hours`, platform enable/disable, strategy rollback button | `GET/PATCH /v1/admin/settings`, `POST /v1/admin/strategy/rollback` |

**Access control:** backend adds `@Roles('admin')` guard on all `/v1/admin/*` routes; frontend `(admin)/layout.tsx` redirects non-admin users to dashboard.

---

## Frontend Pages — Remaining 40% Breakdown

| Page | Missing | Effort |
|------|---------|--------|
| Dashboard | Loading skeletons, error boundary, empty state when no scans yet | 3h |
| Trends | Empty state (no trends yet), filter persistence (URL params), mobile card layout | 4h |
| Content Studio | Form validation on review editor, optimistic UI on status update, image preview lightbox | 4h |
| Content Detail `/content/[id]` | Error state (post not found), websocket progress for in-progress generation, mobile layout | 3h |
| Pipeline Board | Real-time column updates via WebSocket (already partially done in uncommitted files), drag-to-approve action | 4h |
| Schedule | Real feedback when cron expression is invalid, confirmation modal before delete, next-fire-time display | 3h |
| Analytics | Real engagement data from Stage 8 metrics, strategy version timeline chart, format performance bar chart | 5h |
| Settings / Accounts | LinkedIn OAuth connect button + disconnect + token expiry warning (alongside TikTok) | 4h |
| **Total** | | **~30h across weekends** |

---

## Immediate Actions (May 4, 2026)

- [ ] **Submit LinkedIn developer app** at linkedin.com/developers → Create app → request `w_member_social`, `r_liteprofile` → submit (3–7 day approval, much faster than TikTok)
- [ ] **Submit TikTok developer app** at developers.tiktok.com → request `video.publish` + `video.upload` → submit (2–4 week approval)
- [ ] **Arrange GPU access** for Week 3: RunPod account + $30 credit, OR verify Kaggle GPU quota (30h/week free)
- [ ] **Commit uncommitted files**: `frontend/src/components/pipeline/card.tsx`, `frontend/src/components/pipeline/detail-sheet.tsx`, `frontend/src/hooks/use-pipeline-board.ts`

---

## Thesis Requirements Checklist (final review gate)

### AI Pipeline
- [ ] Orchestrator Router Workflow — conditional routing, rule-based (no LLM for routing)
- [ ] Trending Scanner — crawl → quality filtering (4 criteria, 1–10 score) → deep analysis (sentiment, lifecycle, TikTok angles) → `.md` report + processed JSON files
- [ ] Post Generation — 7 formats, strategy alignment, auto-review loop (score < 7 → revise, max 2 retries)
- [ ] Visual Factory — Lumina Image 2.0 self-hosted + LoRA fine-tuned on LeX-10K + brand template overlay + platform resize
- [ ] Publish Post — golden hour scheduling + platform Direct Post + 2 modes (auto/manual) + TikTok token refresh
- [ ] Performance Feedback Agent — 24h async cron → platform metrics → strategy versioning (max 2 changes/cycle, min 5 posts, rollback support)
- [ ] Human Review Gate — WebSocket notification → approve/reject with feedback injected into re-generation
- [ ] Daemon mode — continuous pipeline, configurable interval, change from dashboard

### Infrastructure
- [ ] Scan schedule executor — cron expressions trigger scans automatically
- [ ] AWS CDK — VPC, RDS, Redis, ECS Fargate (backend + ai-service), EC2 GPU (Lumina), S3, CloudFront, ALB
- [ ] All services live on AWS with health checks passing

### Frontend
- [ ] All existing pages: loading skeletons, error states, empty states, real-time WebSocket updates, mobile responsive
- [ ] Admin Panel: User Management, System Monitoring, Content Moderation, Global Settings
- [ ] Settings page: LinkedIn + TikTok OAuth connect/disconnect, token status

### Platform Integration
- [ ] LinkedIn or TikTok live publish confirmed (screenshot + post URL as evidence)
- [ ] Stage 8 metrics collection working from live platform API
- [ ] Strategy version history visible in analytics page

### Demo
- [ ] End-to-end demo video covering all 8 pipeline stages
- [ ] Admin panel demo showing user management + content moderation
- [ ] AWS architecture diagram with actual deployed resource ARNs
