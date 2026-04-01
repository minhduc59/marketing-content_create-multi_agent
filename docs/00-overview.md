# Tong Quan He Thong — AI Marketing LinkedIn Content Pipeline

## 1. Van de can giai quyet

Cac chuyen gia cong nghe va content creator ton **2-3 gio/ngay** de:
- Tim kiem xu huong cong nghe thu cong tren nhieu nguon
- Viet bai LinkedIn: thought leadership, industry insights
- Theo kip cac phat trien moi trong nganh
- Tao noi dung chuyen nghiep cho LinkedIn

**Muc tieu:** Xay dung he thong AI tu dong hoa viec:
- Thu thap xu huong cong nghe tu Hacker News (nguon tin cay)
- Phan tich va xep hang xu huong theo do phu hop voi LinkedIn
- Tao bao cao xu huong va goi y noi dung LinkedIn
- Luu tru du lieu de ho tro viec tao noi dung

---

## 2. Kien truc tong the — Linear Pipeline

He thong su dung kien truc **LangGraph Linear Pipeline** don gian va hieu qua:

```
START → HackerNews Scanner → Collect Results → Analyzer → Content Saver → Reporter → Persist → END
```

### So do kien truc phan tang

```
PRESENTATION    Frontend Layer — Next.js (planned)
                Dashboard: Trend List | Content Review | Reports
                              |
API GATEWAY     Backend API — NestJS (planned)
                REST Endpoints | Auth
                              |
AI ENGINE       AI Service — FastAPI + LangGraph
                Pipeline: HN Scan → Analysis → Save → Report → DB
                              |
DATA LAYER      PostgreSQL              Redis
                Trends | Reports |      Rate Limit | Cache
                Scan History
                              |
EXTERNAL        OpenAI GPT-4o           Hacker News Firebase API
                Analysis & Reports      Technology Trends
```

### Bang mo ta cac layer he thong

| Layer | Technology | Mo ta |
|-------|-----------|-------|
| **AI Service** | FastAPI + LangGraph | Pipeline: crawl HN → analyze → save → report |
| **LLM** | GPT-4o (OpenAI) | Analyzer (temp=0), Reporter (temp=0.3) |
| **Database** | PostgreSQL 16 + SQLAlchemy 2.0 | Trend items, scan runs, reports |
| **Cache** | Redis 7 | Rate limiting, response caching |
| **Target Platform** | LinkedIn | Thought leadership, tech content |
| **Data Source** | Hacker News | Top stories via Firebase API |

---

## 3. Pipeline Stages

| # | Stage | Node | Mo ta | Output |
|---|-------|------|-------|--------|
| 1 | **HN Crawling** | hackernews_scanner | Crawl top stories tu HN Firebase API, extract full article text, loc theo tech relevance | List items {title, content, score, comments} |
| 2 | **Collect** | collect_results | Validate va merge results, log statistics | Merged raw_results |
| 3 | **Analysis** | analyzer | GPT-4o phan tich: category, sentiment, lifecycle, relevance_score cho LinkedIn | Analyzed trends with scores |
| 4 | **Content Save** | content_saver | Luu articles dang markdown vao content/hackernews/{date}/ | File paths |
| 5 | **Report** | reporter | Tao bao cao xu huong (.md) va content angles (.json) bang tieng Viet cho LinkedIn | Report files |
| 6 | **Persist** | persist_results | Luu analyzed trends vao PostgreSQL | DB records |

---

## 4. Tech Stack

| Layer | Technology | Version | Ly do chon |
|-------|-----------|---------|------------|
| **AI Service** | FastAPI | 0.115.x | Python-native cho LangGraph |
| **Agent Framework** | LangGraph | 1.x | Stateful graphs, checkpointing |
| **LLM** | GPT-4o (OpenAI) | latest | Analyzer (4096 tokens), Reporter (8192 tokens) |
| **Database** | PostgreSQL | 16.x | ACID, async via asyncpg |
| **ORM** | SQLAlchemy + Alembic | 2.x | Async support, migrations |
| **Cache** | Redis | 7.x | Rate limiting, response caching |
| **HTTP Client** | httpx | 0.28.x | Async HTTP for HN API |
| **Containerization** | Docker + Docker Compose | — | Dev environment |

---

## 5. Cau truc thu muc du an

```
marketing-content/
├── docs/                           # Tai lieu thiet ke
│   ├── features/                   # Chi tiet tung feature
│   └── *.md                        # Tong quan, roadmap, API
├── ai-service/                     # FastAPI + LangGraph (active)
│   ├── app/
│   │   ├── agents/
│   │   │   ├── supervisor.py       # LangGraph pipeline builder
│   │   │   ├── state.py            # TrendScanState TypedDict
│   │   │   ├── analyzer.py         # GPT-4o analysis (LinkedIn + Tech focus)
│   │   │   ├── content_saver.py    # Save .md to content/hackernews/
│   │   │   ├── reporter.py         # Vietnamese LinkedIn report
│   │   │   └── scanners/
│   │   │       ├── base.py         # BaseScannerNode ABC
│   │   │       └── hackernews.py   # HackerNews scanner
│   │   ├── tools/
│   │   │   └── hackernews_tool.py  # HN Firebase API wrapper
│   │   ├── core/                   # Cache, rate limiter, dedup, retry
│   │   ├── db/                     # SQLAlchemy models + session
│   │   ├── api/v1/                 # REST endpoints
│   │   └── main.py                 # FastAPI app
│   ├── alembic/                    # Database migrations
│   ├── content/                    # Saved articles
│   ├── reports/                    # Generated reports
│   └── pyproject.toml
├── backend/                        # NestJS API (planned)
└── frontend/                       # Next.js 15 (planned)
```

---

## 6. Gioi han pham vi (Out of scope)

- Chi ho tro HackerNews lam nguon du lieu (khong YouTube, Google News, Twitter, etc.)
- Chi tap trung vao LinkedIn va linh vuc Cong Nghe
- Khong tao/phan tich video
- Khong trien khai o quy mo enterprise
- APScheduler / ScanSchedule: bang da co trong DB nhung chua ket noi voi scheduler
- Frontend va Backend API: planned cho sprint tiep theo

---

## 7. Feature Index

| Feature | Doc | Stage |
|---------|-----|-------|
| Trend Discovery (HN) | [F02](features/F02-trend-discovery.md) | 1 |
| Trend Analysis | [F03](features/F03-trend-analysis.md) | 2-3 |
| Report Generation | [F04](features/F04-report-generation.md) | 4-5 |
