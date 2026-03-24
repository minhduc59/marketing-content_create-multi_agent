# Feature Roadmap — 3 Tháng (Tháng 1–3/2026)

## Tổng quan tiến độ

```
Tháng 1                  Tháng 2                    Tháng 3
│                        │                          │
├─ Sprint 1 ─┬─ Sprint 2 ─┼─ Sprint 3 ─┬─ Sprint 4 ─┼─ Sprint 5 ─┬─ Sprint 6 ─┬─ Sprint 7 ─│
│  Setup &   │  Trend     │  Content   │  Media     │  Schedule  │  Analytics │  Polish &  │
│  Arch      │  Discovery │  Gen       │  Creation  │  & Publish │  & Feedback│  Testing   │
└────────────┴────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘
  Tuần 1-2    Tuần 3-4    Tuần 5-6    Tuần 7-8    Tuần 9-10   Tuần 11     Tuần 12
```

---

## Sprint 1 — Setup & Architecture (Tuần 1–2, Tháng 1)

**Mục tiêu:** Hoàn thành kiến trúc hệ thống, scaffold toàn bộ dự án, setup dev environment.

### Backend (NestJS)
- [ ] Khởi tạo NestJS project với module structure
- [ ] Cài đặt Prisma + kết nối PostgreSQL
- [ ] Auth module (JWT + Passport.js, register/login endpoints)
- [ ] Prisma schema: Users, IndustryKeywords (xem `03-database-schema.md`)
- [ ] WebSocket Gateway setup

### Frontend (Next.js)
- [ ] Khởi tạo Next.js 15 App Router
- [ ] Cài đặt shadcn/ui + Tailwind CSS
- [ ] Layout: sidebar navigation + header
- [ ] Auth pages: login, register
- [ ] Protected routes với middleware

### AI Service (FastAPI)
- [ ] Khởi tạo FastAPI project
- [ ] Kết nối Anthropic SDK (Claude Sonnet 4.6)
- [ ] LangGraph scaffold: Supervisor graph
- [ ] PostgreSQL checkpointer setup (LangGraph state persistence)
- [ ] LangSmith tracing config

### Infrastructure
- [ ] Docker Compose: postgres + redis + backend + ai-service + frontend
- [ ] `.env.example` với tất cả biến môi trường cần thiết
- [ ] GitHub Actions CI: lint + build check

**Deliverable:** Monorepo chạy được trên local, auth flow hoạt động, tất cả services khởi động qua `docker-compose up`.

---

## Sprint 2 — Trend Discovery (Tuần 3–4, Tháng 1)

**Mục tiêu:** TrendAgent hoạt động — crawl Google Trends + Reddit, LLM phân tích, hiển thị lên frontend.

### AI Service — TrendAgent
- [ ] Implement `get_google_trends` tool (pytrends, geo=VN)
- [ ] Implement `get_reddit_trending` tool (PRAW, subreddits liên quan đến ngành)
- [ ] LangGraph TrendAgent graph: crawl → merge → LLM analyze → rank
- [ ] Sentiment + lifecycle analysis prompt (Claude Sonnet 4.6)
- [ ] Lưu kết quả vào `trending_topics` table

### Backend (NestJS) — Trends Module
- [ ] `POST /trends/start-crawl` — trigger TrendAgent
- [ ] `GET /trends` — lấy danh sách trending topics từ DB
- [ ] `GET /trends/:id` — chi tiết 1 topic
- [ ] Cron job: tự động crawl mỗi 6 giờ (NestJS Schedule)
- [ ] `IndustryKeywords` CRUD endpoints

### Frontend — Trend Radar
- [ ] Trang `/trends`: danh sách trending topics dạng card
- [ ] Filter: theo ngành, theo score, theo sentiment
- [ ] Badge: sentiment (positive/negative), lifecycle (rising/peak/declining)
- [ ] "Bắt đầu tạo content" button → navigate to `/content` với topic đã chọn
- [ ] Real-time status: WebSocket cập nhật khi crawl xong

**Deliverable:** User thiết lập từ khóa ngành → hệ thống tự crawl → hiển thị trending topics với phân tích.

---

## Sprint 3 — Content Generation (Tuần 5–6, Tháng 2)

**Mục tiêu:** ContentAgent sinh caption/hashtag/script đa phong cách. Human-in-the-loop review.

