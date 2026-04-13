# Marketing Content Pipeline — Architecture Diagrams

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph CLIENT["Client Layer"]
        FE["Next.js 14 Frontend<br/>Port 3001<br/>─────────────────<br/>Dashboard, Trends, Content,<br/>Media, Schedule, Analytics"]
    end

    subgraph BACKEND["NestJS Backend (Port 3000)"]
        AUTH["Auth Module<br/>JWT + Google OAuth"]
        GW["API Gateway<br/>11 Modules"]
        WS["WebSocket Gateway<br/>Socket.IO"]
    end

    subgraph FASTAPI["FastAPI AI Service (Port 8000)"]
        API["REST API<br/>app/api/v1/"]
        BG["Background Tasks<br/>(asyncio)"]
    end

    subgraph LANGGRAPH["LangGraph Pipelines"]
        P1["Pipeline 1: Trend Scanning<br/>(supervisor.py)"]
        P2["Pipeline 2: Post Generation<br/>(post_generator/graph.py)"]
        P3["Pipeline 3: Publish Post<br/>(publish_post/graph.py)"]
    end

    subgraph INFRA["Infrastructure Layer (app/core/)"]
        RL["Rate Limiter<br/>(Redis Sorted Set)"]
        DD["Deduplication<br/>(SHA256 + Jaccard)"]
        RT["Retry<br/>(Tenacity)"]
        ST["Storage<br/>(Local / S3)"]
    end

    subgraph DATA["Data Layer"]
        PG["PostgreSQL 16<br/>─────────────────<br/>ai schema (Alembic)<br/>app schema (Prisma)"]
        RD["Redis 7<br/>─────────────────<br/>Cache + Rate Limit<br/>+ APScheduler Jobs"]
        FS["File Storage<br/>(reports/ + posts/)"]
    end

    subgraph EXTERNAL["External Services"]
        HN["HackerNews<br/>Firebase API"]
        OAI["OpenAI GPT-4o<br/>(via LangChain)"]
        BFL["BFL<br/>Image Generation"]
        TT["TikTok API<br/>OAuth + Publish"]
    end

    FE <-->|HTTP + WS| BACKEND
    AUTH --> GW
    GW <-->|HTTP| API
    WS <-->|Events| FE
    API --> BG
    BG --> P1
    P1 -->|conditional| P2
    P2 -->|approved posts| P3

    P1 --> INFRA
    P2 --> INFRA
    P3 --> INFRA

    INFRA --> PG
    INFRA --> RD
    INFRA --> FS

    P1 -->|crawl stories| HN
    P1 -->|analyze trends| OAI
    P2 -->|generate posts| OAI
    P2 -->|generate images| BFL
    P3 -->|publish posts| TT

    RL --> RD
    ST --> FS

    style CLIENT fill:#e3f2fd,stroke:#1565c0
    style BACKEND fill:#f3e5f5,stroke:#7b1fa2
    style FASTAPI fill:#e8f5e9,stroke:#388e3c
    style LANGGRAPH fill:#e3f2fd,stroke:#1565c0
    style INFRA fill:#fff3e0,stroke:#ef6c00
    style DATA fill:#fce4ec,stroke:#c62828
    style EXTERNAL fill:#f3e5f5,stroke:#7b1fa2
```

---

## 2. LangGraph Pipeline 1 — Trend Scanning & Analysis

```mermaid
graph TD
    START((START)) --> HN_SCAN

    subgraph SCAN["Stage 1: Data Collection"]
        HN_SCAN["hackernews_scanner<br/>─────────────────<br/>Fetch top stories (Firebase API)<br/>Crawl article URLs (5 concurrent)<br/>Extract HTML to text<br/>Filter tech relevance"]
    end

    HN_SCAN --> COLLECT["collect_results<br/>─────────────────<br/>Validate & merge results<br/>Log statistics"]

    subgraph ANALYZE["Stage 2: AI Analysis"]
        COLLECT --> ANALYZER["trend_analyzer<br/>─────────────────<br/>Quality scoring (1-10)<br/>Discard score < 5<br/>Deep analysis: sentiment,<br/>  lifecycle, engagement_prediction<br/>Generate Vietnamese report<br/>Content angles JSON<br/>─────────────────<br/>GPT-4o | 16K tokens | temp=0.1"]
    end

    subgraph SAVE["Stage 3: Persistence"]
        ANALYZER --> SAVER["content_saver<br/>─────────────────<br/>Save articles as markdown<br/>YAML frontmatter + body<br/>to reports/{scan_id}/articles/"]

        SAVER --> PERSIST["persist_results<br/>─────────────────<br/>Update ScanRun status<br/>Bulk insert TrendItems<br/>Auto-create ContentPosts<br/>Set duration_ms<br/>to PostgreSQL"]
    end

    PERSIST --> DECISION{generate_posts<br/>= True?}
    DECISION -->|Yes| POST_GEN["Pipeline 2:<br/>Post Generation"]
    DECISION -->|No| END_NODE((END))
    POST_GEN --> END_NODE

    style START fill:#4caf50,color:#fff
    style END_NODE fill:#f44336,color:#fff
    style SCAN fill:#e3f2fd,stroke:#1565c0
    style ANALYZE fill:#fff3e0,stroke:#ef6c00
    style SAVE fill:#e8f5e9,stroke:#388e3c
    style DECISION fill:#fff9c4,stroke:#f9a825
