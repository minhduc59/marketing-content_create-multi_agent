# API Integrations — Hướng dẫn chi tiết

## Tổng quan

| API | Mục đích | Auth | Chi phí | Priority |
|-----|----------|------|---------|----------|
| pytrends (Google Trends) | Crawl trending topics | Không cần | Free | P0 |
| Reddit PRAW | Crawl trending posts | OAuth app | Free (60 req/min) | P0 |
| Anthropic Claude | LLM: analyze, generate content | API Key | ~$0.003/1K tokens | P0 |
| OpenAI DALL-E 3 | Image generation | API Key | $0.040/image | P0 |
| Facebook Graph API | Publish posts, analytics | OAuth (Page token) | Free | P0 |
| Instagram Graph API | Publish posts, analytics | OAuth (Business) | Free | P0 |
| AWS S3 / Cloudflare R2 | Media storage | Access Key | ~$0.015/GB | P0 |
| LangSmith | LLM observability | API Key | Free tier | P1 |
| Stability AI | Image gen backup | API Key | $0.008/image | P2 |
| TikTok for Business | Publish posts | OAuth | Free | P2 (stretch) |

---

## 1. Google Trends — pytrends

**Không cần API key.** Unofficial library gọi thẳng vào Google Trends.

```python
# ai-service/tools/trend_tools.py
from pytrends.request import TrendReq
from typing import List, Dict

def get_google_trends_data(keywords: List[str], timeframe: str = "now 7-d") -> List[Dict]:
    """
    Args:
        keywords: Danh sách từ khóa (max 5 per request)
        timeframe: "now 1-d", "now 7-d", "today 1-m", "today 3-m"
    Returns:
        List of {topic, search_volume, related_queries, geo_data}
    """
    pytrends = TrendReq(
        hl='vi-VN',    # ngôn ngữ Vietnamese
        tz=420,        # UTC+7 (Việt Nam)
        timeout=(10, 25),
        retries=3,
        backoff_factor=0.5
    )

    # Chia keywords thành chunks 5 (giới hạn của pytrends)
    results = []
    for chunk in [keywords[i:i+5] for i in range(0, len(keywords), 5)]:
        pytrends.build_payload(
            chunk,
            timeframe=timeframe,
            geo='VN'   # Việt Nam
        )

        # Interest over time
        interest_df = pytrends.interest_over_time()

        # Related topics
        related = pytrends.related_topics()

        # Related queries
        queries = pytrends.related_queries()

        results.extend(parse_pytrends_response(interest_df, related, queries, chunk))

    return results

# Lưu ý: Rate limit ~1 req/5s để tránh bị block
# Dùng time.sleep(5) giữa các requests
```

**Limitations:**
- Không cần API key nhưng có thể bị block nếu request quá nhiều
- Dùng proxy rotation nếu cần scale (optional cho thesis)
- Data là relative (0-100), không phải absolute numbers

---

## 2. Reddit API — PRAW

**Setup:** Tạo Reddit app tại `https://www.reddit.com/prefs/apps` (free).

```python
# ai-service/tools/reddit_tools.py
import praw
from typing import List, Dict

def get_reddit_trending(
    industry_keywords: List[str],
    limit: int = 25,
    time_filter: str = "week"  # hour, day, week, month
) -> List[Dict]:
    """
    Lấy hot posts từ các subreddit liên quan đến ngành.
    """
    reddit = praw.Reddit(
        client_id=os.getenv("REDDIT_CLIENT_ID"),
        client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
        user_agent="MarketingAIBot/1.0 (by u/your_username)"
    )

    # Mapping ngành → relevant subreddits
    INDUSTRY_SUBREDDITS = {
        "fashion": ["r/femalefashionadvice", "r/streetwear", "r/malefashionadvice"],
        "food": ["r/food", "r/foodporn", "r/recipes"],
        "tech": ["r/technology", "r/artificial", "r/gadgets"],
        "beauty": ["r/SkincareAddiction", "r/MakeupAddiction"],
        "fitness": ["r/fitness", "r/bodyweightfitness"],
        "travel": ["r/travel", "r/solotravel"],
    }

    results = []
    subreddits = get_subreddits_for_keywords(industry_keywords, INDUSTRY_SUBREDDITS)

    for subreddit_name in subreddits:
        subreddit = reddit.subreddit(subreddit_name)
        for post in subreddit.hot(limit=limit):
            if post.score > 100:  # chỉ lấy post có engagement
                results.append({
                    "title": post.title,
                    "score": post.score,
                    "num_comments": post.num_comments,
                    "url": post.url,
                    "source": subreddit_name,
                    "created_utc": post.created_utc,
                })

    return sorted(results, key=lambda x: x["score"], reverse=True)[:50]
```

**Rate limits:**
- Free: 60 requests/phút
- Không cần verify account

**Environment variables cần thiết:**
```
REDDIT_CLIENT_ID=xxx
REDDIT_CLIENT_SECRET=xxx
```