### AI Service — ContentAgent
- [ ] ContentAgent LangGraph graph
- [ ] Generate Facebook post (3 phong cách: trendy/professional/storytelling)
- [ ] Generate Instagram caption + hashtag set
- [ ] Generate short script (50–80 từ, hook + body + CTA)
- [ ] `interrupt()` node cho human review
- [ ] Resume graph sau khi user approve/reject

### Backend — Content Module
- [ ] `POST /content/generate` — trigger ContentAgent với topic + style
- [ ] `GET /content/drafts` — lấy danh sách content drafts
- [ ] `PATCH /content/:id/approve` — approve draft → update status
- [ ] `PATCH /content/:id/edit` — user sửa content trực tiếp
- [ ] `POST /content/:id/regenerate` — yêu cầu tạo lại với feedback
- [ ] WebSocket: notify khi content đã generate xong

### Frontend — Content Studio
- [ ] Trang `/content`: tabs cho từng phong cách (Trendy / Professional / Storytelling)
- [ ] Platform preview: xem caption theo format Facebook / Instagram
- [ ] Rich text editor (nếu user muốn sửa)
- [ ] Approve/Reject/Regenerate action buttons
- [ ] Character counter cho từng platform
- [ ] Hashtag chips (có thể remove từng cái)

**Deliverable:** User chọn trend → chọn phong cách → xem 3 bài draft → edit → approve để tạo ảnh.

---

## Sprint 4 — Media Creation (Tuần 7–8, Tháng 2)

**Mục tiêu:** MediaAgent tự động tạo ảnh từ content đã duyệt. Cache prompts tiết kiệm chi phí.

### AI Service — MediaAgent
- [ ] Image prompt engineering (LLM extract visual elements từ caption)
- [ ] Prompt cache: SHA256 key + DB lookup
- [ ] DALL-E 3 API integration (1024×1024, vivid style)
- [ ] Image quality validation (resolution check)
- [ ] Platform adapters: resize cho Facebook/Instagram Feed/Story (Pillow)
- [ ] Upload lên AWS S3 (hoặc Cloudflare R2)
- [ ] `interrupt()` node cho human review ảnh

### Backend — Media Module
- [ ] `POST /media/generate` — trigger MediaAgent với content_draft_id
- [ ] `GET /media/assets` — danh sách ảnh generated
- [ ] `PATCH /media/:id/approve` — approve ảnh
- [ ] `POST /media/:id/regenerate` — tạo lại với feedback
- [ ] S3 presigned URL cho image preview

### Frontend — Visual Factory
- [ ] Trang `/media`: grid preview ảnh đã tạo
- [ ] Xem ảnh theo từng platform format (tabs: Feed / Story / Reels)
- [ ] Approve / Reject / Regenerate with feedback
- [ ] Download ảnh
- [ ] Zoom modal preview

**Deliverable:** Content approved → ảnh tự động tạo → user xem preview → approve để lên lịch.

---

## Sprint 5 — Scheduling & Publishing (Tuần 9–10, Tháng 2)

**Mục tiêu:** SchedulerAgent tính golden hours. PublisherAgent tự động đăng bài đúng giờ.

### AI Service — SchedulerAgent & PublisherAgent
- [ ] SchedulerAgent: phân tích analytics data → suggest golden hours
- [ ] Default schedule (khi chưa có historical data)
- [ ] BullMQ delayed job creation cho mỗi scheduled post
- [ ] PublisherAgent: Facebook Graph API (Pages, publish post + media)
- [ ] PublisherAgent: Instagram Graph API (Container → Publish flow)
- [ ] Retry logic: exponential backoff, max 5 attempts
- [ ] Rate limit tracking per platform

### Backend — Schedule Module
- [ ] `POST /schedule/create` — tạo lịch đăng cho post đã approved
- [ ] `GET /schedule` — lấy tất cả scheduled posts (calendar format)
- [ ] `DELETE /schedule/:id` — hủy lịch đăng
- [ ] `PATCH /schedule/:id` — reschedule
- [ ] Social account OAuth flow (Facebook Pages, Instagram Business)
- [ ] Lưu access tokens vào DB (encrypted)