```

---

## 3. LangGraph Pipeline 2 — Post Generation Agent

```mermaid
graph TD
    START((START)) --> STRATEGY

    STRATEGY["strategy_alignment<br/>─────────────────<br/>Load TrendItems from DB<br/>Read trend report markdown<br/>Load strategy config<br/>Select trends + angles + formats<br/>─────────────────<br/>GPT-4o | 8K tokens | temp=0.7"]

    STRATEGY --> CONTENT["content_generation<br/>─────────────────<br/>7 format templates:<br/>  quick_tips, hot_take,<br/>  trending_breakdown, did_you_know,<br/>  tutorial_hack, myth_busters,<br/>  behind_the_tech<br/>Hook + CTA + Hashtags<br/>─────────────────<br/>GPT-4o | 8K tokens | temp=0.7"]

    CONTENT --> IMG_PROMPT["image_prompt_creation<br/>─────────────────<br/>Map format to image style<br/>Generate BFL prompt<br/>Aspect ratio, text overlay<br/>─────────────────<br/>GPT-4o | 4K tokens | temp=0.1"]

    IMG_PROMPT --> IMG_GEN["image_generation<br/>─────────────────<br/>Call BFL API<br/>Save image to storage"]

    IMG_GEN --> REVIEW["auto_review<br/>─────────────────<br/>7 Criteria (weighted):<br/>Hook strength (20%)<br/>Value density (15%)<br/>Data points (15%)<br/>Strategy alignment (15%)<br/>Originality (15%)<br/>CTA quality (10%)<br/>Format compliance (10%)<br/>─────────────────<br/>GPT-4o | 4K tokens | temp=0.1"]

    REVIEW --> ROUTER{review_router<br/>─────────<br/>score < 7 AND<br/>revision < 2?}

    ROUTER -->|"revise<br/>(revision_count++)"| CONTENT
    ROUTER -->|"package<br/>(score >= 7 or max revisions)"| OUTPUT

    OUTPUT["output_packaging<br/>─────────────────<br/>Build final JSON output<br/>Enrich: word_count, read_time,<br/>  posting_day, timing_window<br/>Save to storage + PostgreSQL<br/>to posts/{scan_id}/<br/>to content_posts table"]

    OUTPUT --> END_NODE((END))

    style START fill:#4caf50,color:#fff
    style END_NODE fill:#f44336,color:#fff
    style ROUTER fill:#fff9c4,stroke:#f9a825
    style REVIEW fill:#ffebee,stroke:#c62828
```

---

## 4. LangGraph Pipeline 3 — Publish Post Agent

```mermaid
graph TD
    START((START)) --> VALIDATE

    VALIDATE["resolve_and_validate<br/>─────────────────<br/>Load ContentPost from DB<br/>Validate status (approved)<br/>Check duplicate publishes<br/>Create PublishedPost record<br/>Resolve image public URL<br/>Validate TikTok token"]

    VALIDATE --> GOLDEN["golden_hour<br/>─────────────────<br/>Load EngagementTimeSlot data<br/>Calculate optimal posting time<br/>Default: 07:00, 12:00, 19:00<br/>Timezone: Asia/Ho_Chi_Minh"]

    GOLDEN --> SCHEDULER["scheduler<br/>─────────────────<br/>Decide: publish now<br/>or schedule via APScheduler<br/>APScheduler + Redis job store"]

    SCHEDULER --> ROUTE{_route_after_schedule<br/>─────────<br/>publish_now<br/>or scheduled?}

    ROUTE -->|publish_now| PUBLISH["publish_node<br/>─────────────────<br/>Assemble caption<br/>(body + hashtags + CTA)<br/>TikTok API photo post<br/>(3-step process)<br/>Retry 3x + poll status<br/>Privacy: SELF_ONLY default"]
    ROUTE -->|scheduled| END_SCHED((END<br/>APScheduler<br/>triggers later))

    PUBLISH --> END_NODE((END))

    style START fill:#4caf50,color:#fff
    style END_NODE fill:#f44336,color:#fff
    style END_SCHED fill:#ff9800,color:#fff
    style ROUTE fill:#fff9c4,stroke:#f9a825
    style PUBLISH fill:#e8f5e9,stroke:#388e3c
