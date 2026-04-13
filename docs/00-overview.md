# Tong Quan He Thong — AI Marketing TikTok Content Pipeline

## 1. Van de can giai quyet

Cac chuyen gia cong nghe va content creator ton **2-3 gio/ngay** de:
- Tim kiem xu huong cong nghe thu cong tren nhieu nguon
- Viet bai social media: thought leadership, industry insights
- Tao hinh anh va noi dung truc quan cho mang xa hoi
- Len lich dang bai vao thoi diem toi uu

**Muc tieu:** Xay dung he thong AI tu dong hoa viec:
- Thu thap xu huong cong nghe tu Hacker News (nguon tin cay)
- Phan tich va xep hang xu huong theo do phu hop
- Tao bai dang TikTok voi hinh anh va caption tu dong
- Tu dong xem xet chat luong va dang bai vao "golden hour"

---

## 2. Kien truc tong the — Three-Tier Architecture

He thong su dung kien truc 3 tang voi 3 LangGraph pipelines:

```
Pipeline 1: HN Scanner → Trend Analyzer → Content Saver → Persist → [conditional] → Pipeline 2
Pipeline 2: Strategy → Content Gen → Image Gen → Auto-Review → [revision loop] → Output
Pipeline 3: Validate → Golden Hour → Scheduler → [conditional] → TikTok Publish
```

### So do kien truc phan tang

```
PRESENTATION    Frontend — Next.js 14 (:3001)
                Dashboard | Trends | Content | Media | Schedule | Analytics | Settings
                              |
API GATEWAY     Backend — NestJS (:3000)
                REST + WebSocket | JWT Auth | Google OAuth | Rate Limiting
                              |
AI ENGINE       AI Service — FastAPI + LangGraph (:8000)
                Pipeline 1: Trend Scan | Pipeline 2: Post Gen | Pipeline 3: Publish
                              |
DATA LAYER      PostgreSQL 16                   Redis 7
                ai schema: trends, posts,       Cache | Rate Limit |
                published_posts                 APScheduler Jobs
                app schema: users, auth
                              |
EXTERNAL        OpenAI GPT-4o    HackerNews    BFL (Images)    TikTok API
                Analysis &       Firebase API   Image Gen       OAuth + Publish
                Content Gen
```

### Bang mo ta cac layer he thong

| Layer | Technology | Mo ta |
|-------|-----------|-------|
| **Frontend** | Next.js 14 + Tailwind + shadcn/ui | Dashboard, content management, real-time updates |
| **Backend** | NestJS + Prisma + Passport | API gateway, JWT auth, WebSocket, proxy to ai-service |
| **AI Service** | FastAPI + LangGraph | 3 pipelines: scan, generate, publish |
| **LLM** | GPT-4o (OpenAI) | Analyzer, content gen, auto-review (5 config presets) |
| **Image Gen** | BFL (Black Forest Labs) | TikTok post images |
| **Database** | PostgreSQL 16 (multi-schema) | `ai` schema (Alembic) + `app` schema (Prisma) |
| **Cache** | Redis 7 | Rate limiting, caching, APScheduler job store |
| **Data Source** | Hacker News | Top stories via Firebase API |
| **Target Platform** | TikTok | Photo post publishing with golden hour scheduling |

---

## 3. Pipeline Stages

### Pipeline 1 — Trend Scanning

| # | Stage | Node | Mo ta | Output |
|---|-------|------|-------|--------|
| 1 | **HN Crawling** | hackernews_scanner | Crawl top stories tu HN Firebase API, extract full article text, loc theo tech relevance | List items {title, content, score, comments} |
| 2 | **Collect** | collect_results | Validate va merge results, log statistics | Merged raw_results |
| 3 | **Analysis** | trend_analyzer | GPT-4o: quality scoring (1-10), discard < 5, deep analysis (sentiment, lifecycle, engagement_prediction), Vietnamese report + content angles JSON | Analyzed trends + report |
| 4 | **Content Save** | content_saver | Luu articles dang markdown vao reports/{scan_id}/articles/ | File paths |
| 5 | **Persist** | persist_results | Luu analyzed trends vao PostgreSQL, tao ContentPosts | DB records |

### Pipeline 2 — Post Generation

| # | Stage | Node | Mo ta | Output |
|---|-------|------|-------|--------|
| 1 | **Strategy** | strategy_alignment | Load trends, report, strategy config. Select trends + angles + formats | Content plan |
| 2 | **Content Gen** | content_generation | Generate TikTok captions (7 formats), hooks, CTA, hashtags | Draft posts |
| 3 | **Image Prompt** | image_prompt_creation | Generate BFL image prompts per format | Image prompts |
| 4 | **Image Gen** | image_generation | Call BFL API, save images to storage | Image paths |
| 5 | **Auto-Review** | auto_review | Score on 7 weighted criteria (hook, value, data, strategy, originality, CTA, format) | Scores + feedback |
| 6 | **Router** | review_router | score < 7 & revision < 2 → revise; else → package | Route decision |
| 7 | **Package** | output_packaging | Build final JSON, enrich metadata, save to storage + PostgreSQL | ContentPosts |

### Pipeline 3 — Publish Post

| # | Stage | Node | Mo ta | Output |
|---|-------|------|-------|--------|
| 1 | **Validate** | resolve_and_validate | Load ContentPost, check status, resolve image URL, validate TikTok token | Validated state |
| 2 | **Golden Hour** | golden_hour | Calculate optimal posting time from EngagementTimeSlot data | Schedule decision |
| 3 | **Scheduler** | scheduler | Decide: publish now or schedule via APScheduler | publish_now / scheduled |
| 4 | **Publish** | publish_node | Call TikTok API (photo post), poll status, retry (3x) | PublishedPost |