### Frontend — Scheduler
- [ ] Trang `/schedule`: calendar view (react-big-calendar hoặc shadcn calendar)
- [ ] Drag-and-drop reschedule
- [ ] Platform icons trên mỗi scheduled post
- [ ] Connect Social Accounts UI (OAuth buttons trong `/settings`)
- [ ] Post preview khi hover/click event trên calendar
- [ ] Status badges: scheduled / publishing / published / failed

**Deliverable:** Media approved → system suggest best time → user confirm → post tự động đăng đúng giờ.

---

## Sprint 6 — Analytics & Feedback Loop (Tuần 11, Tháng 3)

**Mục tiêu:** AnalyticsAgent thu thập metrics. Dashboard báo cáo. System tự cải thiện strategy.

### AI Service — AnalyticsAgent
- [ ] Fetch metrics từ Facebook Graph API (likes, comments, reach, impressions)
- [ ] Fetch metrics từ Instagram Graph API
- [ ] Store metrics vào `post_analytics` table
- [ ] Weekly performance report generation (LLM)
- [ ] Strategy adjustment: cập nhật `content_strategy_feedback` trong DB
- [ ] Cron job: thu thập metrics mỗi 6 giờ

### Backend — Analytics Module
- [ ] `GET /analytics/overview` — tổng quan 7/30 ngày
- [ ] `GET /analytics/posts` — hiệu quả từng bài đăng
- [ ] `GET /analytics/best-times` — golden hours analysis
- [ ] `GET /analytics/report` — weekly report

### Frontend — Analytics Dashboard
- [ ] Trang `/analytics`: KPI cards (Total Reach, Avg Engagement, Best Post)
- [ ] Line chart: reach/engagement theo ngày (recharts)
- [ ] Bar chart: so sánh performance giữa các platforms
- [ ] Post performance table: sort by engagement
- [ ] Weekly AI report card (text từ LLM analysis)

**Deliverable:** User xem được báo cáo hiệu quả, hệ thống tự điều chỉnh style cho batch tiếp theo.

---

## Sprint 7 — Polish & Testing (Tuần 12, Tháng 3)

**Mục tiêu:** End-to-end testing, bug fixes, optimization, chuẩn bị demo.

### Testing
- [ ] Unit tests: tất cả service functions (Jest cho NestJS, pytest cho FastAPI)
- [ ] Integration tests: API endpoints với real DB
- [ ] E2E test: toàn bộ pipeline từ trend crawl → publish (1 test scenario)
- [ ] Load test: kiểm tra hệ thống dưới concurrent users

### Performance Optimization
- [ ] Caching: Redis cache cho trending topics (TTL 1 giờ)
- [ ] Image optimization: WebP conversion
- [ ] DB indexes trên các query thường dùng
- [ ] Lazy loading cho media grid

### Bug Fixes & Polish
- [ ] Error states trên tất cả UI components
- [ ] Loading skeletons (không dùng spinner đơn thuần)
- [ ] Empty states với hướng dẫn cho user mới
- [ ] Mobile responsive (không cần perfect, chỉ cần usable)
- [ ] Error notifications toast system

### Demo Preparation
- [ ] Seed data: 50 trending topics, 20 content drafts, 10 published posts mẫu
- [ ] Demo script: 15 phút trình diễn full pipeline
- [ ] README.md: hướng dẫn setup và chạy

**Deliverable:** Hệ thống hoàn chỉnh, ổn định, có thể demo end-to-end.

---

## Feature Priority Matrix

| Feature | Priority | Sprint | Complexity |
|---------|----------|--------|------------|
| Auth system | P0 | 1 | Thấp |
| Trend crawl (Google + Reddit) | P0 | 2 | Trung bình |
| Content generation (LLM) | P0 | 3 | Trung bình |
| Human-in-the-loop review | P0 | 3 | Trung bình |
| Image generation (DALL-E) | P0 | 4 | Trung bình |
| Facebook publishing | P0 | 5 | Cao |
| Instagram publishing | P0 | 5 | Cao |
| Analytics collection | P1 | 6 | Trung bình |
| Golden hour scheduler | P1 | 5 | Trung bình |
| Performance feedback loop | P1 | 6 | Cao |
| TikTok publishing | P2 | — | Rất cao (stretch) |
| Video generation | P2 | — | Rất cao (stretch) |

**P0** = Must have cho thesis demo
**P1** = Should have
**P2** = Nice to have / stretch goal