```

---

## 5. Database Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ AuthIdentity : "has"
    User ||--o{ RefreshToken : "has"
    User ||--o{ AuditLog : "creates"
    User ||--o{ ScanRun : "triggers"
    ScanRun ||--o{ TrendItem : "has many"
    ScanRun ||--o{ ContentPost : "generates"
    TrendItem ||--o{ TrendComment : "has many"
    TrendItem ||--o{ ContentPost : "source for"
    ContentPost ||--o{ PublishedPost : "published as"
    ScanSchedule ||--o{ ScanRun : "triggers"

    User {
        UUID id PK
        varchar email "unique"
        varchar passwordHash
        varchar displayName
        varchar avatarUrl
        enum role "admin|user"
        timestamp createdAt
        timestamp updatedAt
    }

    AuthIdentity {
        UUID id PK
        UUID userId FK
        varchar provider "local|google"
        varchar providerUserId
        timestamp createdAt
    }

    RefreshToken {
        UUID id PK
        UUID userId FK
        varchar tokenHash "unique"
        timestamp expiresAt
        timestamp revokedAt
        timestamp createdAt
    }

    ScanRun {
        UUID id PK
        UUID triggeredBy FK "nullable, to User"
        enum status "pending|running|completed|partial|failed"
        JSON platforms_requested
        JSON platforms_completed
        JSON platforms_failed
        int total_items_found
        varchar langgraph_thread_id
        timestamp started_at
        timestamp completed_at
        int duration_ms
        varchar error
        varchar report_file_path
    }

    TrendItem {
        UUID id PK
        UUID scan_run_id FK
        varchar title
        text description
        text content_body
        varchar source_url
        enum platform "hackernews"
        int views
        int likes
        int comments_count
        int shares
        float trending_score
        varchar category
        enum sentiment "bullish|neutral|bearish|controversial"
        enum lifecycle "emerging|rising|peaking|saturated|declining"
        float relevance_score "0-10"
        float quality_score "1-10"
        enum engagement_prediction "low|medium|high|viral"
        enum source_type "official_blog|news|research|community|social"
        JSON linkedin_angles
        JSON key_data_points
        text cleaned_content
        varchar dedup_key
        timestamp published_at
        timestamp discovered_at
    }

    ContentPost {
        UUID id PK
        UUID scan_run_id FK
        UUID trend_item_id FK "nullable"
        UUID created_by "nullable, User ID"
        enum format "quick_tips|hot_take|trending_breakdown|..."
        text caption
        JSON hashtags
        varchar cta
        JSON image_prompt
        varchar trend_title
        varchar trend_url
        enum status "draft|approved|needs_revision|flagged|published"
        float review_score "1-10"
        text review_notes
        JSON review_criteria
        int revision_count
        int word_count
        varchar estimated_read_time
        varchar best_posting_day
        varchar best_posting_time
        varchar file_path
        varchar image_path
        timestamp created_at
        timestamp updated_at
    }

    PublishedPost {
        UUID id PK
        UUID content_post_id FK
        UUID published_by "nullable, User ID"
        varchar platform
        enum publish_mode "auto|manual"
        enum status "pending|processing|published|failed|cancelled"
        varchar privacy_level
        varchar tiktok_publish_id
        varchar platform_post_id
        varchar golden_hour_slot
        timestamp scheduled_at
        timestamp published_at
        varchar scheduler_job_id
        text assembled_caption
        varchar error_message
        int retry_count
        JSON api_response
        timestamp created_at
        timestamp updated_at
    }

    UserPlatformToken {
        UUID id PK
        UUID user_id
        varchar platform
        text encrypted_access_token
        text encrypted_refresh_token
        varchar open_id
        timestamp token_expires_at
        timestamp created_at
        timestamp updated_at
    }

    EngagementTimeSlot {
        UUID id PK
        varchar platform
        varchar time_slot
        int slot_index
        float avg_views
        float avg_likes
        float avg_comments
        float avg_shares
        float weighted_score
        int sample_count
        timestamp updated_at
    }

    TrendComment {
        UUID id PK
        UUID trend_item_id FK
        text text
        varchar author
        timestamp created_at
    }

    ScanSchedule {
        UUID id PK
        varchar cron_expression
        enum status "active|paused|archived"
        timestamp last_run
        timestamp next_run
        timestamp created_at
    }

    AuditLog {
        UUID id PK
        UUID userId FK "nullable"
        varchar action
        varchar resource
        varchar resourceId
        JSON metadata
        timestamp createdAt
    }
```

