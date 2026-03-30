# Tong Quan He Thong — AI Marketing Multi-Agent System

## 1. Van de can giai quyet

Cac doanh nghiep nho (SMB) va content creator ca nhan ton **3-5 gio/ngay** de:
- Tim kiem xu huong thu cong tren TikTok, Facebook, Google
- Viet caption, hashtag, script cho tung nen tang
- Tao hinh anh minh hoa
- Len lich va dang bai dung gio
- Theo doi hieu qua va dieu chinh chien luoc

**Muc tieu:** Xay dung he thong AI Multi-Agent tu dong hoa toan bo pipeline marketing noi dung end-to-end, bao gom:
- Thu thap, phan tich xu huong va tao bao cao xu huong toan dien (Trending Scanner Agent)
- Sinh noi dung tu dong (caption, hashtag, script) da phong cach, da nen tang
- Tao hinh anh tu dong voi brand template
- Kiem duyet chat luong noi dung bang AI (auto-review loop)
- Len lich dang bai toi uu va tu dong dang len cac nen tang
- Thu thap hieu qua bai dang va tu dong dieu chinh chien luoc noi dung
- Orchestrator Agent dieu phoi toan bo pipeline theo mo hinh Router Workflow

---

## 2. Kien truc tong the — Router Workflow

He thong su dung kien truc **Multi-Agent voi Orchestrator Agent trung tam** hoat dong theo mo hinh **Router Workflow**. Orchestrator khong tu thuc hien tac vu ma phan loai trang thai hien tai cua pipeline, sau do dinh tuyen (route) den dung agent chuyen trach de xu ly. Sau khi agent hoan thanh, ket qua quay ve Orchestrator de quyet dinh buoc tiep theo.

### Tai sao chon Router Workflow?

- Pipeline co luong tuan tu ro rang nhung can re nhanh linh hoat: dung cho human review, bo qua stage, hoac quay lai stage truoc
- Router dung logic **rule-based** (khong dung LLM cho routing) — giam chi phi va tang toc do
- Ho tro human-in-the-loop tu nhien: kiem tra trang thai "pending_review" va tam dung pipeline
- De mo rong: them agent chi can them node va dieu kien route
- Ho tro 2 che do: one-time va daemon lien tuc

### So do kien truc phan tang

```
PRESENTATION    Frontend Layer — Next.js
                Dashboard: Trend List | Content Review | Schedule Calendar | Analytics
                              |
API GATEWAY     Backend API — NestJS
                REST Endpoints | Auth | WebSocket Real-time Status
                              |
AI ENGINE       AI Orchestrator — FastAPI + LangGraph
                Pipeline Orchestration | LLM Calls | Graph-based Router Workflow
                              |
ORCHESTRATOR    Orchestrator Agent — Router Workflow
                Classify State -> Route to Agent | Content Pool | Human Review Gate
                      |                |                |
AGENTS          Trending Scanner    Post Generator    Publisher & Analyzer
                Crawl, Analyze      Content & Media   Publish & Feedback
                & Report
                              |
DATA LAYER      PostgreSQL              Redis + Bull          AWS S3
                Users | Posts |         Queue | Cache         Media & Reports
                Strategy | Content Pool
                              |
EXTERNAL        AI APIs                 Social Platforms
                OpenAI | Stability AI   Meta | TikTok | LinkedIn
```

### Bang mo ta cac layer he thong

| Layer | Technology | Mo ta |
|-------|-----------|-------|
| **Frontend** | Next.js | Dashboard quan ly: trend list, content review, schedule calendar, analytics |
| **Backend API** | NestJS | REST endpoints, authentication, WebSocket real-time status |
| **AI Engine** | FastAPI + LangGraph | Pipeline orchestration, LLM calls, graph-based router workflow |
| **Orchestrator** | LangGraph Router | Router Workflow: phan loai state, dinh tuyen agent, content pool, human review gate, daemon/one-time |
| **Database** | PostgreSQL | Users, posts, strategies, analytics, trend data, content pool |
| **Cache + Queue** | Redis (Bull) | Task queue cho scheduling, caching prompt tuong tu |
| **Storage** | AWS S3 | Luu tru media assets va file bao cao trend |
| **External APIs** | OpenAI, Stability AI, Meta, TikTok | LLM, image generation, social platform APIs |