---

## 3. Anthropic Claude — LLM chính

**Model:** `claude-sonnet-4-6` (claude-sonnet-4-6)

```python
# ai-service/clients/claude_client.py
import anthropic
from langchain_anthropic import ChatAnthropic

# LangChain integration (dùng trong LangGraph)
llm = ChatAnthropic(
    model="claude-sonnet-4-6",
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    max_tokens=4096,
    temperature=0.7,
)

# Với prompt caching (tiết kiệm cost khi dùng system prompt dài)
llm_cached = ChatAnthropic(
    model="claude-sonnet-4-6",
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    model_kwargs={
        "extra_headers": {"anthropic-beta": "prompt-caching-2024-07-31"}
    }
)
```

**Cost estimation:**
| Use case | Tokens/call | Cost/call | Calls/day | Daily cost |
|----------|-------------|-----------|-----------|------------|
| Trend analysis | ~2000 | $0.006 | 4 | $0.024 |
| Content generation | ~3000 | $0.009 | 10 | $0.090 |
| Image prompt engineering | ~500 | $0.0015 | 10 | $0.015 |
| Analytics report | ~4000 | $0.012 | 1 | $0.012 |
| **Total** | | | | **~$0.14/ngày** |

**Environment variables:**
```
ANTHROPIC_API_KEY=sk-ant-xxx
```

---

## 4. OpenAI DALL-E 3 — Image generation

```python
# ai-service/clients/image_client.py
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def generate_image(prompt: str, size: str = "1024x1024") -> str:
    """
    Args:
        prompt: Image prompt (max 4000 chars)
        size: "1024x1024" | "1024x1792" | "1792x1024"
    Returns:
        Image URL (expires after 1 hour → download immediately to S3)
    """
    response = client.images.generate(
        model="dall-e-3",
        prompt=prompt,
        size=size,
        quality="standard",  # "standard" ($0.04) hoặc "hd" ($0.08)
        style="vivid",       # "vivid" (dramatic) hoặc "natural"
        n=1,
    )

    image_url = response.data[0].url
    revised_prompt = response.data[0].revised_prompt  # DALL-E có thể sửa prompt

    # CRITICAL: Download ngay và upload lên S3 vì URL expire sau 1 giờ
    return upload_to_s3(download_image(image_url))
```

**Cost:**
- Standard quality: $0.040/image
- HD quality: $0.080/image
- Ước tính: 10 images/ngày × $0.04 = $0.40/ngày

**Lưu ý quan trọng:**
- DALL-E 3 URL expire sau 1 giờ → phải download & upload S3 ngay
- Có content policy: tránh prompt chứa người thật, bạo lực, etc.
- Revised prompt từ DALL-E đôi khi khác prompt gốc → log lại để debug

**Environment variables:**
```
OPENAI_API_KEY=sk-xxx
```

---

## 5. Facebook Graph API

**Yêu cầu:** Facebook Developer App + Facebook Page (Business account).

### OAuth Flow

```
1. User click "Connect Facebook" → Backend redirect đến Facebook OAuth
2. Facebook redirect về /auth/facebook/callback với code
3. Backend exchange code → long-lived page access token (60 ngày)
4. Lưu token vào SocialAccount table (encrypted)
```

```typescript
// backend/src/auth/facebook.service.ts
// Dùng Passport.js FacebookStrategy

// Scopes cần thiết:
const FACEBOOK_SCOPES = [
  'pages_show_list',      // xem danh sách pages
  'pages_read_engagement', // đọc metrics
  'pages_manage_posts',   // đăng bài
  'pages_manage_metadata', // metadata
];
```

### Publish Post

```typescript
// backend/src/social/facebook.service.ts
async publishPost(pageId: string, accessToken: string, content: {
  message: string;
  imageUrl?: string;
}): Promise<string> {
  // Với ảnh: dùng /photos endpoint
  if (content.imageUrl) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/photos`,
      {
        method: 'POST',
        body: JSON.stringify({
          url: content.imageUrl,     // URL của ảnh trên S3
          caption: content.message,
          access_token: accessToken,
        }),
      }
    );
    const data = await res.json();
    return data.id; // post ID
  }

  // Không có ảnh: dùng /feed endpoint
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/feed`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: content.message,
        access_token: accessToken,
      }),
    }
  );
  const data = await res.json();
  return data.id;
}
```

### Fetch Analytics