---

## 6. API Endpoint Map

```mermaid
graph LR
    subgraph GATEWAY["Backend Gateway (:3000)"]
        direction TB
        subgraph AUTH_EP["Auth (Public)"]
            A1["POST /auth/register"]
            A2["POST /auth/login"]
            A3["POST /auth/refresh"]
            A4["GET /auth/google"]
        end

        subgraph PROTECTED["Protected (JWT Required)"]
            subgraph SCAN_EP["Scans"]
                S1["GET /scans"]
                S2["POST /scans"]
                S3["GET /scans/{id}/status"]
            end

            subgraph TREND_EP["Trends"]
                T1["GET /trends"]
                T2["GET /trends/top"]
                T3["GET /trends/{id}"]
            end

            subgraph POST_EP["Posts"]
                P1["GET /posts"]
                P2["POST /posts/generate"]
                P3["PATCH /posts/{id}/status"]
            end

            subgraph PUB_EP["Publish"]
                PB1["POST /publish/{postId}"]
                PB2["POST /publish/{postId}/schedule"]
                PB3["POST /publish/{postId}/auto"]
                PB4["DELETE /publish/{postId}/schedule"]
                PB5["GET /publish/{id}/status"]
                PB6["GET /publish/golden-hours"]
            end

            subgraph REPORT_EP["Reports"]
                R1["GET /reports"]
            end
        end
    end

    subgraph AI_SERVICE["AI Service (:8000)"]
        AI_SCAN["POST /api/v1/scan"]
        AI_TRENDS["GET /api/v1/trends"]
        AI_POSTS["POST /api/v1/posts/generate"]
        AI_PUB["POST /api/v1/publish/{id}"]
        AI_AUTH["GET /api/v1/auth/tiktok/*"]
    end

    S2 -->|proxy| AI_SCAN
    T1 -->|proxy| AI_TRENDS
    P2 -->|proxy| AI_POSTS
    PB1 -->|proxy| AI_PUB

    style GATEWAY fill:#f3e5f5,stroke:#7b1fa2
    style AI_SERVICE fill:#e8f5e9,stroke:#388e3c
    style AUTH_EP fill:#fff3e0,stroke:#ef6c00
    style PROTECTED fill:#e3f2fd,stroke:#1565c0
```

---

