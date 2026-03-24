# Frontend & UX Design — Dashboard Marketing AI

## Tech Stack Frontend

| Package | Mục đích |
|---------|----------|
| Next.js 15 (App Router) | Framework chính |
| shadcn/ui | Component library |
| Tailwind CSS | Styling |
| recharts | Analytics charts |
| react-big-calendar | Schedule calendar view |
| TanStack Query | Server state management + caching |
| Zustand | Client state (pipeline status) |
| socket.io-client | WebSocket (real-time updates) |
| react-hook-form + zod | Form validation |
| next-auth | Authentication session |

---

## Sitemap & Routing

```
/
├── (auth)/
│   ├── login
│   └── register
│
└── (app)/                    ← Protected routes
    ├── dashboard             ← Trang chủ
    ├── trends                ← Trend Radar
    ├── content/
    │   ├── (list)            ← Danh sách drafts
    │   └── [id]              ← Chi tiết + edit 1 draft
    ├── media/
    │   ├── (list)            ← Danh sách media assets
    │   └── [id]              ← Chi tiết 1 asset
    ├── schedule              ← Calendar view
    ├── analytics             ← Performance reports
    └── settings/
        ├── keywords          ← Từ khóa ngành
        └── accounts          ← Kết nối social accounts
```

---

## Layout chung (App Shell)

```
┌──────────────────────────────────────────────────────┐
│ Header: Logo | Pipeline Status Badge | User Avatar   │
├───────────┬──────────────────────────────────────────┤
│           │                                          │
│ Sidebar   │  Main Content Area                       │
│           │                                          │
│ Dashboard │                                          │
│ Trends    │                                          │
│ Content   │                                          │
│ Media     │                                          │
│ Schedule  │                                          │
│ Analytics │                                          │
│ Settings  │                                          │
│           │                                          │
└───────────┴──────────────────────────────────────────┘
```

**Pipeline Status Badge** (header):
- Green pulse: Pipeline đang idle (sẵn sàng)
- Orange spin: Pipeline đang chạy (tên agent hiện tại)
- Yellow pause: Đang chờ human review
- Red: Có lỗi xảy ra

---

## 1. Dashboard (`/dashboard`)

**Mục tiêu:** Overview toàn bộ hệ thống, quick actions.

```
┌──────────────────────────────────────────────────────┐
│ Tổng quan 7 ngày qua                                 │
│                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │ Trending │ │ Content  │ │ Posts    │ │ Avg      │ │
│ │ Topics   │ │ Created  │ │ Published│ │ Engagement│
│ │    12    │ │    8     │ │    5     │ │  4.2%    │ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                      │
│ Pipeline Status                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Trend Discovery → Content Gen → Media → Schedule│ │
│ │ [●]──────────────[●]───────────[○]────────[○]  │ │
│ │ Done              Done         Running   Pending │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ Bài đăng sắp tới          Recent Activity           │
│ ┌──────────────────────┐  ┌──────────────────────┐  │
│ │ Today 19:00          │  │ 2h ago: Content ready │  │
│ │ [IG] Summer fashion  │  │ 5h ago: Trends updated│  │
│ │ Tomorrow 08:00       │  │ Yesterday: 3 posts pub│  │
│ │ [FB] Food recipe     │  └──────────────────────┘  │
│ └──────────────────────┘                            │
│                                                      │
│ [🚀 Bắt đầu Pipeline mới]  [📊 Xem Analytics]      │
└──────────────────────────────────────────────────────┘
```

**Components:**
- `<KPICard>` — số liệu tổng quan với trend icon
- `<PipelineStatus>` — stepper hiển thị tiến trình
- `<UpcomingPosts>` — danh sách 5 bài sắp đăng
- `<ActivityFeed>` — log hoạt động real-time (WebSocket)

---

## 2. Trend Radar (`/trends`)

**Mục tiêu:** Xem trending topics, filter, chọn để tạo content.

