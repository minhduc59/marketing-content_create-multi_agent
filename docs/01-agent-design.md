# Thiết Kế AI Agents — Multi-Agent Marketing System

## 1. Kiến trúc tổng thể — Supervisor Pattern

Hệ thống sử dụng **LangGraph Supervisor Pattern**: một Supervisor Agent điều phối
6 specialized agents. Mỗi agent là một LangGraph `StateGraph` độc lập, giao tiếp
qua shared state và message passing.

```
User Request
     │
     ▼
┌─────────────┐
│  Supervisor │  ← Nhận yêu cầu, quyết định agent nào chạy tiếp theo
│    Agent    │
└──────┬──────┘
       │
  ┌────┼────────────────────────────┐
  ▼    ▼         ▼         ▼        ▼         ▼
Trend Content  Media  Scheduler Publisher Analytics
Agent  Agent   Agent   Agent    Agent     Agent
```

**Reference:** Học pattern từ `social-media-agent/src/agents/supervisor/`

---

## 2. Shared State Schema

```python
# ai-service/agents/shared/state.py
from typing import TypedDict, Annotated, List, Optional
from langgraph.graph.message import add_messages

class PipelineState(TypedDict):
    # Pipeline metadata
    user_id: str
    campaign_id: str
    industry_keywords: List[str]

    # Stage outputs
    trending_topics: List[dict]       # TrendAgent output
    trend_report: str                 # TrendAgent LLM analysis
    content_drafts: List[dict]        # ContentAgent output
    selected_content: Optional[dict]  # After human review
    media_assets: List[dict]          # MediaAgent output
    approved_media: Optional[dict]    # After human review
    post_schedule: dict               # SchedulerAgent output
    published_posts: List[dict]       # PublisherAgent output
    analytics_report: dict            # AnalyticsAgent output

    # Control flow
    current_stage: str
    human_feedback: Optional[str]
    error: Optional[str]

    # Messages for LLM
    messages: Annotated[list, add_messages]
```

---

## 3. TrendAgent — Thu thập & Phân tích xu hướng

**Nhiệm vụ:** Crawl Google Trends + Reddit, phân tích sentiment bằng LLM,
trả về danh sách trending topics được ranking.

```
TrendAgent StateGraph:
  START
    → crawl_google_trends      (pytrends)
    → crawl_reddit             (PRAW)
    → merge_raw_data           (deduplicate, normalize)
    → llm_analyze_sentiment    (Claude — engagement + trend lifecycle)
    → rank_topics              (score = engagement × recency × relevance)
  END
```

**Tools:**
```python
# Tool 1: Google Trends
@tool
def get_google_trends(keywords: List[str], timeframe: str = "now 7-d") -> List[dict]:
    """Lấy trending topics từ Google Trends via pytrends."""
    from pytrends.request import TrendReq
    pytrends = TrendReq(hl='vi-VN', tz=420)
    pytrends.build_payload(keywords, timeframe=timeframe, geo='VN')
    df = pytrends.related_topics()
    # parse & return

# Tool 2: Reddit
@tool
def get_reddit_trending(subreddits: List[str], limit: int = 25) -> List[dict]:
    """Lấy hot posts từ Reddit theo subreddit liên quan."""
    import praw
    reddit = praw.Reddit(...)
    # fetch hot posts, return title + score + comments

# Tool 3: LLM Analysis
# Dùng Claude để phân tích: sentiment, trend lifecycle, relevance score
```

**Prompt template (LLM Analysis):**
```
Phân tích các trending topics sau cho ngành {industry}:
{raw_trends_data}

Với mỗi topic, đánh giá:
1. Sentiment: positive/negative/neutral
2. Trend lifecycle: rising/peak/declining
3. Relevance score (0-10): phù hợp với ngành {industry}
4. Content potential: khả năng tạo content viral

Trả về JSON với structure: [{topic, sentiment, lifecycle, relevance_score, content_potential, reason}]
```

**Output:** `List[TrendingTopic]` với score ranking

---

## 4. ContentAgent — Sinh nội dung tự động

**Nhiệm vụ:** Từ trending topic đã duyệt, sinh caption + hashtag + script
đa phong cách cho nhiều nền tảng.

```
ContentAgent StateGraph:
  START
    → select_trend             (từ state.trending_topics)
    → generate_facebook_post   (LLM)
    → generate_instagram_post  (LLM)
    → generate_hashtags        (LLM)
    → generate_script_short    (LLM — 15-30s Reels/TikTok)
    → human_review_interrupt   ← HUMAN-IN-THE-LOOP checkpoint
    → [approved] finalize_content
    → [rejected] regenerate_content
  END
```

**3 phong cách (style):**
| Style | Mô tả | Ví dụ |
|-------|-------|-------|
| `trendy` | Dùng slang, emoji, viral hook | "POV: bạn vừa khám phá..." |
| `professional` | Formal, thông tin, authority | "Theo thống kê mới nhất..." |
| `storytelling` | Kể chuyện, emotional, relatable | "Hồi trước mình cũng từng..." |

