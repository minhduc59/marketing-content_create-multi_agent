# Thiết Kế AI Agent — LinkedIn Technology Content Pipeline

## 1. Kiến trúc tổng thể — Linear Pipeline

Hệ thống sử dụng **LangGraph Linear Pipeline**: một chuỗi nodes xử lý tuần tự
từ crawling đến lưu trữ. Tập trung vào **HackerNews** làm nguồn dữ liệu và
**LinkedIn** + **Technology** làm đối tượng đầu ra.

```
START
  → hackernews_scanner    (HN Firebase API → crawl articles → tech filter)
  → collect_results       (validate & merge)
  → analyzer              (GPT-4o → categorize, sentiment, LinkedIn relevance)
  → content_saver         (save markdown → content/hackernews/{date}/)
  → reporter              (GPT-4o → Vietnamese LinkedIn report + content angles)
  → persist_results       (save to PostgreSQL)
END
```

---

## 2. Shared State Schema

```python
# ai-service/app/agents/state.py
class RawTrendData(TypedDict):
    platform: str          # "hackernews"
    items: list[dict]
    error: str | None
    metadata: dict

class TrendScanState(TypedDict):
    # Input
    scan_run_id: str
    platforms: list[str]   # ["hackernews"]
    options: dict

    # Scanner outputs
    raw_results: Annotated[list[RawTrendData], operator.add]

    # Analyzer output
    analyzed_trends: list[dict]
    cross_platform_groups: list[dict]

    # Content saver output
    content_file_paths: list[str]

    # Reporter output
    report_content: str
    report_file_path: str

    # Control
    errors: Annotated[list[ScanError], operator.add]
```

---

## 3. HackerNews Scanner — Thu thập xu hướng công nghệ

**Nhiệm vụ:** Crawl top stories từ HN Firebase API, extract full article text,
lọc theo tech relevance.

**Tool:**
```python
# app/tools/hackernews_tool.py
class HackerNewsTool:
    async def fetch_all(max_stories)  # Top stories → crawl articles → filter tech
```

**Scanner node:**
```python
# app/agents/scanners/hackernews.py
class HackerNewsScannerNode(BaseScannerNode):
    platform = "hackernews"
    async def fetch(options) → list[dict]
```

---

## 4. Analyzer — Phân tích cho LinkedIn Technology

**Nhiệm vụ:** Phân tích trending items bằng GPT-4o, đánh giá mức độ phù hợp
cho nội dung LinkedIn trong lĩnh vực công nghệ.

**Prompt template (GPT-4o, max_tokens=4096, temp=0):**
```
Phân tích các trending items từ HackerNews:
{items_batch}  (chunks of 40 items)

Với mỗi item, đánh giá:
1. Category: tech/business/education/other
2. Sentiment: positive/negative/neutral/mixed
3. Lifecycle: rising/peak/declining
4. Relevance score (0-10): cho LinkedIn technology audience
5. Related topics: 2-5 technology keywords

Trả về JSON array.
```

**Output:** `analyzed_trends` (list[dict]) with LinkedIn relevance scores

---

## 5. Content Saver — Lưu nội dung

**Nhiệm vụ:** Lưu analyzed HackerNews articles dưới dạng markdown files.

**Output structure:**
```
content/hackernews/{date}/{slug}.md
```

Each file contains YAML frontmatter (hn_title, hn_score, hn_comments, article metadata)
+ full article content.

---

## 6. Reporter — Báo cáo LinkedIn

**Nhiệm vụ:** Tạo báo cáo xu hướng công nghệ bằng tiếng Việt, tập trung vào
gợi ý nội dung LinkedIn: thought leadership, industry insights, professional development.

**Two LLM calls (GPT-4o, max_tokens=8192, temp=0.3):**
1. Vietnamese markdown report — trends ranking, detailed analysis, LinkedIn content suggestions
2. Structured content angles JSON — LinkedIn-specific content types (post, article, carousel, poll, document)

**LinkedIn content types:**
| Type | Mô tả |
|------|-------|
| `linkedin_post` | Short-form post (hook + insight) |
| `linkedin_article` | Long-form thought leadership |
| `linkedin_carousel` | Multi-slide visual content |
| `linkedin_poll` | Community engagement |
| `linkedin_document` | PDF/presentation upload |

**Writing styles:**
| Style | Mô tả |
|-------|-------|
| `thought_leadership` | Industry vision, expert perspective |
| `professional` | Formal, data-driven |
| `storytelling` | Personal experience, relatable |
| `educational` | How-to, tutorial, explanation |
| `data_driven` | Statistics, charts, benchmarks |

---

## 7. Future Agents (Planned)

| Agent | Stage | Status |
|-------|-------|--------|
| ContentAgent — Sinh nội dung LinkedIn | Content Generation | Planned |
| SchedulerAgent — Lên lịch đăng LinkedIn | Scheduling | Planned |
| PublisherAgent — Đăng bài LinkedIn | Publishing | Planned |
| AnalyticsAgent — Thu thập metrics | Analytics | Planned |