## 7. Data Flow — End-to-End Request Lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant BE as Backend
    participant AI as AI Service
    participant PG as PostgreSQL
    participant HN as HackerNews API
    participant GPT as OpenAI GPT-4o
    participant BFL as BFL Image API
    participant TT as TikTok API
    participant RD as Redis

    Note over U,TT: Phase 1: Trend Scanning

    U->>FE: Click "Start Scan"
    FE->>BE: POST /scans (JWT)
    BE->>AI: POST /api/v1/scan (X-User-Id)
    AI->>PG: Create ScanRun (PENDING)
    AI-->>BE: 202 {scan_id}
    BE-->>FE: 202 {scan_id}
    FE->>BE: WebSocket subscribe(scan, scan_id)

    AI->>PG: Update ScanRun RUNNING

    rect rgb(227, 242, 253)
        Note over AI,HN: HackerNews Crawling
        AI->>RD: Check rate limit
        AI->>HN: GET /v0/topstories.json
        HN-->>AI: [story_ids]
        AI->>HN: Crawl article URLs (5 concurrent)
        HN-->>AI: Article text
    end

    rect rgb(255, 243, 224)
        Note over AI,GPT: Trend Analysis
        AI->>GPT: Analyze trends (16K, temp=0.1)
        GPT-->>AI: Quality scores, sentiment, lifecycle, report
    end

    rect rgb(232, 245, 233)
        Note over AI,PG: Persist
        AI->>PG: Save articles as markdown
        AI->>PG: Bulk insert TrendItems
        AI->>PG: Update ScanRun COMPLETED
    end

    BE-->>FE: WS: scan_completed
    FE-->>U: Show results

    Note over U,TT: Phase 2: Post Generation

    U->>FE: Click "Generate Posts"
    FE->>BE: POST /posts/generate (JWT)
    BE->>AI: POST /api/v1/posts/generate

    rect rgb(252, 228, 236)
        Note over AI,BFL: Post Generation Pipeline
        AI->>GPT: Strategy alignment (8K, temp=0.7)
        AI->>GPT: Generate posts (8K, temp=0.7)
        AI->>GPT: Image prompts (4K, temp=0.1)
        AI->>BFL: Generate images
        BFL-->>AI: Image URLs
        AI->>GPT: Auto-review (4K, temp=0.1)

        alt Score < 7 AND revision < 2
            AI->>GPT: Revise posts
            AI->>GPT: Re-review
        end

        AI->>PG: Insert ContentPosts
    end

    AI-->>BE: Posts created
    BE-->>FE: WS: posts_ready
    FE-->>U: Show generated posts

    Note over U,TT: Phase 3: Publish to TikTok

    U->>FE: Review & approve post
    FE->>BE: PATCH /posts/{id}/status (approved)
    U->>FE: Click "Publish"
    FE->>BE: POST /publish/{postId}
    BE->>AI: POST /api/v1/publish/{id}

    rect rgb(243, 229, 245)
        Note over AI,TT: Publish Pipeline
        AI->>PG: Load ContentPost + validate
        AI->>PG: Create PublishedPost
        AI->>RD: Check golden hour
        AI->>TT: Initialize photo post
        TT-->>AI: publish_id
        AI->>TT: Upload image
        AI->>TT: Poll publish status
        TT-->>AI: Published
        AI->>PG: Update PublishedPost (published)
    end

    AI-->>BE: Published
    BE-->>FE: WS: publish_completed
    FE-->>U: Show success
```

---

## 8. LLM Configuration Map

```mermaid
graph LR
    subgraph LLM_CONFIG["OpenAI GPT-4o Configurations"]
        A["get_analyzer_llm()<br/>─────────────────<br/>max_tokens: 16,384<br/>temperature: 0.1<br/>─────────────────<br/>Used by: trend_analyzer"]

        B["get_report_llm()<br/>─────────────────<br/>max_tokens: 8,192<br/>temperature: 0.3<br/>─────────────────<br/>Used by: reporter"]

        C["get_content_gen_llm()<br/>─────────────────<br/>max_tokens: 8,192<br/>temperature: 0.7<br/>─────────────────<br/>Used by: strategy_alignment,<br/>content_generation"]

        D["get_review_llm()<br/>─────────────────<br/>max_tokens: 4,096<br/>temperature: 0.1<br/>─────────────────<br/>Used by: auto_review,<br/>image_prompt_creation"]

        E["get_llm()<br/>─────────────────<br/>max_tokens: 4,096<br/>temperature: 0.0<br/>─────────────────<br/>Used by: general tasks"]
    end

    PRECISE["Precise<br/>temp 0.0-0.1"] --> A
    PRECISE --> D
    PRECISE --> E
    BALANCED["Balanced<br/>temp 0.3"] --> B
    CREATIVE["Creative<br/>temp 0.7"] --> C

    style PRECISE fill:#e8f5e9,stroke:#388e3c
    style BALANCED fill:#fff3e0,stroke:#ef6c00
    style CREATIVE fill:#fce4ec,stroke:#c62828
```

---

## 9. Scan Run State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: POST /scans (via backend)

    PENDING --> RUNNING: Background task starts

    RUNNING --> COMPLETED: All scanners succeed
    RUNNING --> PARTIAL: Some scanners fail
    RUNNING --> FAILED: All fail / unhandled error

    COMPLETED --> [*]
    PARTIAL --> [*]
    FAILED --> [*]

    note right of PENDING: ScanRun created in DB
    note right of RUNNING: LangGraph pipeline executing
    note left of COMPLETED: All TrendItems persisted
```

---