**Prompt System:**
```python
CONTENT_SYSTEM_PROMPT = """
Bạn là chuyên gia marketing nội dung cho thị trường Việt Nam.
Nhiệm vụ: Sinh content đa phong cách, phù hợp từng nền tảng.

Quy tắc:
- Facebook: 150-300 từ, 1-3 emoji, 3-5 hashtag
- Instagram caption: 100-150 từ, nhiều emoji, 15-20 hashtag
- Script Reels/TikTok: 50-80 từ, có hook mở đầu <3s, CTA cuối
- Luôn bắt đầu bằng hook thu hút trong 2 giây đầu
- Tránh dùng từ quá formal hoặc quá slang với phong cách neutral
"""
```

**Human-in-the-loop interrupt:**
```python
# Sử dụng LangGraph interrupt() để chờ user approval
from langgraph.types import interrupt

def human_review_node(state: ContentState):
    user_decision = interrupt({
        "drafts": state["content_drafts"],
        "message": "Vui lòng review và chọn/chỉnh sửa nội dung"
    })
    return {"selected_content": user_decision["selected"],
            "human_feedback": user_decision.get("feedback")}
```

---

## 5. MediaAgent — Tạo hình ảnh tự động

**Nhiệm vụ:** Từ caption đã duyệt, tự động engineer prompt và gọi DALL-E 3
để tạo ảnh phù hợp. Cache prompt tương tự để tiết kiệm chi phí.

```
MediaAgent StateGraph:
  START
    → engineer_image_prompt    (LLM extract visual elements từ caption)
    → check_prompt_cache       (hash-based cache trong DB)
    → [cache hit] use_cached_image
    → [cache miss] call_dalle3
    → validate_image_quality   (check resolution, content policy)
    → adapt_for_platforms      (resize: 1:1 Square, 4:5 Portrait, 9:16 Story)
    → upload_to_s3
    → human_review_interrupt   ← HUMAN-IN-THE-LOOP checkpoint
    → [approved] finalize_media
    → [rejected] regenerate_with_feedback
  END
```

**Prompt Engineering:**
```python
IMAGE_PROMPT_TEMPLATE = """
Từ caption marketing sau, hãy tạo một prompt cho DALL-E 3:

Caption: {caption}
Ngành: {industry}
Phong cách: {style}

Yêu cầu prompt:
- Mô tả hình ảnh cụ thể, vivid, không chứa text/chữ trong ảnh
- Style: modern, professional, {style_description}
- Màu sắc: phù hợp brand ({brand_colors})
- Ánh sáng: bright, clean, appealing
- Không có người nhận dạng được (privacy)

Trả về: prompt tiếng Anh cho DALL-E 3, tối đa 100 từ.
"""
```

**Prompt Caching Strategy:**
```python
# Cache key = SHA256(industry + style + top_3_keywords_from_caption)
# Nếu similarity > 0.85 (cosine similarity của embedding) → dùng cached image
# TTL: 7 ngày
```

**Platform adapters:**
```python
PLATFORM_SIZES = {
    "facebook_feed": (1200, 630),    # 1.91:1
    "instagram_feed": (1080, 1080),  # 1:1
    "instagram_story": (1080, 1920), # 9:16
    "instagram_reels": (1080, 1920), # 9:16
}
# Dùng Pillow để resize + center crop
```

---

## 6. SchedulerAgent — Lên lịch đăng bài tối ưu

**Nhiệm vụ:** Phân tích historical post analytics để tìm "golden hours"
(khung giờ có engagement cao nhất) cho từng platform và user account.

```
SchedulerAgent StateGraph:
  START
    → fetch_historical_analytics   (từ DB: post_analytics table)
    → analyze_best_posting_times   (LLM + statistics)
    → suggest_schedule             (next 7 ngày)
    → create_scheduled_jobs        (BullMQ delayed jobs)
  END
```

**Thuật toán Golden Hour:**
```python
def calculate_golden_hours(analytics_data: List[dict]) -> dict:
    """
    Input: list of {platform, posted_at, likes, views, comments, reach}
    Output: {platform: {weekday: [best_hours]}}

    Method:
    1. Group by platform + weekday + hour
    2. Tính engagement_rate = (likes + comments*2 + shares*3) / reach
    3. Lấy top 3 hours có avg engagement_rate cao nhất
    4. Nếu < 30 posts history → dùng default (8h, 12h, 19h) + research
    """
```

**Default schedules (fallback khi chưa có data):**
```python
DEFAULT_GOLDEN_HOURS = {
    "facebook": ["08:00", "12:00", "19:00"],  # VN timezone (UTC+7)
    "instagram": ["07:00", "11:00", "21:00"],
    "tiktok": ["18:00", "20:00", "22:00"],
}
```