```typescript
// Insights API - lấy metrics cho một post
async getPostInsights(postId: string, accessToken: string) {
  const metrics = [
    'post_impressions',
    'post_impressions_unique',     // reach
    'post_engaged_users',
    'post_reactions_by_type_total',
    'post_clicks',
  ];

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${postId}/insights` +
    `?metric=${metrics.join(',')}&access_token=${accessToken}`
  );
  return res.json();
}
```

**Rate limits:**
- 200 calls/hour/page (đủ dùng)
- Token expires: short-lived 1h, long-lived 60 ngày

---

## 6. Instagram Graph API

**Yêu cầu:** Instagram Business/Creator account connected to Facebook Page.

### Publish Photo

```typescript
// Instagram dùng 2-step process: Create Container → Publish
async publishInstagramPost(igUserId: string, accessToken: string, content: {
  imageUrl: string;  // S3 URL (phải HTTPS và publicly accessible)
  caption: string;
}) {
  // Step 1: Create media container
  const containerRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media`,
    {
      method: 'POST',
      body: JSON.stringify({
        image_url: content.imageUrl,  // phải public URL
        caption: content.caption,
        access_token: accessToken,
      }),
    }
  );
  const { id: containerId } = await containerRes.json();

  // Step 2: Wait for container to be ready (check status)
  await waitForContainerReady(containerId, accessToken);

  // Step 3: Publish
  const publishRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
    {
      method: 'POST',
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );
  const { id: mediaId } = await publishRes.json();
  return mediaId;
}
```

**Lưu ý quan trọng:**
- Image URL phải là **public HTTPS URL** (S3 presigned URL không dùng được → dùng public bucket hoặc CloudFront)
- Container processing mất 1–5 phút → cần polling với timeout
- Rate limit: 25 API calls/page/hour

---

## 7. AWS S3 / Cloudflare R2 — Media Storage

**Khuyến nghị:** Cloudflare R2 (rẻ hơn, không tính phí egress).

```python
# ai-service/clients/storage_client.py
import boto3
from botocore.exceptions import ClientError

# R2 dùng S3-compatible API
s3 = boto3.client(
    's3',
    endpoint_url=f"https://{os.getenv('CF_ACCOUNT_ID')}.r2.cloudflarestorage.com",
    aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
    region_name='auto',
)

def upload_image(image_bytes: bytes, filename: str) -> str:
    """
    Upload ảnh lên R2, trả về public URL.
    """
    s3.put_object(
        Bucket=os.getenv('R2_BUCKET_NAME'),
        Key=f"media/{filename}",
        Body=image_bytes,
        ContentType='image/webp',
        # Public read access
    )
    return f"https://{os.getenv('R2_PUBLIC_DOMAIN')}/media/{filename}"
```

**Chi phí (Cloudflare R2):**
- Storage: $0.015/GB/tháng
- Operations: 10M GET free/tháng
- Egress: FREE (khác S3)

**Environment variables:**
```
CF_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=marketing-media
R2_PUBLIC_DOMAIN=media.yourdomain.com
```

---

## 8. BullMQ + Redis — Job Queue

**Dùng cho:** Delayed publish jobs, retry logic, rate limiting.

```typescript
// backend/src/queue/publisher.queue.ts
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({ host: 'redis', port: 6379 });

// Queue setup
const publishQueue = new Queue('publish-posts', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,  // 2s base, doubles each retry
    },
    removeOnComplete: 100,  // giữ 100 completed jobs
    removeOnFail: 500,
  },
});

// Thêm delayed job
async function schedulePost(postScheduleId: string, scheduledAt: Date) {
  const delay = scheduledAt.getTime() - Date.now();
  await publishQueue.add(
    'publish',
    { postScheduleId },
    { delay: Math.max(delay, 0) }
  );
}

// Worker xử lý job
const worker = new Worker('publish-posts', async (job) => {
  const { postScheduleId } = job.data;
  // Gọi PublisherAgent để đăng bài
  await triggerPublisherAgent(postScheduleId);
}, { connection });
```

---

## 9. Rate Limit Strategy tổng hợp

```typescript
// Centralized rate limit tracking trong Redis
class RateLimitManager {
  async checkAndConsume(platform: string, resource: string): Promise<boolean> {
    const key = `rate_limit:${platform}:${resource}`;
    const limit = PLATFORM_LIMITS[platform][resource];

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, limit.windowSeconds);
    }

    return current <= limit.maxRequests;
  }
}

const PLATFORM_LIMITS = {
  facebook: {
    publish: { maxRequests: 25, windowSeconds: 3600 },
    insights: { maxRequests: 200, windowSeconds: 3600 },
  },
  instagram: {
    publish: { maxRequests: 25, windowSeconds: 3600 },
  },
};
```

---

## 10. Environment Variables tổng hợp

```bash
# .env.example

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/marketing_db
REDIS_URL=redis://localhost:6379

# AI
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
LANGCHAIN_API_KEY=ls__xxx         # LangSmith
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=marketing-ai-agent

# Social Media
FACEBOOK_APP_ID=xxx
FACEBOOK_APP_SECRET=xxx
REDDIT_CLIENT_ID=xxx
REDDIT_CLIENT_SECRET=xxx

# Storage (Cloudflare R2)
CF_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=marketing-media
R2_PUBLIC_DOMAIN=media.yourdomain.com

# App
JWT_SECRET=your-super-secret-key
NEXTJS_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001
AI_SERVICE_URL=http://localhost:8000
```
