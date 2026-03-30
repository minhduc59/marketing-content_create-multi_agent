# F06: Media Creation (Visual Factory)

> Automated image generation with DALL-E 3, brand template application, platform-specific resizing, and prompt caching.

## Overview

| Property | Value |
|----------|-------|
| **Agent** | Post-Generation (sub-task: media) |
| **Pipeline Stage** | 5 |
| **Trigger** | `current_stage = "content_generated"` |
| **Status** | Planned (Sprint 4) |
| **Key files** | `ai-service/app/agents/media_creator.py` (to be created) |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `image_prompt` | `String` | Image generation prompt from Stage 4 (Content Generation) |
| `brand_template` | `Object` | `{logo_url, colors: [primary, secondary], fonts: [heading, body]}` |
| `platform_dimensions` | `Object` | Target sizes per platform `{facebook: "1200x630", instagram_feed: "1080x1080", ...}` |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `media_files` | `List[File]` | Raw generated image + branded variants per platform |
| `media_urls` | `List[String]` | S3 URLs for all media variants |

---

## Processing Logic

```
1. Receive image_prompt from Stage 4
2. Refine prompt via LLM (add style keywords, quality descriptors, negative prompts)
3. Check prompt cache:
   a. Compute SHA256 hash of refined prompt
   b. Lookup hash in media_assets.promptHash
   c. Cache hit → return existing S3 URLs (skip generation)
4. Cache miss → call DALL-E 3 API:
   a. Model: dall-e-3
   b. Size: 1024x1024
   c. Style: vivid
   d. Quality: standard
   e. Cost: ~$0.04/image
5. Download generated image immediately (DALL-E URLs expire in 1 hour)
6. Apply brand template:
   a. Logo overlay (bottom-right corner, semi-transparent)
   b. Color adjustments (tint matching brand primary color)
   c. Optional: text overlay for quotes/stats
7. Resize for each platform using Pillow:
   a. Facebook Feed: 1200×630
   b. Instagram Feed: 1080×1080
   c. Instagram Story: 1080×1920
   d. Thumbnail: 400×400
8. Convert to WebP format (quality 85, smaller file size)
9. Upload all variants to S3
10. Save MediaAsset records to DB with S3 URLs
11. Update Content Pool with media references
12. Update current_stage → "media_created"
```

---

## DALL-E 3 Integration

| Config | Value |
|--------|-------|
| **Model** | `dall-e-3` |
| **Size** | `1024x1024` (square, then resize) |
| **Style** | `vivid` (more vibrant, artistic) |
| **Quality** | `standard` ($0.04/image) or `hd` ($0.08/image) |
| **Response format** | `url` (expires in 1 hour) |
| **Content policy** | OpenAI moderation — avoid brand logos, real people, copyrighted characters |

```python
from openai import OpenAI

client = OpenAI()
response = client.images.generate(
    model="dall-e-3",
    prompt=refined_prompt,
    size="1024x1024",
    quality="standard",
    style="vivid",
    n=1,
)
image_url = response.data[0].url  # Download immediately — expires in 1h
```

---

## Prompt Cache Strategy

- **Hash function:** SHA256 of normalized prompt text
- **Lookup:** Query `media_assets` table by `prompt_hash` column
- **Cache hit:** Return existing S3 URLs, skip DALL-E API call (saves $0.04)
- **Cache TTL:** 7 days (after which prompt_hash entries are eligible for regeneration)
- **Index:** `idx_media_assets_prompt_hash` on `media_assets.promptHash`

---

## Platform Adapters

| Platform | Dimensions | Aspect Ratio | Use Case |
|----------|-----------|--------------|----------|
| **Facebook Feed** | 1200 × 630 | 1.91:1 | Link preview, shared post |
| **Instagram Feed** | 1080 × 1080 | 1:1 | Square feed post |
| **Instagram Story** | 1080 × 1920 | 9:16 | Full-screen story/reel cover |
| **Thumbnail** | 400 × 400 | 1:1 | Preview in content list |

Resizing strategy:
- Start from 1024×1024 DALL-E output
- Use Pillow `Image.resize()` with `LANCZOS` resampling
- For non-square formats: crop center or pad with brand background color

---

## Brand Template Application

Using Pillow (PIL):

| Step | Operation |
|------|-----------|
| 1. Load base image | Raw DALL-E output |
| 2. Logo overlay | Paste logo at bottom-right with alpha compositing (opacity 0.7) |
| 3. Color tint | Apply semi-transparent color overlay matching brand primary |
| 4. Text overlay | Optional: add trend title or key stat with brand font |
| 5. Border/frame | Optional: add brand-colored border (2px) |

---

## S3 Storage

- **Path pattern:** `media/{user_id}/{content_draft_id}/{variant}.webp`
- **Variants:** `original.webp`, `facebook_feed.webp`, `instagram_feed.webp`, `instagram_story.webp`, `thumbnail.webp`
- **Format:** WebP (quality 85)
- **Access:** Presigned URLs for frontend preview (15-min expiry)
- **Retention:** Indefinite (user's media library)

---

## Infrastructure

- **Image Generation:** OpenAI DALL-E 3 API
- **Image Processing:** Pillow (Python Imaging Library)
- **Storage:** AWS S3 / Cloudflare R2
- **Cache:** PostgreSQL (prompt hash lookup in `media_assets` table)
- **Logging:** structlog with generation metrics (duration, cost, cache hit/miss)

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/media/generate` | Trigger MediaAgent with `content_draft_id` |
| `GET` | `/media/assets` | List generated media (paginated, filterable by status) |
| `PATCH` | `/media/:id/approve` | Approve media asset |
| `POST` | `/media/:id/regenerate` | Regenerate with feedback (new prompt or style adjustment) |
| `GET` | `/media/:id/preview` | Get presigned S3 URL for image preview |

---

## Database Tables

- `media_assets` — Media storage records:
  - `MediaStatus` enum: `GENERATING`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`
  - `MediaProvider` enum: `DALL_E`, `STABILITY_AI`
  - Fields: `promptHash`, `originalUrl`, `facebookUrl`, `instagramFeedUrl`, `instagramStoryUrl`, `thumbnailUrl`
  - Index: `idx_media_assets_prompt_hash` for cache lookups
  - Relations: belongs to `content_draft`

---

## Dependencies

- OpenAI DALL-E 3 API (image generation)
- Pillow (image processing, resizing, brand overlay)
- AWS S3 / Cloudflare R2 (media storage)
- PostgreSQL (media asset records, prompt cache)

---

## Related Features

- [F05 Content Generation](F05-content-generation.md) — Provides `image_prompt` as input
- [F07 Scheduling](F07-scheduling.md) — Uses media URLs for scheduled posts
- [F10 Human Review Gate](F10-human-review-gate.md) — Reviews generated media before publishing
- [F01 Orchestrator](F01-orchestrator-router.md) — Routes here when `current_stage = "content_generated"`