---

## 7. PublisherAgent — Tự động đăng bài

**Nhiệm vụ:** Gọi các platform APIs để đăng bài đúng giờ đã lên lịch.
Xử lý rate limits, retry logic, format adaptation.

```
PublisherAgent StateGraph:
  START
    → load_scheduled_post     (từ BullMQ job)
    → prepare_platform_post   (format content + resize media)
    → publish_to_facebook     (Facebook Graph API)
    → publish_to_instagram    (Instagram Graph API)
    → record_published_post   (lưu platform post ID vào DB)
    → notify_user             (WebSocket notification)
  END
```

**Rate Limit & Retry:**
```python
PLATFORM_RATE_LIMITS = {
    "facebook": {"posts_per_hour": 25, "posts_per_day": 200},
    "instagram": {"posts_per_hour": 25, "posts_per_day": 100},
}

# BullMQ retry config:
# attempts: 5
# backoff: exponential (base: 2s, max: 60s)
# On rate limit 429: exponential backoff + jitter
```

**Cross-post adapter:**
```python
def adapt_content_for_platform(content: dict, platform: str) -> dict:
    """Điều chỉnh content format cho từng platform."""
    if platform == "facebook":
        # Giữ nguyên caption đầy đủ
        # Link preview tự động
    elif platform == "instagram":
        # Caption ngắn hơn
        # Hashtags ở cuối hoặc comment đầu tiên
        # Require media (ảnh/video)
```

---

## 8. AnalyticsAgent — Thu thập & Phản hồi

**Nhiệm vụ:** Định kỳ thu thập metrics từ platform APIs, phân tích hiệu quả,
và điều chỉnh strategy cho ContentAgent ở batch tiếp theo.

```
AnalyticsAgent StateGraph:
  START
    → fetch_post_metrics      (Platform APIs: likes, views, comments, reach)
    → store_metrics           (DB: post_analytics table)
    → generate_performance_report (LLM: phân tích trend hiệu quả)
    → update_content_strategy (LLM: điều chỉnh tone/style cho batch tiếp theo)
    → update_user_preferences (lưu vào DB: content_strategy_feedback)
  END
```

**Performance Report LLM Prompt:**
```
Phân tích hiệu quả các bài đăng sau trong 7 ngày qua:
{posts_with_metrics}

Hãy:
1. Xác định top 3 bài có engagement cao nhất và lý do thành công
2. Xác định 3 bài kém hiệu quả nhất và nguyên nhân
3. Pattern nào (phong cách, giờ đăng, hashtag) đang hoạt động tốt?
4. Đề xuất điều chỉnh chiến lược cho tuần tới:
   - Phong cách content nên dùng
   - Chủ đề nên tập trung
   - Thời điểm đăng tối ưu
   - Số lượng hashtag khuyến nghị

Trả về JSON với cấu trúc: {insights, top_performing, low_performing, recommendations}
```

**Scheduling:** AnalyticsAgent chạy tự động:
- Thu thập metrics: mỗi 6 giờ (cron job)
- Generate report: mỗi tuần (Sunday 23:00)

---

## 9. Supervisor Agent — Điều phối

**Nhiệm vụ:** Nhận yêu cầu từ user, routing đến đúng agent, quản lý state
và quyết định agent tiếp theo trong pipeline.

```python
# ai-service/agents/supervisor/graph.py
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver

def build_supervisor_graph():
    graph = StateGraph(PipelineState)

    # Thêm các nodes
    graph.add_node("trend_agent", run_trend_agent)
    graph.add_node("content_agent", run_content_agent)
    graph.add_node("media_agent", run_media_agent)
    graph.add_node("scheduler_agent", run_scheduler_agent)
    graph.add_node("publisher_agent", run_publisher_agent)
    graph.add_node("analytics_agent", run_analytics_agent)
    graph.add_node("human_review", human_review_node)

    # Edges
    graph.set_entry_point("trend_agent")
    graph.add_edge("trend_agent", "content_agent")
    graph.add_edge("content_agent", "human_review")
    graph.add_conditional_edges("human_review", route_after_review, {
        "approved": "media_agent",
        "rejected": "content_agent",  # regenerate
    })
    graph.add_edge("media_agent", "scheduler_agent")
    graph.add_edge("scheduler_agent", "publisher_agent")
    graph.add_edge("publisher_agent", "analytics_agent")
    graph.add_edge("analytics_agent", END)

    # Checkpointing để resume sau human interrupt
    checkpointer = PostgresSaver.from_conn_string(DATABASE_URL)

    return graph.compile(checkpointer=checkpointer, interrupt_before=["human_review"])
```

---

## 10. LangSmith Integration (Observability)

```python
# Tất cả agents đều trace qua LangSmith
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_PROJECT"] = "marketing-ai-agent"

# Mỗi pipeline run = 1 LangSmith trace
# Có thể debug từng LLM call, tool call, state transition
```
