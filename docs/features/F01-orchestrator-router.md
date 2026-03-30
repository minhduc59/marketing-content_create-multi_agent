# F01: Orchestrator Agent — Router Workflow

> The central "brain" that classifies pipeline state and routes to the correct agent using rule-based conditional edges (no LLM for routing).

## Overview

| Property | Value |
|----------|-------|
| **Agent** | Orchestrator Agent |
| **Pattern** | Router Workflow (LangGraph StateGraph) |
| **Routing** | Rule-based `conditional_edges` |
| **Modes** | One-time, Daemon (configurable interval) |
| **Key file** | `ai-service/app/agents/supervisor.py` (to be refactored) |

---

## Routing Table

The Orchestrator inspects `current_stage` and other state fields, then routes to the appropriate agent node:

| State Condition | Route To | Action | Notes |
|----------------|----------|--------|-------|
| `current_stage = "init"` | Trending Scanner (crawl) | Start crawl | Entry point |
| `current_stage = "trends_crawled"` | Trending Scanner (analysis) | Analyze trends | |
| `current_stage = "trends_analyzed"` | Trending Scanner (report) | Generate report | Same agent, different sub-task |
| `current_stage = "report_generated"` | Post Generator (content) | Generate content | Reads report file as context |
| `current_stage = "content_generated"` | Post Generator (media) | Create images | Save to Content Pool |
| `current_stage = "media_created"` + `review_enabled` | Human Review Gate | Pause pipeline | Only when human review is ON |
| `current_stage = "media_created"` + `review_disabled` | Publisher (scheduling) | Skip review | Fully automatic mode |
| `human_review = "approved"` | Publisher (scheduling) | Schedule posts | |
| `human_review = "rejected"` | Post Generator (content) | Regenerate | Back to Stage 4 with feedback |
| `current_stage = "scheduled"` | Publisher (auto publish) | Publish posts | |
| `current_stage = "published"` | END | Finish | Feedback runs async via cron |

---

## Shared State Schema

```python
class PipelineState(TypedDict):
    # Pipeline control
    current_stage: str                    # init | trends_crawled | trends_analyzed | report_generated | content_generated | media_created | scheduled | published
    review_enabled: bool                  # Toggle human review gate
    human_review: Optional[str]           # approved | rejected | None
    human_feedback: Optional[str]         # Feedback text when rejected
    mode: str                             # one-time | daemon

    # Stage outputs
    raw_trends: List[dict]                # Stage 1 output
    analyzed_trends: List[dict]           # Stage 2 output
    report_files: List[str]              # Stage 3 output (S3 URLs)
    report_metadata: dict                 # Stage 3 metadata
    content: dict                         # Stage 4 output {caption, hashtags, script}
    platform_variants: List[dict]         # Stage 4 platform-specific versions
    image_prompt: str                     # Stage 4 -> Stage 5
    media_files: List[str]               # Stage 5 output (S3 URLs)
    schedule: List[dict]                  # Stage 6 output
    published_ids: List[str]             # Stage 7 output

    # Content Pool
    content_pool_status: str              # draft | approved

    # Strategy
    strategy: dict                        # {tone, style, brand_voice}

    # Errors
    errors: List[dict]
```

---

## Operating Modes

### One-time Mode
Run pipeline once from Stage 1 to Stage 7, then terminate. Suitable for manual triggers.

### Daemon Mode
Run continuously with configurable intervals:
- **Trend scanning:** default 6 hours
- **Content creation:** default 12 hours
- **Performance check:** default 24 hours
- Intervals configurable from Dashboard, no restart needed

---

## Content Pool

Intermediate content storage in PostgreSQL:
- Stage 4-5 outputs saved with status `"draft"`
- After human review (or auto-approve), status changes to `"approved"`
- Orchestrator only routes `"approved"` content to Publish (Stage 6)

**Benefits:**
- Decouples content production from distribution
- User can review and edit before publishing
- No need to re-run pipeline to publish more from pool

---

## Implementation Notes

### LangGraph Graph Structure
```python
def build_pipeline_graph():
    graph = StateGraph(PipelineState)

    # Add nodes
    graph.add_node("orchestrator", orchestrator_node)
    graph.add_node("trend_scanner", trend_scanner_node)
    graph.add_node("post_generator", post_generator_node)
    graph.add_node("media_creator", media_creator_node)
    graph.add_node("human_review", human_review_node)
    graph.add_node("scheduler", scheduler_node)
    graph.add_node("publisher", publisher_node)

    # Orchestrator is the central router
    graph.set_entry_point("orchestrator")

    # Conditional edges from orchestrator
    graph.add_conditional_edges(
        "orchestrator",
        route_by_state,      # Rule-based routing function
        {
            "trend_scanner": "trend_scanner",
            "post_generator": "post_generator",
            "media_creator": "media_creator",
            "human_review": "human_review",
            "scheduler": "scheduler",
            "publisher": "publisher",
            END: END,
        }
    )

    # All agents return to orchestrator
    for node in ["trend_scanner", "post_generator", "media_creator", "scheduler", "publisher"]:
        graph.add_edge(node, "orchestrator")

    # Human review returns to orchestrator
    graph.add_edge("human_review", "orchestrator")

    return graph.compile(checkpointer=PostgresSaver(...))
```

### Routing Function
```python
def route_by_state(state: PipelineState) -> str:
    stage = state["current_stage"]

    if stage == "init":
        return "trend_scanner"
    elif stage == "trends_crawled":
        return "trend_scanner"        # analysis sub-task
    elif stage == "trends_analyzed":
        return "trend_scanner"        # report sub-task
    elif stage == "report_generated":
        return "post_generator"       # content generation
    elif stage == "content_generated":
        return "media_creator"
    elif stage == "media_created":
        if state.get("review_enabled"):
            return "human_review"
        return "scheduler"
    elif state.get("human_review") == "approved":
        return "scheduler"
    elif state.get("human_review") == "rejected":
        return "post_generator"       # regenerate with feedback
    elif stage == "scheduled":
        return "publisher"
    elif stage == "published":
        return END

    return END
```

---

## Dependencies

- **LangGraph** — StateGraph, conditional_edges, checkpointer
- **PostgreSQL** — Content Pool storage, state persistence
- **Redis** — Queue for daemon mode scheduling
- **WebSocket** — Notify frontend of stage transitions

---

## Related Features

- [F10 Human Review Gate](F10-human-review-gate.md) — Review gate logic details
- All F02-F09 features are routed through this orchestrator
