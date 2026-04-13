# Marketing Content Pipeline — Architecture Diagrams

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph CLIENT["👤 Client Layer (Planned)"]
        FE["Next.js 15 Frontend<br/>(Planned - Phase 3)"]
        BE["NestJS Backend<br/>(Planned - Phase 3)"]
    end

    subgraph FASTAPI["🚀 FastAPI Application (Port 8000)"]
        API["REST API<br/>app/api/v1/"]
        BG["Background Tasks<br/>(asyncio)"]
    end

    subgraph LANGGRAPH["🤖 LangGraph Pipelines"]
        P1["Pipeline 1: Trend Scanning<br/>(supervisor.py)"]
        P2["Pipeline 2: Post Generation<br/>(post_generator/graph.py)"]
    end

    subgraph INFRA["⚙️ Infrastructure Layer (app/core/)"]
        RL["Rate Limiter<br/>(Redis Sorted Set)"]
        DD["Deduplication<br/>(SHA256 + Jaccard)"]
        RT["Retry<br/>(Tenacity)"]
        ST["Storage<br/>(Local / S3)"]
    end

    subgraph DATA["💾 Data Layer"]
        PG["PostgreSQL 16<br/>(asyncpg + SQLAlchemy 2.0)"]
        RD["Redis 7<br/>(Cache + Rate Limit)"]
        FS["File Storage<br/>(reports/ + posts/)"]
    end

    subgraph EXTERNAL["🌐 External Services"]
        HN["HackerNews<br/>Firebase API"]
        OAI["OpenAI GPT-4o<br/>(via LangChain)"]
        Lumnnia Image 2.0["Lumnnia Image 2.0<br/>Image Generation"]
    end

    FE <-->|HTTP| BE
    BE <-->|HTTP| API
    API --> BG
    BG --> P1
    P1 -->|conditional| P2

    P1 --> INFRA
    P2 --> INFRA

    INFRA --> PG
    INFRA --> RD
    INFRA --> FS

    P1 -->|crawl stories| HN
    P1 -->|analyze trends| OAI
    P2 -->|generate posts| OAI
    P2 -->|generate images| BFL

    RL --> RD
    ST --> FS

    style CLIENT fill:#f5f5f5,stroke:#999,stroke-dasharray: 5 5
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
        HN_SCAN["hackernews_scanner<br/>─────────────────<br/>• Fetch top stories (Firebase API)<br/>• Crawl article URLs (5 concurrent)<br/>• Extract HTML → text<br/>• Filter tech relevance"]
    end

    HN_SCAN --> COLLECT["collect_results<br/>─────────────────<br/>• Validate & merge results<br/>• Log statistics"]

    subgraph ANALYZE["Stage 2: AI Analysis"]
        COLLECT --> ANALYZER["trend_analyzer<br/>─────────────────<br/>• Quality scoring (1-10)<br/>• Discard score < 5<br/>• Deep analysis: sentiment,<br/>  lifecycle, linkedin_angles<br/>• Generate Vietnamese report<br/>• Content angles JSON<br/>─────────────────<br/>GPT-4o · 16K tokens · temp=0.1"]
    end

    subgraph SAVE["Stage 3: Persistence"]
        ANALYZER --> SAVER["content_saver<br/>─────────────────<br/>• Save articles as markdown<br/>• YAML frontmatter + body<br/>→ reports/{scan_id}/articles/"]

        SAVER --> PERSIST["persist_results<br/>─────────────────<br/>• Update ScanRun status<br/>• Bulk insert TrendItems<br/>• Set duration_ms<br/>→ PostgreSQL"]
    end

    PERSIST --> DECISION{generate_posts<br/>= True?}
    DECISION -->|Yes| POST_GEN["→ Pipeline 2:<br/>Post Generation"]
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

    STRATEGY["strategy_alignment<br/>─────────────────<br/>• Load TrendItems from DB<br/>• Read trend report markdown<br/>• Load strategy config<br/>• Select trends + angles + formats<br/>─────────────────<br/>GPT-4o · 8K tokens · temp=0.7"]

    STRATEGY --> CONTENT["content_generation<br/>─────────────────<br/>• 7 format templates:<br/>  thought_leadership, hot_take,<br/>  case_study, tutorial,<br/>  industry_analysis, career_advice,<br/>  behind_the_scenes<br/>• LinkedIn formatting rules<br/>• Hook + CTA + Hashtags<br/>─────────────────<br/>GPT-4o · 8K tokens · temp=0.7"]

    CONTENT --> IMG_PROMPT["image_prompt_creation<br/>─────────────────<br/>• Map format → image style<br/>• Generate Lumnia2.0 prompt<br/>• Aspect ratio, text overlay<br/>─────────────────<br/>GPT-4o · 4K tokens · temp=0.3"]

    IMG_PROMPT --> IMG_GEN["image_generation<br/>─────────────────<br/>• Call Lumnia2.0 Model<br/>• 1200×1200 for LinkedIn<br/>• Save image to storage"]

    IMG_GEN --> REVIEW["auto_review<br/>─────────────────<br/>7 Criteria (weighted):<br/>• Hook strength (20%)<br/>• Value density (15%)<br/>• Data points (15%)<br/>• Strategy alignment (15%)<br/>• Originality (15%)<br/>• CTA quality (10%)<br/>• Format compliance (10%)<br/>─────────────────<br/>GPT-4o · 4K tokens · temp=0.1"]

    REVIEW --> ROUTER{review_router<br/>─────────<br/>score < 7 AND<br/>revision < 2?}

    ROUTER -->|"revise<br/>(revision_count++)"| CONTENT
    ROUTER -->|"package<br/>(score ≥ 7 or max revisions)"| OUTPUT

    OUTPUT["output_packaging<br/>─────────────────<br/>• Build final JSON output<br/>• Enrich: word_count, read_time,<br/>  posting_day, timing_window<br/>• Save to storage + PostgreSQL<br/>→ posts/{scan_id}/<br/>→ content_posts table"]

    OUTPUT --> END_NODE((END))

    style START fill:#4caf50,color:#fff
    style END_NODE fill:#f44336,color:#fff
    style ROUTER fill:#fff9c4,stroke:#f9a825
    style REVIEW fill:#ffebee,stroke:#c62828