---

## 4. Tech Stack

| Layer | Technology | Version | Ly do chon |
|-------|-----------|---------|------------|
| **Frontend** | Next.js | 14.x | App Router, React 18, SSR |
| **Frontend UI** | shadcn/ui + Tailwind | — | Accessible, themeable components |
| **Frontend State** | Zustand + TanStack Query | 5.x | Client + server state management |
| **Backend** | NestJS | 10.x | Modular, TypeScript-native, Passport auth |
| **Backend ORM** | Prisma | 6.x | Type-safe, multi-schema support |
| **AI Service** | FastAPI | 0.115.x | Python-native cho LangGraph |
| **Agent Framework** | LangGraph | 1.x | Stateful graphs, conditional routing |
| **LLM** | GPT-4o (OpenAI) | latest | 5 config presets (analyzer → content gen) |
| **Image Gen** | BFL (Black Forest Labs) | — | High-quality image generation |
| **Database** | PostgreSQL | 16.x | Multi-schema, ACID, async via asyncpg |
| **ORM (AI)** | SQLAlchemy + Alembic | 2.x | Async support, migrations |
| **Cache** | Redis | 7.x | Rate limiting, caching, APScheduler |
| **Publishing** | TikTok API | v2 | Photo post publishing + OAuth |
| **Containerization** | Docker + Docker Compose | — | Dev environment |

---

## 5. Cau truc thu muc du an

```
marketing-content/
├── docs/                           # Tai lieu thiet ke
│   ├── features/                   # Chi tiet tung feature
│   └── *.md                        # Tong quan, roadmap, API, diagrams
├── ai-service/                     # FastAPI + LangGraph (active)
│   ├── app/
│   │   ├── agents/
│   │   │   ├── supervisor.py       # Pipeline 1: Trend scan graph
│   │   │   ├── state.py            # TrendScanState TypedDict
│   │   │   ├── trend_analyzer.py   # GPT-4o analysis + report
│   │   │   ├── content_saver.py    # Save articles as markdown
│   │   │   ├── scanners/           # HackerNews scanner
│   │   │   ├── post_generator/     # Pipeline 2: Post generation
│   │   │   │   ├── graph.py        # LangGraph pipeline builder
│   │   │   │   └── nodes/          # 6 nodes (strategy → package)
│   │   │   └── publish_post/       # Pipeline 3: TikTok publish
│   │   │       ├── graph.py        # LangGraph pipeline builder
│   │   │       └── *.py            # Nodes: validate, golden_hour, publish, schedule
│   │   ├── tools/                  # HackerNews Firebase API wrapper
│   │   ├── clients/                # OpenAI, BFL, TikTok, Firecrawl
│   │   ├── core/                   # Cache, rate limiter, dedup, retry, storage
│   │   ├── db/                     # SQLAlchemy models + session
│   │   ├── api/v1/                 # REST endpoints (scan, trends, posts, publish, auth)
│   │   └── main.py                 # FastAPI app
│   ├── alembic/                    # Database migrations (ai schema)
│   └── pyproject.toml
├── backend/                        # NestJS API gateway (active)
│   ├── src/
│   │   ├── auth/                   # JWT + Google OAuth
│   │   ├── scans/                  # Scan management
│   │   ├── trends/                 # Trend queries
│   │   ├── posts/                  # Content post management
│   │   ├── publish/                # Publishing orchestration
│   │   ├── reports/                # Report retrieval
│   │   ├── tiktok-auth/            # TikTok OAuth flow
│   │   ├── status/                 # WebSocket gateway
│   │   ├── ai-service/             # HTTP client to ai-service
│   │   └── prisma/                 # DB client module
│   ├── prisma/                     # Schema + migrations (app schema)
│   ├── docker/init-db.sql          # DB role bootstrap
│   └── package.json
├── frontend/                       # Next.js 14 dashboard (active)
│   ├── src/
│   │   ├── app/(auth)/             # Login, Register pages
│   │   ├── app/(app)/              # Protected pages (dashboard, trends, content, etc.)
│   │   ├── components/             # UI components
│   │   ├── hooks/api/              # TanStack Query hooks
│   │   ├── stores/                 # Zustand stores
│   │   └── lib/                    # API client, utils
│   └── package.json
└── docker-compose.yml              # Full stack orchestration
```

---

## 6. Gioi han pham vi (Out of scope)

- Chi ho tro HackerNews lam nguon du lieu (khong YouTube, Google News, Twitter, etc.)
- Chi tap trung vao TikTok lam nen tang dang bai
- Khong tao/phan tich video (chi photo posts)
- Khong trien khai o quy mo enterprise
- LinkedIn publishing: chua trien khai (chi TikTok)
- Monitoring/observability: chua co (error tracking, metrics)
- Production cloud deployment: chua trien khai

---

## 7. Feature Index

| Feature | Doc | Stage | Status |
|---------|-----|-------|--------|
| Trend Discovery (HN) | [F02](features/F02-trend-discovery.md) | Pipeline 1 | Done |
| Trend Analysis | [F03](features/F03-trend-analysis.md) | Pipeline 1 | Done |
| Report Generation | [F04](features/F04-report-generation.md) | Pipeline 1 | Done |
| Post Generation (TikTok) | [07-post-generation-agent.md](07-post-generation-agent.md) | Pipeline 2 | Done |
| TikTok Publishing | [08-publish-post-agent.md](08-publish-post-agent.md) | Pipeline 3 | Done |
| Backend API Layer | [09-backend-api-layer.md](09-backend-api-layer.md) | Backend | Done |
| Frontend Dashboard | [05-frontend-ux.md](05-frontend-ux.md) | Frontend | Done |