```
┌──────────────────────────────────────────────────────┐
│ Trend Radar                    [🔄 Refresh] [+ Tạo]  │
│                                                      │
│ Filter: [Tất cả ▼] [Ngành: Fashion ▼] [Tuần này ▼] │
│                                                      │
│ Sắp xếp: [Relevance ▼]                              │
│                                                      │
│ ┌─────────────────────────┐ ┌─────────────────────┐ │
│ │ 🔥 Summer Fashion Trend │ │ 🍜 Street Food 2026  │ │
│ │ Score: 9.2 / 10         │ │ Score: 8.8 / 10      │ │
│ │ [RISING ↑] [POSITIVE]   │ │ [PEAK ◉] [POSITIVE]  │ │
│ │ Nguồn: Google + Reddit  │ │ Nguồn: Reddit        │ │
│ │ Content potential: 🔥   │ │ Content potential: ⚡ │ │
│ │ [Tạo Content →]         │ │ [Tạo Content →]      │ │
│ └─────────────────────────┘ └─────────────────────┘ │
│                                                      │
│ ┌─────────────────────────┐ ┌─────────────────────┐ │
│ │ 📱 AI Phone Reviews     │ │ ...                  │ │
│ │ Score: 7.5 / 10         │ │                      │ │
│ │ [DECLINING ↓] [NEUTRAL] │ │                      │ │
│ │ [Tạo Content →]         │ │                      │ │
│ └─────────────────────────┘ └─────────────────────┘ │
│                                                      │
│ Cập nhật lần cuối: 2 giờ trước | Next: 4 giờ nữa   │
└──────────────────────────────────────────────────────┘
```

**Components:**
- `<TrendCard>` — hiển thị 1 topic với badges và score
- `<TrendFilter>` — filter bar (industry, time, sentiment)
- `<TrendBadge>` — RISING (green) / PEAK (orange) / DECLINING (red)
- Real-time update khi crawl job hoàn thành (WebSocket)

---

## 3. Content Studio (`/content` và `/content/[id]`)

**Mục tiêu:** Xem, chỉnh sửa, approve content drafts.

### Danh sách drafts (`/content`)

```
┌──────────────────────────────────────────────────────┐
│ Content Studio                                       │
│                                                      │
│ Status: [Tất cả] [Pending Review] [Approved] [Published]│
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Summer Fashion Trend        🕐 PENDING REVIEW      │ │
│ │ Style: Trendy | Platform: FB + IG               │ │
│ │ "POV: khi tủ đồ của bạn vẫn chưa có..."        │ │
│ │ [Review →]                                      │ │
│ └──────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Street Food Guide           ✅ APPROVED            │ │
│ │ Style: Storytelling | Platform: FB              │ │
│ │ [Xem chi tiết →]                                │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Chi tiết draft (`/content/[id]`)

```
┌──────────────────────────────────────────────────────┐
│ ← Quay lại                Summer Fashion Trend        │
│                                                      │
│ Chọn phong cách:  [Trendy ●] [Professional] [Story]  │
│                                                      │
│ Platform Preview ────────────────────────────────── │
│ [Facebook] [Instagram]                               │
│                                                      │
│ ┌────────────────────────────────┐                   │
│ │ 📘 Facebook Preview            │                   │
│ │ ┌──────────────────────────┐   │                   │
│ │ │ [Page Name]  · 3 phút   │   │                   │
│ │ │                          │   │                   │
│ │ │ POV: khi tủ đồ của bạn  │   │                   │
│ │ │ vẫn chưa có piece nào   │   │                   │
│ │ │ đúng nghĩa "summer"...  │   │                   │
│ │ │                          │   │                   │
│ │ │ #summerfashion #ootd    │   │                   │
│ │ │ #vietnam #fashion2026   │   │                   │
│ │ └──────────────────────────┘   │                   │
│ └────────────────────────────────┘                   │
│                                                      │
│ Chỉnh sửa (tùy chọn):                               │
│ ┌──────────────────────────────────────────────────┐ │
│ │ [Rich text editor — editable caption]            │ │
│ │ 247/300 ký tự                                    │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ Hashtags:  #summerfashion ✕  #ootd ✕  #vietnam ✕   │
│            [+ Thêm hashtag]                         │
│                                                      │
│ Script (cho Reels/TikTok):                          │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Hook: "Bạn có biết trend mùa hè năm nay là..."  │ │
│ │ Body: ...                                        │ │
│ │ CTA: "Follow để không bỏ lỡ!"                   │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ [✗ Từ chối + Tạo lại]  [✓ Duyệt → Tạo ảnh]        │
│                                                      │
│ (Từ chối) Feedback cho AI: ___________________      │
└──────────────────────────────────────────────────────┘
```

---

## 4. Visual Factory (`/media`)

**Mục tiêu:** Xem preview ảnh, approve/reject, xem theo platform format.

```
┌──────────────────────────────────────────────────────┐
│ Visual Factory                                       │
│                                                      │
│ ┌────────────────────┐  ┌─────────────────────────┐ │
│ │                    │  │ Summer Fashion Trend      │ │
│ │  [Ảnh preview      │  │ Tạo lúc: 14:32 hôm nay  │ │
│ │   1080×1080]       │  │                          │ │
│ │                    │  │ Xem theo platform:       │ │
│ │                    │  │ [Feed 1:1] [Story 9:16]  │ │
│ │                    │  │ [Facebook 1.91:1]        │ │
│ │                    │  │                          │ │
│ └────────────────────┘  │ Prompt dùng:             │ │
│                         │ "A vibrant summer        │ │
│ [← Prev]  [Next →]      │ fashion flatlay with..."│ │
│                         │                          │ │
│                         │ [↓ Download]             │ │
│                         │                          │ │
│                         │ [✗ Từ chối + Tạo lại]   │ │
│                         │ [✓ Duyệt → Lên lịch]    │ │
│                         │                          │ │
│                         │ Feedback khi từ chối:    │ │
│                         │ [____________________]   │ │
│                         └─────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**UX notes:**
- Khi chuyển tab platform, ảnh crop tương ứng (không generate lại)
- Zoom modal khi click vào ảnh
- Nếu ảnh đang generate → loading skeleton với progress indicator

