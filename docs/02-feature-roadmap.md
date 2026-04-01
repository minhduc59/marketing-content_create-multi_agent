# Feature Roadmap — LinkedIn Technology Content Pipeline

## Tổng quan tiến độ

```
Phase 1 (Done)          Phase 2 (Planned)         Phase 3 (Planned)
│                       │                         │
├─ HackerNews Crawler  ─┼─ LinkedIn Content Gen  ─┼─ LinkedIn Publishing ─│
├─ AI Analysis         ─┤─ Content Review UI     ─┤─ Analytics           ─│
└─ Report Generation   ─┘                        ─┘                     ─┘
```

---

## Phase 1 — HackerNews → Analysis → Reports (DONE)

**Focus:** Crawl HackerNews, analyze with GPT-4o, generate LinkedIn-focused reports.

### AI Service (FastAPI + LangGraph)
- [x] FastAPI project setup
- [x] LangGraph linear pipeline
- [x] HackerNews scanner (Firebase API, article crawling, tech filtering)
- [x] GPT-4o analyzer (categorization, sentiment, lifecycle, LinkedIn relevance scoring)
- [x] Content saver (markdown articles to content/hackernews/)
- [x] Reporter (Vietnamese LinkedIn report + content angles JSON)
- [x] Database persistence (ScanRun, TrendItem, TrendComment)
- [x] REST API (scan, trends, reports, schedule)
- [x] Redis rate limiting + caching
- [x] Docker Compose (PostgreSQL + Redis)
- [x] Alembic migrations

---

## Phase 2 — LinkedIn Content Generation (Planned)

**Focus:** Auto-generate LinkedIn posts/articles from analyzed trends.

### AI Service
- [ ] LinkedIn content generator agent
  - [ ] linkedin_post (short-form thought leadership)
  - [ ] linkedin_article (long-form analysis)
  - [ ] linkedin_carousel (multi-slide)
  - [ ] Writing styles: thought_leadership, professional, educational, data_driven
- [ ] Content review/approval workflow
- [ ] Content pool management (draft → approved → published)

### Frontend (Next.js)
- [ ] Dashboard: trend list, report viewer
- [ ] Content editor with LinkedIn preview
- [ ] Approve/reject/edit workflow

---

## Phase 3 — LinkedIn Publishing & Analytics (Planned)

**Focus:** Auto-publish to LinkedIn, collect metrics, optimize strategy.

### Backend (NestJS)
- [ ] LinkedIn OAuth integration
- [ ] LinkedIn API publishing (ugcPosts, shares)
- [ ] Scheduling (optimal posting times)
- [ ] Analytics collection

### AI Service
- [ ] Performance analysis agent
- [ ] Strategy optimization feedback loop

---

## Technical Priorities

| Priority | Item | Status |
|----------|------|--------|
| P0 | HackerNews crawler | Done |
| P0 | GPT-4o analysis (LinkedIn focus) | Done |
| P0 | Report generation (Vietnamese) | Done |
| P0 | REST API + Database | Done |
| P1 | LinkedIn content generation | Planned |
| P1 | Frontend dashboard | Planned |
| P2 | LinkedIn publishing | Planned |
| P2 | Analytics & feedback | Planned |