```

---

## 4. Database Entity Relationship Diagram

```mermaid
erDiagram
    ScanRun ||--o{ TrendItem : "has many"
    ScanRun ||--o{ ContentPost : "generates"
    TrendItem ||--o{ TrendComment : "has many"
    TrendItem ||--o{ ContentPost : "source for"
    ScanSchedule ||--o{ ScanRun : "triggers"

    ScanRun {
        UUID id PK
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
        UUID trend_item_id FK
        enum format "thought_leadership|hot_take|case_study|..."
        text caption
        JSON hashtags
        varchar cta
        JSON image_prompt
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
```

---

## 5. API Endpoint Map

```mermaid
graph LR
    subgraph SCAN["Scan Management"]
        S1["POST /api/v1/scan<br/>→ 202 Accepted"]
        S2["GET /api/v1/scan/{id}/status<br/>→ scan progress"]
        S3["POST /api/v1/scan/schedule<br/>→ create cron"]
        S4["GET /api/v1/scan/schedule<br/>→ list schedules"]
    end

    subgraph TRENDS["Trend Queries"]
        T1["GET /api/v1/trends<br/>→ list + filters + pagination"]
        T2["GET /api/v1/trends/top<br/>→ top by 24h/7d/30d"]
        T3["GET /api/v1/trends/{id}<br/>→ detail + comments"]
    end

    subgraph REPORTS["Reports"]
        R1["GET /api/v1/reports<br/>→ list reports"]
        R2["GET /api/v1/reports/{id}<br/>→ markdown report"]
        R3["GET /api/v1/reports/{id}/summary<br/>→ JSON + angles"]
    end

    subgraph POSTS["Post Generation"]
        P1["POST /api/v1/posts/generate<br/>→ 202 trigger gen"]
        P2["GET /api/v1/posts<br/>→ list posts"]
        P3["GET /api/v1/posts/{id}<br/>→ post detail"]
        P4["PATCH /api/v1/posts/{id}/status<br/>→ update status"]
    end

    CLIENT["Client / API Consumer"] --> SCAN
    CLIENT --> TRENDS
    CLIENT --> REPORTS
    CLIENT --> POSTS

    style SCAN fill:#e8f5e9,stroke:#388e3c
    style TRENDS fill:#e3f2fd,stroke:#1565c0
    style REPORTS fill:#fff3e0,stroke:#ef6c00
    style POSTS fill:#fce4ec,stroke:#c62828
```

---

## 6. Data Flow — End-to-End Request Lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant API as FastAPI
    participant PG as PostgreSQL
    participant BG as Background Task
    participant HN as HackerNews API
    participant GPT as OpenAI GPT-4o
    participant Lumnia Image 2.0
    participant RD as Redis
    participant FS as File Storage

    C->>API: POST /api/v1/scan
    API->>PG: Create ScanRun (PENDING)
    API-->>C: 202 {scan_id, status: "accepted"}

    API->>BG: Queue run_scan()
    BG->>PG: Update ScanRun → RUNNING

    rect rgb(227, 242, 253)
        Note over BG,HN: Pipeline 1: Trend Scanning
        BG->>RD: Check rate limit
        RD-->>BG: OK
        BG->>HN: GET /v0/topstories.json
        HN-->>BG: [story_ids]
        BG->>HN: GET /v0/item/{id}.json (×N)
        HN-->>BG: Story details
        BG->>HN: Crawl article URLs (5 concurrent)
        HN-->>BG: Article text content
    end

    rect rgb(255, 243, 224)
        Note over BG,GPT: AI Analysis
        BG->>GPT: Analyze trends (16K, temp=0.1)
        GPT-->>BG: Quality scores, sentiment, lifecycle, angles, report
    end

    rect rgb(232, 245, 233)
        Note over BG,FS: Persist Results
        BG->>FS: Save articles as markdown
        BG->>FS: Save trend report + summary
        BG->>PG: Bulk insert TrendItems
        BG->>PG: Update ScanRun (COMPLETED)
    end

    C->>API: POST /api/v1/posts/generate
    API->>PG: Read TrendItems + ScanRun
    API-->>C: 202 Accepted

    rect rgb(252, 228, 236)
        Note over BG,BFL: Pipeline 2: Post Generation
        BG->>GPT: Strategy alignment (8K, temp=0.7)
        GPT-->>BG: content_plan[]
        BG->>GPT: Generate posts (8K, temp=0.7)
        GPT-->>BG: LinkedIn posts (7 formats)
        BG->>GPT: Image prompts (4K, temp=0.3)
        GPT-->>BG: Lumnia Image 2.0 prompts
        BG->>BFL: Generate images (1200×1200)
        BFL-->>BG: Image URLs
        BG->>GPT: Auto-review (4K, temp=0.1)
        GPT-->>BG: Scores (7 criteria)

        alt Score < 7 AND revision < 2
            BG->>GPT: Revise posts with feedback
            GPT-->>BG: Revised posts
            BG->>GPT: Re-review
            GPT-->>BG: Updated scores
        end

        BG->>FS: Save posts JSON + images
        BG->>PG: Insert ContentPosts
    end

    C->>API: GET /api/v1/posts
    API->>PG: Query ContentPosts
    API-->>C: Posts with scores + images
```

---

## 7. Infrastructure & Deployment

```mermaid
graph TB
    subgraph DOCKER["Docker Compose"]
        subgraph APP["app container"]
            UVICORN["Uvicorn<br/>FastAPI + LangGraph<br/>Port 8000"]
        end

        subgraph DB["postgres container"]
            POSTGRES["PostgreSQL 16 Alpine<br/>Port 5432<br/>─────────────────<br/>DB: trending_scanner<br/>User: scanner"]
        end

        subgraph CACHE["redis container"]
            REDIS["Redis 7 Alpine<br/>Port 6379<br/>─────────────────<br/>• API response cache (30min TTL)<br/>• Rate limit counters<br/>• Sliding window sets"]
        end
    end

    subgraph STORAGE["File Storage"]
        LOCAL["Local Filesystem<br/>(Development)<br/>─────────────────<br/>ai-service/reports/<br/>ai-service/posts/<br/>ai-service/strategy/"]
        S3["AWS S3<br/>(Production)<br/>─────────────────<br/>s3://{bucket}/{prefix}/"]
    end

    subgraph CONFIG["Configuration"]
        ENV[".env file<br/>─────────────────<br/>DATABASE_URL<br/>REDIS_URL<br/>OPENAI_API_KEY<br/>BFL_API_KEY<br/>S3_BUCKET<br/>APP_ENV"]
        PYDANTIC["Pydantic Settings<br/>app/config.py<br/>─────────────────<br/>@lru_cache<br/>get_settings()"]
    end

    subgraph MIGRATIONS["Database Migrations"]
        ALEMBIC["Alembic<br/>alembic/versions/*.py"]
    end

    UVICORN --> POSTGRES
    UVICORN --> REDIS
    UVICORN --> LOCAL
    UVICORN --> S3
    ENV --> PYDANTIC
    PYDANTIC --> UVICORN
    ALEMBIC --> POSTGRES

    style DOCKER fill:#e3f2fd,stroke:#1565c0
    style STORAGE fill:#e8f5e9,stroke:#388e3c
    style CONFIG fill:#fff3e0,stroke:#ef6c00
    style MIGRATIONS fill:#f3e5f5,stroke:#7b1fa2
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

        E["get_llm()<br/>─────────────────<br/>max_tokens: 4,096<br/>temperature: 0.0<br/>─────────────────<br/>Used by: general analysis"]
    end

    PRECISE["🎯 Precise<br/>temp 0.0-0.1"] --> A
    PRECISE --> D
    PRECISE --> E
    BALANCED["⚖️ Balanced<br/>temp 0.3"] --> B
    CREATIVE["🎨 Creative<br/>temp 0.7"] --> C

    style PRECISE fill:#e8f5e9,stroke:#388e3c
    style BALANCED fill:#fff3e0,stroke:#ef6c00
    style CREATIVE fill:#fce4ec,stroke:#c62828
```

---

## 9. Scan Run State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: POST /api/v1/scan

    PENDING --> RUNNING: Background task starts

    RUNNING --> COMPLETED: All platforms succeed
    RUNNING --> PARTIAL: Some platforms fail
    RUNNING --> FAILED: All platforms fail / unhandled error

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
    [*] --> draft: Post generated

    draft --> auto_review: auto_review node scores post

    state auto_review <<choice>>
    auto_review --> needs_revision: score < 7 AND revision < 2
    auto_review --> approved: score >= 7
    auto_review --> flagged_for_review: score < 7 AND revision >= 2

    needs_revision --> draft: content_generation revises

    approved --> published: PATCH /posts/{id}/status
    flagged_for_review --> approved: Manual human review

    published --> [*]
```
