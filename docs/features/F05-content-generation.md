# F05: Content Generation (Content Brain)

> AI-powered multi-style content generation with platform-specific captions, hashtags, scripts, and auto-review loop.

## Overview

| Property | Value |
|----------|-------|
| **Agent** | Post-Generation |
| **Pipeline Stage** | 4 |
| **Trigger** | `current_stage = "report_generated"` |
| **Status** | Planned (Sprint 3) |
| **Key files** | `ai-service/app/agents/content_generator.py` (to be created) |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `report_files` | `List[File]` | Trend report files (`.md`) from Stage 3, loaded from S3 |
| `strategy` | `Object` | `{tone, style, brand_voice}` — brand content strategy |
| `platform_specs` | `Object` | Platform-specific rules (char limits, hashtag counts, format) |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `content` | `Object` | `{caption, hashtags, script}` — primary content |
| `platform_variants` | `List[Object]` | `[{platform, caption, hashtags, char_count}]` — per-platform versions |
| `image_prompt` | `String` | Generated prompt for Stage 5 (Media Creation) |
| `content_pool_status` | `String` | Set to `"draft"` — saved to Content Pool |

---

## Processing Logic

```
1. Load trend report file(s) from S3
2. Extract key trends and recommended content angles from report
3. For each selected trend/angle:
   a. Generate caption in 3 writing styles (trendy, professional, storytelling)
   b. Generate hashtag set per platform
   c. Generate short script (50-80 words: hook + body + CTA)
4. Adapt content per platform:
   a. Facebook: 150-300 words, 3-5 hashtags
   b. Instagram: 100-150 words, 15-20 hashtags
5. Generate image prompt for Stage 5 (describe visual elements from caption)
6. Run auto-review loop:
   a. LLM self-evaluates content quality (relevance, brand alignment, engagement potential)
   b. Score < threshold → regenerate with adjustment notes
   c. Max 2 review iterations
7. Save all content to Content Pool with status "draft"
8. Update current_stage → "content_generated"
```

---

## 3 Writing Styles

| Style | Tone | Use Case | Example Hook |
|-------|------|----------|--------------|
| **Trendy** | Casual, playful, uses slang/emoji | Gen Z audience, viral content | "POV: Bạn vừa phát hiện trend mới nhất..." |
| **Professional** | Formal, data-driven, authoritative | B2B, corporate brands | "Theo nghiên cứu mới nhất, 78% marketer..." |
| **Storytelling** | Narrative, emotional, personal | Brand building, community engagement | "3 năm trước, mình gần như bỏ cuộc..." |

---

## Platform Specifications

| Platform | Caption Length | Hashtag Count | Format Rules |
|----------|--------------|---------------|--------------|
| **Facebook** | 150-300 words | 3-5 hashtags | Longer form, can include links, paragraph breaks |
| **Instagram** | 100-150 words | 15-20 hashtags | Hook in first line, hashtags at end or in comment, emoji-friendly |

---

## Short Script Format

For Reels/TikTok-style content (50-80 words):

```
HOOK (1-2 sentences): Attention grabber — question, bold statement, or POV setup
BODY (3-4 sentences): Main value — tip, story, or insight
CTA (1 sentence): Call to action — follow, comment, share, save
```

---

## Auto-Review Loop

LLM self-evaluation after content generation:

| Criteria | Check |
|----------|-------|
| **Relevance** | Content aligns with the trend topic and report insights |
| **Brand Alignment** | Matches strategy tone, style, and brand voice |
| **Engagement Potential** | Has strong hook, clear value, actionable CTA |
| **Platform Fit** | Meets character limits and format rules |
| **Originality** | Not generic — adds unique angle or perspective |

- Score range: 1-10
- Threshold: 7+ passes, below 7 triggers regeneration
- Max iterations: 2 (to prevent infinite loops)
- On final failure: flag for manual review

---

## Content Pool Integration

Content is saved to PostgreSQL `content_drafts` table:

| Field | Value |
|-------|-------|
| `status` | `DRAFT` (initial), `PENDING_REVIEW` (if review enabled), `APPROVED` / `REJECTED` |
| `facebook_caption` | Facebook-optimized caption |
| `instagram_caption` | Instagram-optimized caption |
| `hashtags` | JSON array of hashtag strings |
| `short_script` | Reels/TikTok script |
| `image_prompt` | Prompt for Stage 5 image generation |
| `style` | `TRENDY` / `PROFESSIONAL` / `STORYTELLING` |
| `user_edits` | User modifications (if edited before approval) |
| `user_feedback` | Rejection feedback (if rejected via F10) |

---

## Infrastructure

- **LLM:** Claude Sonnet — content generation, auto-review, image prompt engineering
- **Storage:** AWS S3 — read report files from Stage 3
- **Database:** PostgreSQL — Content Pool (`content_drafts` table)
- **WebSocket:** Notify frontend when content generation is complete

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/content/generate` | Trigger ContentAgent with topic + style |
| `GET` | `/content/drafts` | List content drafts (paginated, filterable by status/style) |
| `PATCH` | `/content/:id/approve` | Approve draft → update status to `APPROVED` |
| `PATCH` | `/content/:id/edit` | User edits content directly |
| `POST` | `/content/:id/regenerate` | Regenerate with user feedback |

---

## Database Tables

- `content_drafts` — Main content storage:
  - `ContentStyle` enum: `TRENDY`, `PROFESSIONAL`, `STORYTELLING`
  - `ContentStatus` enum: `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `PUBLISHED`
  - Fields: `facebookCaption`, `instagramCaption`, `hashtags` (JSON), `shortScript`, `imagePrompt`, `userEdits`, `userFeedback`
  - Relations: belongs to `trending_topic`, has many `media_assets`

---

## Dependencies

- Anthropic Claude Sonnet (content generation + auto-review)
- AWS S3 (read report files)
- PostgreSQL (Content Pool persistence)
- WebSocket (NestJS Gateway — real-time notification)

---

## Related Features

- [F04 Report Generation](F04-report-generation.md) — Provides trend report files as input context
- [F06 Media Creation](F06-media-creation.md) — Receives `image_prompt` for visual generation
- [F10 Human Review Gate](F10-human-review-gate.md) — Reviews generated content before publishing
- [F01 Orchestrator](F01-orchestrator-router.md) — Routes here when `current_stage = "report_generated"`
