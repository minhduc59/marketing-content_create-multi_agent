# API Integrations — Hướng dẫn chi tiết

## Tổng quan

| API | Mục đích | Auth | Chi phí | Priority |
|-----|----------|------|---------|----------|
| HackerNews Firebase API | Crawl top tech stories | Không cần | Free | P0 — Implemented |
| OpenAI GPT-4o | LLM: analyze trends, generate reports | API Key | ~$0.005/1K tokens | P0 — Implemented |
| LinkedIn API | Publish posts (future) | OAuth | Free | P1 — Planned |

---

## 1. HackerNews Firebase API — Technology Trends

**Không cần API key.** Sử dụng Firebase API của HackerNews để crawl top stories.

```python
# ai-service/app/tools/hackernews_tool.py
class HackerNewsTool:
    BASE_URL = "https://hacker-news.firebaseio.com/v0"

    async def fetch_all(self, max_stories: int = 30) -> list[dict]:
        """Fetch top HN stories, crawl full articles, filter tech content."""
```

**Endpoints:**
- `GET /v0/topstories.json` — Top 500 story IDs
- `GET /v0/item/{id}.json` — Story details (title, url, score, descendants)

**Flow:**
1. Fetch top story IDs
2. Fetch story details (parallel with semaphore)
3. Crawl article URLs to extract full text
4. Filter for technology relevance
5. Return structured items

**Rate limiting:** 30 requests/60s (polite limit)

**Output format:**
```json
{
  "title": "Article Title",
  "description": "First 500 chars of article",
  "content_body": "Full article text",
  "source_url": "https://...",
  "views": null,
  "likes": null,
  "comments_count": 150,
  "trending_score": 450,
  "author_name": "hn_username",
  "published_at": "2024-01-15T10:30:00Z",
  "raw_data": {
    "hn_title": "HN discussion title",
    "hn_score": 450,
    "hn_comments": 150,
    "hn_author": "username",
    "hn_url": "https://news.ycombinator.com/item?id=...",
    "article_title": "Original article title",
    "article_description": "...",
    "article_image_url": "..."
  }
}
```

---

## 2. OpenAI GPT-4o — Analysis & Reports

**Two LLM configurations:**

| Purpose | Model | max_tokens | temperature |
|---------|-------|------------|-------------|
| Analyzer | gpt-4o | 4,096 | 0.0 |
| Reporter | gpt-4o | 8,192 | 0.3 |

**Analyzer:** Categorizes HN trends for LinkedIn technology audience (category, sentiment, lifecycle, relevance_score 0-10).

**Reporter:** Generates Vietnamese markdown report + structured JSON content angles for LinkedIn (thought leadership, professional, educational content types).

---

## 3. LinkedIn API (Planned)

**Future integration for auto-publishing LinkedIn content.**

| Endpoint | Purpose |
|----------|---------|
| `POST /v2/ugcPosts` | Create LinkedIn post |
| `GET /v2/socialActions` | Engagement metrics |
| `POST /v2/shares` | Share article |

**Auth:** OAuth 2.0 with `w_member_social` scope.