---

## 3. 3 Nhom Agent Chuyen Trach

| Nhom | Agent | Stages | Chuc nang |
|------|-------|--------|-----------|
| **Trending Scanner** | Trending-Scanner | Stage 1-2-3 | Thu thap, phan tich xu huong, tao bao cao |
| **Post Generation** | Post-Generation | Stage 4-5 | Sinh noi dung (caption, hashtag, script) + tao hinh anh |
| **Publish & Feedback** | Publish-Post + Performance-Upgrade | Stage 6-7-8 | Len lich, dang bai tu dong, thu thap metrics |

---

## 4. Core Pipeline (8 giai doan)

| # | Stage | Agent | Mo ta | Output |
|---|-------|-------|-------|--------|
| 1 | **Trend Discovery** | Trending-Scanner | Crawl du lieu tu Google Trends, TikTok, Instagram, Twitter/X | List trends tho {topic, volume, platform, region} |
| 2 | **Trend Analysis** | Trending-Scanner | LLM phan tich engagement, sentiment, lifecycle. Xep hang | Trends da xep hang {topic, score, sentiment, lifecycle} |
| 3 | **Report Generation** | Trending-Scanner | Tao bao cao xu huong (.md) — dau vao cho Content Generation | File bao cao tren S3, metadata, tom tat JSON |
| 4 | **Content Generation** | Post-Generation | LLM doc bao cao, sinh caption, hashtag, script. Luu Content Pool | Noi dung {caption, hashtags, script}, bien the platform |
| 5 | **Media Creation** | Post-Generation | API tao anh, ghep brand template, resize. Luu Content Pool | File anh raw + branded, URL S3 |
| 6 | **Scheduling** | Publish-Post | Phan tich khung gio vang. Len lich dang toi uu | Lich dang, gio vang, task Redis queue |
| 7 | **Auto Publish** | Publish-Post | Goi API dang bai tu dong. Cross-post da nen tang | ID bai da dang, trang thai, thoi gian |
| 8 | **Performance Feedback** | Performance-Upgrade | (Async) Thu thap metrics sau 24h. Cap nhat Strategy | Bao cao hieu qua, strategy v(N+1) |

### 2 Che do Pipeline

**Che do 1: Hoan toan tu dong** — Noi dung tu Stage 4-5 di thang den Scheduling va Publish khong can human review.

**Che do 2: Co Human Review Gate** — Sau Stage 5 (Media Creation), Orchestrator tam dung va cho user duyet tren Dashboard. Reject → quay lai Stage 4 voi feedback.

---

## 5. Luong giao tiep giua cac Agent

Tat ca Agent giao tiep thong qua Orchestrator Agent, **khong giao tiep truc tiep voi nhau**:

- **Router Workflow (LangGraph):** Orchestrator la node trung tam trong StateGraph. Sau moi agent hoan thanh, luong quay ve Orchestrator.
- **Shared State:** Moi node doc/ghi vao state chung. Orchestrator kiem tra `current_stage`, `content_pool_status`, `human_review_status` de route.
- **Content Pool:** Noi dung luu vao PostgreSQL. Orchestrator chi route den Publish khi co noi dung da duyet.
- **Human Review Gate:** Orchestrator chuyen sang "pending_review" va cho user duyet. Co the tat de chay hoan toan tu dong.
- **Async Feedback Loop:** Performance Upgrade Agent chay doc lap, khong block main pipeline.

---

## 6. Tech Stack