## 10. Content Post Review Lifecycle

```mermaid
stateDiagram-v2
    [*] --> draft: Post generated by Pipeline 2

    draft --> auto_review: auto_review node scores post

    state auto_review <<choice>>
    auto_review --> needs_revision: score < 7 AND revision < 2
    auto_review --> approved: score >= 7
    auto_review --> flagged_for_review: score < 7 AND revision >= 2

    needs_revision --> draft: content_generation revises

    approved --> published: User publishes via Pipeline 3
    flagged_for_review --> approved: Manual human review via frontend

    published --> [*]
```

---

## 11. Publish Post State Machine

```mermaid
stateDiagram-v2
    [*] --> pending: POST /publish/{postId}

    pending --> processing: Pipeline 3 starts

    processing --> published: TikTok API success
    processing --> failed: TikTok API error (after 3 retries)
    processing --> cancelled: User cancels scheduled publish

    pending --> cancelled: DELETE /publish/{postId}/schedule

    published --> [*]
    failed --> [*]
    cancelled --> [*]

    note right of pending: PublishedPost created
    note right of processing: TikTok API calls in progress
    note left of published: platform_post_id set
```

---

## 12. Infrastructure & Deployment

```mermaid
graph TB
    subgraph DOCKER["Docker Compose"]
        subgraph FE_CONTAINER["frontend (separate)"]
            NEXT["Next.js 14<br/>Port 3001<br/>─────────────────<br/>npm run dev"]
        end

        subgraph BE_CONTAINER["backend container"]
            NEST["NestJS<br/>Port 3000<br/>─────────────────<br/>11 Modules<br/>JWT + WebSocket"]
        end

        subgraph AI_CONTAINER["ai-service container"]
            UVICORN["Uvicorn<br/>FastAPI + LangGraph<br/>Port 8000<br/>─────────────────<br/>3 Pipelines"]
        end

        subgraph DB["postgres container"]
            POSTGRES["PostgreSQL 16 Alpine<br/>Port 5432<br/>─────────────────<br/>DB: trending_scanner<br/>Schemas: ai + app<br/>Roles: scanner, ai_svc, backend_svc"]
        end

        subgraph CACHE["redis container"]
            REDIS["Redis 7 Alpine<br/>Port 6379<br/>─────────────────<br/>API cache (30min TTL)<br/>Rate limit counters<br/>APScheduler job store"]
        end
    end

    subgraph STORAGE["File Storage"]
        LOCAL["Local Filesystem<br/>(Development)<br/>─────────────────<br/>ai-service/reports/<br/>ai-service/posts/<br/>ai-service/strategy/"]
        S3["AWS S3<br/>(Production)<br/>─────────────────<br/>s3://{bucket}/{prefix}/"]
    end

    subgraph CONFIG["Configuration"]
        AI_ENV["ai-service/.env<br/>─────────────────<br/>DATABASE_URL<br/>REDIS_URL<br/>OPENAI_API_KEY<br/>TIKTOK_CLIENT_KEY<br/>TOKEN_ENCRYPTION_KEY<br/>BFL_API_KEY"]
        BE_ENV["backend/.env<br/>─────────────────<br/>DATABASE_URL<br/>JWT_ACCESS_SECRET<br/>JWT_REFRESH_SECRET<br/>AI_SERVICE_URL<br/>GOOGLE_CLIENT_ID"]
    end

    subgraph MIGRATIONS["Database Migrations"]
        ALEMBIC["Alembic<br/>ai schema<br/>alembic/versions/*.py"]
        PRISMA["Prisma<br/>app schema<br/>prisma/migrations/"]
        INITDB["init-db.sql<br/>Role bootstrap<br/>backend/docker/"]
    end

    NEXT --> NEST
    NEST --> UVICORN
    UVICORN --> POSTGRES
    UVICORN --> REDIS
    NEST --> POSTGRES
    UVICORN --> LOCAL
    UVICORN --> S3
    AI_ENV --> UVICORN
    BE_ENV --> NEST
    ALEMBIC --> POSTGRES
    PRISMA --> POSTGRES
    INITDB --> POSTGRES

    style DOCKER fill:#e3f2fd,stroke:#1565c0
    style STORAGE fill:#e8f5e9,stroke:#388e3c
    style CONFIG fill:#fff3e0,stroke:#ef6c00
    style MIGRATIONS fill:#f3e5f5,stroke:#7b1fa2
```