---

## 5. Schedule (`/schedule`)

**Mục tiêu:** Xem lịch đăng bài, điều chỉnh giờ đăng.

```
┌──────────────────────────────────────────────────────┐
│ Lịch đăng bài          Tháng 3, 2026    [< >]        │
│                                                      │
│  Mon   Tue   Wed   Thu   Fri   Sat   Sun             │
│  ─────────────────────────────────────────           │
│  23    24    25    26    27    28    29               │
│        [FB]        [IG]        [FB]  [IG]            │
│        08:00       19:00       12:00 21:00           │
│                                                      │
│  30    31    1     2     3     4     5               │
│  [FB]        [IG]        [FB]        [IG]            │
│  08:00       11:00       19:00       20:00           │
│                                                      │
│ ────────────────────────────────────────────────── │
│ Chi tiết: [FB] 26/3 19:00                           │
│ ┌───────────────────────────────────────┐           │
│ │ Summer Fashion Trend                  │           │
│ │ "POV: khi tủ đồ của bạn..."          │           │
│ │ [Ảnh thumbnail]                       │           │
│ │ Platform: Facebook Page "Brand Name" │           │
│ │ Lên lịch bởi AI (Golden Hour)        │           │
│ │                                       │           │
│ │ [✏ Đổi giờ] [🗑 Hủy]                │           │
│ └───────────────────────────────────────┘           │
└──────────────────────────────────────────────────────┘
```

---

## 6. Analytics (`/analytics`)

**Mục tiêu:** Báo cáo hiệu quả bài đăng theo ngày/tuần.

