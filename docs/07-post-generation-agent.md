# Post Generation Agent — Architecture & Workflow

> Stage 2 of the LinkedIn content pipeline: transforming analyzed trends into LinkedIn-ready posts with captions, hashtags, image prompts, and auto-review scoring.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Relationship to Stage 1 (Trending Scanner)](#2-relationship-to-stage-1-trending-scanner)
3. [LangGraph Workflow](#3-langgraph-workflow)
4. [Phase Breakdown](#4-phase-breakdown)
5. [Auto-Review Loop](#5-auto-review-loop)
6. [Data Model](#6-data-model)
7. [LLM Configuration](#7-llm-configuration)
8. [Strategy System](#8-strategy-system)
9. [Storage & Output Structure](#9-storage--output-structure)
10. [API Endpoints](#10-api-endpoints)
11. [File Structure](#11-file-structure)
12. [Implementation Tasks](#12-implementation-tasks)

---

## 1. Overview

The Post Generation Agent is a **separate LangGraph `StateGraph`** that reads the output of Stage 1 (Trending Scanner) and produces LinkedIn-ready content. It is triggered independently via API after a scan run completes.

```
POST /api/v1/posts/generate {scan_run_id}
  -> Validate scan is COMPLETED
  -> Launch LangGraph pipeline (background task)
  -> Returns 202 Accepted
```

**Key design goals:**

- **Decoupled from Stage 1** — separate graph, triggered via API, shares data through DB + storage
- **Multi-phase pipeline** — strategy alignment, content generation, image prompts, review, packaging
- **Self-improving** — auto-review loop scores posts against 7 criteria and revises failing ones (up to 2x)
- **Strategy-driven** — reads brand voice, tone preferences, and posting insights from a strategy file
- **Full persistence** — posts saved to both storage (JSON files) and database (`content_posts` table)

---

## 2. Relationship to Stage 1 (Trending Scanner)

The two stages are **independent LangGraph graphs** connected through shared persistence:

```
Stage 1: Trending Scanner                    Stage 2: Post Generation Agent
===========================                  ================================

POST /api/v1/scan                            POST /api/v1/posts/generate
       |                                            |
       v                                            v
  HN Scanner                                 Strategy Alignment
       |                                       (reads from DB + storage)
       v                                            |
  Collect Results                                   v
       |                                     Content Generation
       v                                            |
  Trend Analyzer (GPT-4o)                           v
       |                                     Image Prompt Creation
       v                                            |
  Content Saver                                     v
       |                                     Auto-Review (GPT-4o)
       v                                        |         |
  Persist to DB ----[scan_runs]------>     [score>=7]  [score<7]
                ----[trend_items]----->         |     Revise (loop)
                ----[report.md]------->        v
                                         Output Packaging
                                           (writes to DB + storage)
```

**Data flow between stages:**

| Data | Written by Stage 1 | Read by Stage 2 |
|------|-------------------|-----------------|
| Analyzed articles | `trend_items` table (DB) | `strategy_alignment` node queries by `scan_run_id` |
| Trend report | `reports/{scan_run_id}/*_report.md` (storage) | `strategy_alignment` node reads via `ScanRun.report_file_path` |
| Strategy | N/A (static file) | `strategy/default_strategy.json` (storage) |

---

## 3. LangGraph Workflow

### Graph Definition

```python
StateGraph(PostGenState)

START -> strategy_alignment -> content_generation -> image_prompt_creation
      -> auto_review -> [conditional edge] -> output_packaging -> END
                              |
                     (if score < 7 and          
                      revisions < 2)            
                              |                 
                              v                 
                     content_generation (loop back)
```

### State: `PostGenState`

```python
class PostGenState(TypedDict):
    # Inputs
    scan_run_id: str
    options: dict                    # {num_posts: 3, formats: [...]}

    # Loaded during strategy_alignment
    trend_report_md: str             # Markdown report from Stage 1
    analyzed_trends: list[dict]      # TrendItems from DB
    strategy: dict                   # Parsed strategy.json

    # Phase 1 output
    content_plan: list[dict]         # Which trends/angles/formats to use

    # Phase 2+3 output
    generated_posts: list[dict]      # Posts with caption, hashtags, image_prompt

    # Phase 4 output
    review_results: list[dict]       # Per-post scores and feedback
    revision_count: int              # 0, 1, or 2
    posts_to_revise: list[str]       # post_ids needing revision

    # Phase 5 output
    final_output: dict               # Complete packaged output
    saved_file_paths: list[str]      # Storage paths of saved files

    # Control
    errors: Annotated[list[dict], operator.add]
```

### Conditional Edge: Review Router

```python
def review_router(state: PostGenState) -> str:
    if state["posts_to_revise"] and state["revision_count"] < 2:
        return "revise"       # -> content_generation (loop)
    return "package"          # -> output_packaging
```

---

## 4. Phase Breakdown

### Phase 1: Strategy Alignment

**Node:** `strategy_alignment_node`
**File:** `app/agents/post_generator/nodes/strategy_alignment.py`

**Purpose:** Load all inputs and produce a content plan before writing anything.

**Process:**
1. Query `TrendItem` records from DB for the given `scan_run_id` (ordered by `relevance_score` DESC)
2. Read the trend report markdown from storage using `ScanRun.report_file_path`
3. Load `strategy/default_strategy.json` from storage (with hardcoded fallback)
4. Call LLM with all three inputs — asks it to select trends, angles, and formats

**LLM output:** JSON content plan array:
```json
[
  {
    "trend_index": 0,
    "trend_title": "Axios npm Compromise",
    "angle": "Supply Chain Security",
    "format": "thought_leadership",
    "target_audience": ["developers", "ctos"],
    "priority": 1,
    "rationale": "Emerging trend with high engagement..."
  }
]
```

**Content plan rules (enforced in prompt):**
- Create `num_posts` posts (default 3, max 10)
- No two posts on the same trend unless completely different angles
- Prioritize `emerging` or `rising` lifecycle trends
- Avoid `declining` trends unless "lessons learned" angle
- Balance formats (no duplicates in a row)

**State output:** `{analyzed_trends, trend_report_md, strategy, content_plan}`

---

### Phase 2: Content Generation

**Node:** `content_generation_node`
**File:** `app/agents/post_generator/nodes/content_generation.py`

**Purpose:** Generate full LinkedIn post text for each planned post.

**Two modes:**
1. **First run** — generate all posts from the content plan
2. **Revision mode** — only regenerate posts whose `post_id` is in `posts_to_revise`, using review feedback

**Process (first run):**
1. For each content plan item, extract the matching trend data (title, cleaned_content, key_data_points, linkedin_angles)
2. Build user message with plan + trend data + posting schedule
3. Call LLM with format-specific templates and brand voice instructions

**7 post formats with templates:**

| Format | Word Count | Best For |
|--------|-----------|----------|
| `thought_leadership` | 800-1200 | Controversial or bullish trends |
| `hot_take` | 400-600 | Controversial trends, peaking lifecycle |
| `case_study` | 600-1000 | Emerging/rising trends with data |
| `tutorial` | 600-900 | Rising trends, developer audience |
| `industry_analysis` | 800-1200 | CTOs/founders audience |
| `career_advice` | 400-700 | Recruiters/general tech audience |
| `behind_the_scenes` | 400-600 | Rising trends, founder audience |

**LinkedIn formatting rules (enforced in prompt):**
- Short paragraphs (1-3 sentences)
- No markdown headers or bullet points
- Use "→" or "—" for structure
- Max 2-3 emojis, never in first line
- First line must create curiosity/controversy/surprise
- End with CTA question before hashtags
- 3-5 hashtags (broad → specific → niche)

**Process (revision mode):**
1. Filter `generated_posts` to find failing posts
2. Build revision input with original post + review feedback + trend data
3. Call LLM with revision prompt
4. Merge revised posts back, keeping passing posts untouched

**State output:** `{generated_posts: [...]}`

---

### Phase 3: Image Prompt Creation

**Node:** `image_prompt_creation_node`
**File:** `app/agents/post_generator/nodes/image_prompt_creation.py`

**Purpose:** Generate image generation instructions for each post in a single batched LLM call.

**Process:**
1. Build post summaries (post_id, format, trend_title, caption preview, hashtags)
2. Call LLM with image prompt template
3. Merge image prompts into each post dict by `post_id`

**Style mapping:**

| Post Format | Image Style |
|-------------|------------|
| thought_leadership | conceptual_illustration |
| hot_take | clean_tech |
| case_study | data_visualization |
| tutorial | minimal_diagram |
| industry_analysis | data_visualization |
| career_advice | conceptual_illustration |
| behind_the_scenes | photo_realistic |

**Image prompt structure:**
```json
{
  "image_concept": "what the image should convey",
  "style": "conceptual_illustration",
  "prompt": "detailed prompt for image generation API",
  "aspect_ratio": "1:1",
  "text_overlay": {
    "headline": "max 8 words",
    "subtext": "max 12 words"
  },
  "brand_elements": {
    "use_logo": true,
    "color_scheme": ["#1a1a2e", "#16213e", "#0f3460"],
    "font_style": "Inter"
  },
  "linkedin_specs": {
    "dimensions": "1200x1200",
    "format": "PNG",
    "safe_zone": "keep text in center 80% area"
  }
}
```

**State output:** `{generated_posts: [...]}` (with `image_prompt` added to each post)

---

### Phase 4: Auto-Review

**Node:** `auto_review_node`
**File:** `app/agents/post_generator/nodes/auto_review.py`

**Purpose:** Self-critique each post against a quality checklist and route for revision if needed.

**7 review criteria with weights:**

| Criterion | Weight | What It Checks |
|-----------|--------|---------------|
| Hook strength | 20% | Would a CTO stop scrolling? Specific stat/claim in first line? |
| Value density | 15% | Every paragraph adds value? No filler? |
| Data points | 15% | At least 1 specific number/stat per post? |
| Strategy alignment | 15% | Tone matches brand voice guidelines? |
| CTA quality | 10% | Closing question/action specific and inviting? |
| Originality | 15% | Not just article summary — adds unique perspective? |
| Format compliance | 10% | Follows structure for its format? Correct length? |

**Scoring:**
- Weighted average of all criteria (1-10 scale)
- **Score >= 7** — post passes, no revision needed
- **Score < 7 and revision_count < 2** — route back to content_generation for revision
- **Score < 7 and revision_count >= 2** — flag as `flagged_for_review` (human review needed)

**State output:** `{review_results, revision_count: +1, posts_to_revise: [...]}`

---

### Phase 5: Output Packaging

**Node:** `output_packaging_node`
**File:** `app/agents/post_generator/nodes/output_packaging.py`

**Purpose:** Assemble final output, save to storage, persist to database.

**Process:**
1. Build final JSON with `content_plan`, `posts` array (enriched with review data), and `strategy_update`
2. Save to storage: `posts/{scan_run_id}/output.json` + individual `post-001.json` files
3. Persist each post to `content_posts` DB table
4. Save strategy update to `strategy/{scan_run_id}/strategy_update.json`

**Final output structure:**
```json
{
  "content_plan": {
    "total_posts": 3,
    "strategy_version": "1.0",
    "trends_used": ["Axios npm Compromise", "..."],
    "formats_used": ["thought_leadership", "hot_take"]
  },
  "posts": [
    {
      "post_id": "post-001",
      "status": "draft",
      "trend_source": { "trend_name": "...", "trend_url": "...", "linkedin_angle_used": "..." },
      "format": "thought_leadership",
      "target_audience": ["developers", "ctos"],
      "caption": "full LinkedIn post text...",
      "hashtags": ["#CyberSecurity", "#npm", "#SupplyChain"],
      "cta": "What's your team's dependency audit process?",
      "image_prompt": { ... },
      "metadata": {
        "word_count": 850,
        "estimated_read_time": "3 min",
        "engagement_prediction": "high",
        "best_posting_day": "Tuesday",
        "best_posting_time": "8:00-10:00 AM",
        "timing_window": "5 days — trend still rising"
      },
      "review": {
        "score": 8.2,
        "notes": "",
        "criteria": { "hook_strength": 9, "value_density": 8, ... },
        "revision_count": 1
      }
    }
  ],
  "strategy_update": {
    "version": "1.1",
    "trends_leveraged": ["..."],
    "formats_distribution": { "thought_leadership": 2, "hot_take": 1 },
    "audience_focus": ["developers", "ctos"],
    "performance_baseline": { "avg_review_score": 8.1, "content_diversity_score": "high" },
    "notes_for_feedback_agent": "Monitor engagement on 3 posts..."
  }
}
```

**State output:** `{final_output, saved_file_paths}`

---

## 5. Auto-Review Loop

The review loop is the core quality mechanism. It uses LangGraph's conditional edges to create a feedback cycle:

```
                    +---------------------+
                    |  content_generation  |
                    +----------+----------+
                               |
                               v
                    +---------------------+
                    | image_prompt_creation|
                    +----------+----------+
                               |
                               v
                    +---------------------+
                    |     auto_review      |
                    +----------+----------+
                               |
                    +----------+----------+
                    |                     |
              score >= 7            score < 7
              (or max revisions)    AND revisions < 2
                    |                     |
                    v                     v
            +---------------+    +-----------------+
            |output_packaging|   | content_generation|
            +---------------+   |  (revision mode)  |
                                +-----------------+
                                        |
                                        v
                                 image_prompt_creation
                                        |
                                        v
                                    auto_review
                                     (re-score)
```

**Revision behavior:**
- `revision_count = 0`: first review pass. Failing posts get feedback and route to revision.
- `revision_count = 1`: second review pass (after first revision). Still-failing posts get one more chance.
- `revision_count = 2`: max reached. Any still-failing posts are marked `flagged_for_review` and passed through to output.

**In revision mode, `content_generation` only regenerates failing posts** — passing posts are preserved untouched. This avoids re-generating content that already scored well.

---

## 6. Data Model

### ContentPost Table

```sql
CREATE TABLE content_posts (
    id                    UUID PRIMARY KEY,
    scan_run_id           UUID NOT NULL REFERENCES scan_runs(id),
    trend_item_id         UUID REFERENCES trend_items(id),
    
    -- Content
    format                postformat NOT NULL,
    caption               TEXT NOT NULL,
    hashtags              JSON DEFAULT '[]',
    cta                   VARCHAR,
    image_prompt          JSON,
    
    -- Source
    trend_title           VARCHAR(500) NOT NULL,
    trend_url             VARCHAR,
    linkedin_angle_used   VARCHAR,
    target_audience       JSON DEFAULT '[]',
    
    -- Posting metadata
    word_count            INTEGER,
    estimated_read_time   VARCHAR(50),
    engagement_prediction VARCHAR(20),
    best_posting_day      VARCHAR(20),
    best_posting_time     VARCHAR(30),
    timing_window         VARCHAR(100),
    
    -- Review
    status                contentstatus DEFAULT 'draft',
    review_score          FLOAT,
    review_notes          TEXT,
    review_criteria       JSON,
    revision_count        INTEGER DEFAULT 0,
    
    -- File
    file_path             VARCHAR,
    
    -- Timestamps
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at            TIMESTAMP WITH TIME ZONE
);
```

### New Enums

```sql
CREATE TYPE contentstatus AS ENUM (
    'draft', 'approved', 'needs_revision', 'flagged_for_review', 'published'
);

CREATE TYPE postformat AS ENUM (
    'thought_leadership', 'hot_take', 'case_study', 'tutorial',
    'industry_analysis', 'career_advice', 'behind_the_scenes'
);
```

### Relationships

```
scan_runs (1) ---> (N) content_posts   -- via scan_run_id FK
trend_items (1) ---> (N) content_posts -- via trend_item_id FK (optional)
```

---

## 7. LLM Configuration

Two new LLM configurations added to `app/clients/openai_client.py`:

| Function | Model | Max Tokens | Temperature | Purpose |
|----------|-------|-----------|-------------|---------|
| `get_content_gen_llm()` | gpt-4o | 8192 | 0.7 | Creative writing — post generation + image prompts |
| `get_review_llm()` | gpt-4o | 4096 | 0.1 | Precise evaluation — auto-review scoring |

**Temperature rationale:**
- **0.7 for generation** — creative writing benefits from variety. Posts should not be formulaic.
- **0.1 for review** — scoring must be consistent and deterministic. Same post should get similar scores.

**Token budget per pipeline run (3 posts):**
- Strategy alignment: ~2K input + ~500 output
- Content generation: ~4K input + ~3K output (per batch)
- Image prompts: ~1K input + ~1.5K output
- Auto-review: ~3K input + ~1K output
- **Total: ~15-20K tokens per run** (may double if revision loop triggers)

---

## 8. Strategy System

### Default Strategy File

Located at `strategy/default_strategy.json`, loaded by the `strategy_alignment` node.

```json
{
  "version": "1.0",
  "brand_voice": {
    "tone": "professional yet approachable",
    "personality": ["insightful", "data-driven", "forward-thinking"],
    "avoid": ["hype language", "clickbait", "excessive jargon"],
    "linkedin_persona": "Tech industry analyst sharing actionable insights"
  },
  "content_preferences": {
    "preferred_formats": ["thought_leadership", "industry_analysis"],
    "min_data_points_per_post": 1,
    "max_emojis": 3,
    "cta_style": "question",
    "hashtag_count": { "min": 3, "max": 5 }
  },
  "posting_insights": {
    "best_days": ["Tuesday", "Wednesday", "Thursday"],
    "best_times": ["8:00-10:00 AM", "12:00-1:00 PM"],
    "timezone": "Asia/Ho_Chi_Minh",
    "frequency": "3-5 posts per week"
  },
  "performance_history": {
    "top_performing_formats": [],
    "top_performing_topics": [],
    "avg_engagement_rate": null,
    "insights": []
  },
  "guardrails": {
    "max_strategy_changes_per_cycle": 2,
    "min_posts_between_updates": 5,
    "version_history": []
  }
}
```

### Strategy Update Flow

After each generation cycle, the `output_packaging` node saves a `strategy_update` object to `strategy/{scan_run_id}/strategy_update.json`. This captures:
- Which trends and formats were used
- Average review scores
- Content diversity score
- Notes for a future Performance Feedback Agent

This creates a version trail for strategy evolution over time.

---

## 9. Storage & Output Structure

All outputs follow the existing storage pattern (local filesystem in dev, S3 in production):

```
ai-service/
  posts/
    {scan_run_id}/
      output.json              # Complete output (content_plan + all posts + strategy_update)
      post-001.json            # Individual post file
      post-002.json
      post-003.json
  strategy/
    default_strategy.json      # Default strategy (version controlled)
    {scan_run_id}/
      strategy_update.json     # Strategy update from this generation cycle
```

---

## 10. API Endpoints

All endpoints under `/api/v1/posts`:

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| `POST` | `/api/v1/posts/generate` | 202 | Trigger async post generation for a scan run |
| `GET` | `/api/v1/posts` | 200 | List posts with filters (scan_run_id, format, status) + pagination |
| `GET` | `/api/v1/posts/{post_id}` | 200 | Get full post detail |
| `PATCH` | `/api/v1/posts/{post_id}/status` | 200 | Update post status (approve, flag, etc.) |

### POST /api/v1/posts/generate

**Request:**
```json
{
  "scan_run_id": "uuid",
  "options": {
    "num_posts": 3,
    "formats": ["thought_leadership", "hot_take"]
  }
}
```

**Response (202):**
```json
{
  "scan_run_id": "uuid",
  "status": "accepted",
  "message": "Post generation started for scan {scan_run_id}"
}
```

**Validation:** Returns 404 if scan not found, 400 if scan not completed.

### GET /api/v1/posts

**Query parameters:**
- `scan_run_id` (optional) — filter by scan run
- `format` (optional) — filter by post format
- `status` (optional) — filter by content status
- `page` (default 1) — pagination page
- `page_size` (default 20, max 100) — items per page

### PATCH /api/v1/posts/{post_id}/status

**Request:**
```json
{ "status": "approved" }
```

**Valid statuses:** `draft`, `approved`, `needs_revision`, `flagged_for_review`, `published`

---

## 11. File Structure

### New Files Created

```
app/agents/post_generator/
  __init__.py                          # Exports build_post_gen_graph, run_post_generation
  state.py                             # PostGenState TypedDict
  prompts.py                           # LLM prompt templates (5 phases)
  graph.py                             # StateGraph assembly + conditional edge
  runner.py                            # run_post_generation() entry point
  nodes/
    __init__.py                        # Exports all node functions
    strategy_alignment.py              # Phase 1: load inputs, produce content plan
    content_generation.py              # Phase 2: generate posts (+ revision mode)
    image_prompt_creation.py           # Phase 3: image prompts per post
    auto_review.py                     # Phase 4: score + route for revision
    output_packaging.py                # Phase 5: save to storage + DB

app/db/models/
  content_post.py                      # ContentPost SQLAlchemy model

app/api/v1/
  posts.py                             # API endpoints
  schemas/
    post.py                            # Pydantic request/response schemas

strategy/
  default_strategy.json                # Default brand voice + content preferences

alembic/versions/
  b9c0d1e2f3a4_add_content_posts.py   # Migration for content_posts table
```

### Modified Files

| File | Change |
|------|--------|
| `app/db/models/enums.py` | Added `ContentStatus`, `PostFormat` enums |
| `app/db/models/__init__.py` | Exports new models and enums |
| `app/db/models/scan.py` | Added `content_posts` relationship to `ScanRun` |
| `app/clients/openai_client.py` | Added `get_content_gen_llm()`, `get_review_llm()` |
| `app/api/v1/router.py` | Registered `/posts` router |

---

## 12. Implementation Tasks

### Task 1: DB Layer — Enums + ContentPost Model + Migration
- Added `ContentStatus` and `PostFormat` enums to `app/db/models/enums.py`
- Created `ContentPost` SQLAlchemy model with all fields, relationships, and indexes
- Added `content_posts` back-reference to `ScanRun` model
- Updated `__init__.py` exports
- Created Alembic migration with idempotent enum creation (`DO $$ ... EXCEPTION ... $$`)
- Used `postgresql.ENUM(create_type=False)` in migration to avoid SQLAlchemy auto-creating types
- Added `values_callable` to model `Enum()` columns to send lowercase values to PostgreSQL

### Task 2: LLM Client Configuration
- Added `get_content_gen_llm()` (gpt-4o, 8192 tokens, temp=0.7) for creative content generation
- Added `get_review_llm()` (gpt-4o, 4096 tokens, temp=0.1) for precise review scoring

### Task 3: Default Strategy File
- Created `strategy/default_strategy.json` with brand voice, content preferences, posting insights, performance history placeholders, and guardrails

### Task 4: PostGenState
- Created `PostGenState` TypedDict with fields for all 5 phases
- Uses `Annotated[list[dict], operator.add]` for error accumulation (consistent with `TrendScanState`)

### Task 5: Prompt Templates
- Created `prompts.py` with 5 prompt templates:
  - `STRATEGY_ALIGNMENT_SYSTEM_PROMPT` — content plan selection
  - `CONTENT_GENERATION_SYSTEM_PROMPT` — full post writing with 7 format templates
  - `REVISION_SYSTEM_PROMPT` — targeted rewriting using review feedback
  - `IMAGE_PROMPT_SYSTEM_PROMPT` — visual content generation instructions
  - `AUTO_REVIEW_SYSTEM_PROMPT` — 7-criteria scoring checklist

### Task 6: Agent Nodes (5 Nodes)
- **strategy_alignment** — loads trends from DB, report from storage, strategy from file; calls LLM for content plan
- **content_generation** — generates posts (first run) or revises failing posts (revision mode); merges revised posts back preserving passing ones
- **image_prompt_creation** — batches all posts into single LLM call; merges image prompts by post_id
- **auto_review** — scores each post against 7 weighted criteria; recalculates weighted score server-side; determines revision routing
- **output_packaging** — builds final JSON output, saves to storage (individual + combined), persists to `content_posts` table, saves strategy update

### Task 7: Graph Assembly + Runner
- Built `StateGraph` with 5 nodes and conditional edge for the review loop
- `review_router()` function checks `posts_to_revise` and `revision_count < 2`
- `run_post_generation()` entry point validates scan run status, initializes state, invokes graph

### Task 8: API Endpoints + Schemas
- Created Pydantic schemas: `PostGenRequest`, `PostGenResponse`, `PostSummary`, `PostDetail`, `PostStatusUpdate`, `PostListResponse`
- 4 endpoints: generate (202 + background task), list (paginated + filtered), detail, status update
- Registered `/posts` router in `v1_router`
