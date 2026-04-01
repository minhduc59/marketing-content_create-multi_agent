# Marketing Content AI Agent — LinkedIn Technology Content Pipeline

An AI-powered system that crawls trending technology content from Hacker News, analyzes it, and generates LinkedIn content recommendations for technology professionals.

## Problem

Technology professionals and content creators spend hours:
- Searching for trending tech topics manually
- Writing LinkedIn posts and articles
- Keeping up with industry developments
- Creating thought leadership content

## Solution

A LangGraph-powered pipeline that automates technology trend discovery and LinkedIn content generation:

```
HackerNews Crawler → Trend Analysis (GPT-4o) → Content Saver → LinkedIn Report Generator
```

**Data source:** Hacker News (top stories, full article crawling, tech filtering)
**Target platform:** LinkedIn (thought leadership, industry insights, professional development)
**Domain focus:** Technology

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **AI Service** | FastAPI, LangGraph, GPT-4o |
| **Database** | PostgreSQL 16, SQLAlchemy 2.0 (async) |
| **Cache/Queue** | Redis 7 |
| **Infrastructure** | Docker + Docker Compose |

## Project Structure

```
marketing-content/
├── ai-service/                  # [ACTIVE] FastAPI AI service
│   ├── app/
│   │   ├── main.py              # FastAPI app, lifespan, CORS
│   │   ├── config.py            # Pydantic Settings (env vars)
│   │   ├── agents/              # LangGraph agent pipeline
│   │   │   ├── state.py         # Shared state (TypedDict)
│   │   │   ├── supervisor.py    # Graph construction (linear pipeline)
│   │   │   ├── analyzer.py      # GPT-4o trend analysis (tech + LinkedIn focus)
│   │   │   ├── content_saver.py # Save articles as markdown
│   │   │   ├── reporter.py      # Vietnamese LinkedIn report + content angles
│   │   │   └── scanners/        # HackerNews scanner node
│   │   ├── tools/               # HackerNews API wrapper
│   │   ├── clients/             # LLM clients
│   │   ├── core/                # Rate limiter, cache, dedup, retry
│   │   ├── api/v1/              # REST endpoints + Pydantic schemas
│   │   └── db/                  # SQLAlchemy models + session
│   ├── alembic/                 # Database migrations
│   ├── content/                 # Saved articles (hackernews/{date}/)
│   ├── reports/                 # Generated reports ({scan_run_id}/)
│   ├── docker-compose.yml
│   └── pyproject.toml
├── docs/                        # Architecture & design documents
├── backend/                     # [PLANNED] NestJS API
└── frontend/                    # [PLANNED] Next.js 15 app
```

## Getting Started

### Prerequisites
- Python 3.11+
- Docker & Docker Compose
- OpenAI API key

### Quick Start

```bash
cd ai-service

# Copy and fill environment variables
cp .env.example .env

# Start infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# Install dependencies
pip install -e ".[dev]"

# Run database migrations
alembic upgrade head

# Start the service
uvicorn app.main:app --reload --port 8000
```

### API Usage

```bash
# Health check
curl http://localhost:8000/health

# Trigger a HackerNews scan
curl -X POST http://localhost:8000/api/v1/scan \
  -H "Content-Type: application/json" \
  -d '{"platforms": ["hackernews"], "options": {"max_items_per_platform": 30}}'

# Check scan status
curl http://localhost:8000/api/v1/scan/{scan_id}/status

# List discovered trends
curl http://localhost:8000/api/v1/trends?sort_by=relevance_score

# Get top trends
curl http://localhost:8000/api/v1/trends/top?timeframe=24h&limit=20

# View generated report
curl http://localhost:8000/api/v1/reports/{scan_run_id}
```

## Pipeline Architecture

```
START
  → hackernews_scanner    (crawl top HN stories, extract articles, filter tech)
  → collect_results       (validate and merge results)
  → analyzer              (GPT-4o: categorize, sentiment, score for LinkedIn relevance)
  → content_saver         (save articles as markdown to content/hackernews/{date}/)
  → reporter              (generate Vietnamese LinkedIn report + content angles JSON)
  → persist_results       (save to PostgreSQL)
END
```

## Author

**Ho Dang Minh Duc** - Student ID: 102220140
Thesis Project - Bachelor of Computer Science