| Layer | Technology | Version | Ly do chon |
|-------|-----------|---------|------------|
| **Frontend** | Next.js (App Router) | 15.x | RSC + SSR |
| **UI Components** | shadcn/ui + Tailwind CSS | latest | Ready-to-use, dark mode, accessible |
| **Backend API** | NestJS | 10.x | TypeScript, modular DI |
| **AI Service** | FastAPI | 0.115.x | Python-native cho LangGraph/LangChain |
| **Agent Framework** | LangGraph | 1.x | Stateful graphs, human-in-the-loop, checkpointing |
| **LLM chinh** | Claude Sonnet 4.6 | latest | Hieu nang cao, context dai |
| **Image Generation** | DALL-E 3 (OpenAI) | — | Chat luong cao, API don gian |
| **Image Gen backup** | Stability AI | SD 3.5 | Chi phi thap hon |
| **Database** | PostgreSQL | 16.x | ACID |
| **ORM (Backend)** | Prisma | 5.x | Type-safe migrations, NestJS integration |
| **ORM (AI Service)** | SQLAlchemy + Alembic | 2.x | Python standard |
| **Job Queue** | BullMQ + Redis | 5.x | Scheduling, retry logic, rate limiting |
| **Media Storage** | AWS S3 (hoac Cloudflare R2) | — | Object storage cho anh generated |
| **LLM Observability** | LangSmith | — | Debug traces, prompt management |
| **Real-time** | WebSocket (NestJS Gateway) | — | Pipeline status live updates |
| **Containerization** | Docker + Docker Compose | — | Dev & prod environment |
| **Auth** | JWT + Passport.js | — | NestJS standard |

---

## 7. Cau truc thu muc du an

```
marketing-content/
├── docs/                           # Tai lieu thiet ke
│   ├── features/                   # Chi tiet tung feature (F01-F10)
│   └── *.md                        # Tong quan, roadmap, schema, API, UX
├── frontend/                       # Next.js 15 App (planned)
├── backend/                        # NestJS API (planned)
├── ai-service/                     # FastAPI + LangGraph (active)
│   ├── app/
│   │   ├── agents/
│   │   │   ├── supervisor.py       # LangGraph graph builder
│   │   │   ├── state.py            # TrendScanState TypedDict
│   │   │   ├── analyzer.py         # Claude-powered analysis
│   │   │   └── scanners/           # 6 platform scanner nodes
│   │   ├── tools/                  # Platform API wrappers
│   │   ├── core/                   # Cache, rate limiter, dedup, retry
│   │   ├── db/                     # SQLAlchemy models + session
│   │   ├── api/v1/                 # REST endpoints
│   │   └── main.py                 # FastAPI app
│   ├── alembic/                    # Database migrations
│   └── pyproject.toml
└── docker-compose.yml
```

---

## 8. Gioi han pham vi (Out of scope)

- Khong tao/phan tich video dai (>60 giay)
- Khong trien khai o quy mo enterprise (>1000 nguoi dung)
- Twitter/X API khong uu tien (chi phi cao)
- Khong co tinh nang paid advertising management
- TikTok publishing la stretch goal (API phuc tap)

---

## 9. Feature Index

Xem chi tiet tung feature tai [docs/features/](features/):

| Feature | Doc | Agent | Stage |
|---------|-----|-------|-------|
| Orchestrator Router | [F01](features/F01-orchestrator-router.md) | Orchestrator | — |
| Trend Discovery | [F02](features/F02-trend-discovery.md) | Trending-Scanner | 1 |
| Trend Analysis | [F03](features/F03-trend-analysis.md) | Trending-Scanner | 2 |
| Report Generation | [F04](features/F04-report-generation.md) | Trending-Scanner | 3 |
| Content Generation | [F05](features/F05-content-generation.md) | Post-Generation | 4 |
| Media Creation | [F06](features/F06-media-creation.md) | Post-Generation | 5 |
| Scheduling | [F07](features/F07-scheduling.md) | Publish-Post | 6 |
| Auto Publish | [F08](features/F08-auto-publish.md) | Publish-Post | 7 |
| Performance Feedback | [F09](features/F09-performance-feedback.md) | Performance-Upgrade | 8 |
| Human Review Gate | [F10](features/F10-human-review-gate.md) | Orchestrator | — |