```
┌──────────────────────────────────────────────────────┐
│ Analytics                      [7 ngày ▼] [Xuất CSV]│
│                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │ Total    │ │ Avg Eng  │ │ Total    │ │ Best Post │ │
│ │ Reach    │ │ Rate     │ │ Posts    │ │ Reach     │ │
│ │  47.2K   │ │  4.8%    │ │   12     │ │  18.5K   │ │
│ │ ↑ 12%    │ │ ↑ 0.5%   │ │          │ │ (Trending│ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                      │
│ Engagement theo ngày                                 │
│ ┌──────────────────────────────────────────────────┐ │
│ │ [Line chart: reach + engagement rate 7 ngày]    │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ Hiệu quả theo Platform              Giờ tốt nhất    │
│ ┌───────────────────┐  ┌────────────────────────┐   │
│ │ [Bar: FB vs IG]   │  │ Facebook: 08h, 19h     │   │
│ │                   │  │ Instagram: 11h, 21h    │   │
│ └───────────────────┘  └────────────────────────┘   │
│                                                      │
│ Top bài đăng                                         │
│ ┌──────────────────────────────────────────────────┐ │
│ │ # │ Bài đăng          │ Platform │ Reach │ Eng % │ │
│ │ 1 │ Summer Fashion... │ IG       │ 18.5K │  7.2% │ │
│ │ 2 │ Street Food...    │ FB       │ 12.3K │  5.1% │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ AI Insights tuần này:                               │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 📊 Phong cách Trendy đang hoạt động tốt nhất    │ │
│ │ (+34% so với Professional). Nên tăng tỷ lệ      │ │
│ │ Trendy content lên 60% trong tuần tới.           │ │
│ │                                                  │ │
│ │ ⏰ Thứ 6 19:00 là golden hour mới phát hiện:    │ │
│ │ engagement rate 8.3% so với avg 4.8%.            │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## 7. Settings (`/settings`)

### Từ khóa ngành (`/settings/keywords`)

```
┌──────────────────────────────────────────────────────┐
│ Cài đặt từ khóa ngành                               │
│                                                      │
│ Từ khóa hiện tại:                                   │
│ [fashion] ✕  [thời trang] ✕  [ootd] ✕               │
│ [summer] ✕   [outfit] ✕                             │
│                                                      │
│ Thêm từ khóa mới: [________________] [+ Thêm]       │
│                                                      │
│ Ngành của bạn: [Fashion ▼]                          │
│                                                      │
│ [Lưu thay đổi]                                      │
└──────────────────────────────────────────────────────┘
```

### Kết nối tài khoản (`/settings/accounts`)

```
┌──────────────────────────────────────────────────────┐
│ Kết nối Social Accounts                              │
│                                                      │
│ Facebook                                            │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ✅ Đã kết nối: Brand Page "My Fashion Store"    │ │
│ │    Token expires: 15/5/2026                     │ │
│ │    [Ngắt kết nối] [Làm mới token]               │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ Instagram                                           │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ✅ Đã kết nối: @myfashionstore_vn               │ │
│ │    Business Account                             │ │
│ │    [Ngắt kết nối]                               │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ TikTok                                              │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ○ Chưa kết nối                                 │ │
│ │ [Kết nối TikTok →]                             │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## UX Patterns quan trọng

### 1. Human-in-the-loop Approval Card
```
Component: <ApprovalCard>
- Hiển thị: content preview + action buttons
- Actions: [✓ Approve] [✏ Edit & Approve] [✗ Reject + Feedback]
- Khi reject: optional text input cho feedback gửi lại AI
- Animation: slide out khi approve, shake khi reject
```

### 2. Real-time Pipeline Status
```
Component: <PipelineStatusBanner>
- Kết nối WebSocket khi user logged in
- Events: agent_started, agent_completed, human_review_needed, pipeline_error
- Khi human_review_needed: hiện notification + badge đỏ trên sidebar icon
- Khi error: toast notification với error message
```

### 3. Empty States (cho user mới)
```
- /trends: "Chưa có từ khóa ngành → [Thiết lập ngay]"
- /content: "Chưa có content draft → [Chọn trending topic]"
- /media: "Chưa có ảnh nào → [Approve content trước]"
- /schedule: "Chưa có lịch đăng → [Tạo bài đăng đầu tiên]"
```

### 4. Loading States
- Skeleton cards thay vì spinner đơn thuần
- Ảnh generate: skeleton với progress text ("Đang tạo ảnh... ~30 giây")
- Trend crawling: animated radar icon

### 5. Error Handling
- API errors: toast notification (red) + retry button
- Network offline: banner cảnh báo
- Rate limit hit: thông báo + estimated wait time

---

## Responsive Design

Thesis demo chủ yếu trên desktop (1280px+), nhưng cần usable trên tablet:

| Breakpoint | Layout |
|-----------|--------|
| `lg` (1024px+) | Sidebar + content 2 columns |
| `md` (768px+) | Collapsible sidebar |
| `sm` (640px-) | Bottom navigation (mobile) |

Dùng shadcn/ui `Sheet` component cho mobile sidebar.
