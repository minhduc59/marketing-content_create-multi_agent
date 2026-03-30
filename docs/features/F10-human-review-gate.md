# F10: Human Review Gate

> Configurable human-in-the-loop checkpoint that pauses the pipeline for content and media approval before publishing.

## Overview

| Property | Value |
|----------|-------|
| **Agent** | Orchestrator Agent (part of F01) |
| **Pipeline Stage** | Between Stage 5 and Stage 6 |
| **Trigger** | `current_stage = "media_created"` AND `review_enabled = true` |
| **Status** | Planned (Sprint 3-4) |
| **Key files** | `ai-service/app/agents/supervisor.py` (human_review_node) |

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `content_drafts` | `List[Object]` | Content from Content Pool with status `"draft"` (caption, hashtags, script, platform variants) |
| `media_assets` | `List[Object]` | Generated images with S3 URLs and platform variants |

---

## Output

| Field | Type | Description |
|-------|------|-------------|
| `human_review` | `String` | `"approved"` or `"rejected"` |
| `human_feedback` | `Optional[String]` | Feedback text when rejected (used as context for regeneration) |

---

## Processing Logic

```
When review_enabled = true:
1. After Stage 5 (media_created), Orchestrator enters human_review_node
2. Set pipeline status → "pending_review"
3. Send WebSocket notification to frontend: { event: "human_review_needed", data: { content_ids, media_ids } }
4. LangGraph interrupt() pauses graph execution
5. State is checkpointed to PostgreSQL via PostgresSaver
6. Pipeline waits for user action (no timeout — waits indefinitely)

User approves:
7a. Resume graph with human_review = "approved"
8a. Content Pool status → "approved"
9a. Orchestrator routes to Stage 6 (Scheduling)

User rejects:
7b. Resume graph with human_review = "rejected", human_feedback = "user text"
8b. Content Pool status → "rejected"
9b. Orchestrator routes back to Stage 4 (Content Generation) with feedback as additional context

When review_enabled = false:
1. After Stage 5, Orchestrator skips human_review_node entirely
2. Content Pool status auto-set to "approved"
3. Route directly to Stage 6 (Scheduling)
```

---

## LangGraph interrupt() Mechanism

```python
from langgraph.types import interrupt

def human_review_node(state: PipelineState):
    """Pause pipeline for human approval."""
    # Save content to Content Pool with "pending_review" status
    save_to_content_pool(state, status="pending_review")

    # Notify frontend via WebSocket
    notify_review_needed(state["content"], state["media_files"])

    # Pause execution — state checkpointed automatically
    review_result = interrupt(
        value={
            "content_preview": state["content"],
            "media_preview": state["media_files"],
            "message": "Review content and media before publishing"
        }
    )

    # Execution resumes here after user action
    return {
        "human_review": review_result["decision"],      # "approved" | "rejected"
        "human_feedback": review_result.get("feedback"), # Optional feedback text
    }
```

---

## Two Operating Modes

| Mode | `review_enabled` | Behavior |
|------|-------------------|----------|
| **With Review** | `true` | Pipeline pauses after Stage 5, waits for user approval on Dashboard |
| **Fully Automatic** | `false` | Pipeline skips review, content auto-approved, goes straight to Scheduling |

- Toggle is per-user, configurable from Dashboard Settings
- Default: `review_enabled = true` (safer for new users)
- Can be changed at any time without restarting the pipeline

---

## Approval Flow

```
Content Pool (draft) → pending_review → User Decision
                                            │
                                  ┌─────────┴─────────┐
                                  │                    │
                              Approved              Rejected
                                  │                    │
                          status: "approved"    status: "rejected"
                                  │                    │
                          → Stage 6              → Stage 4
                           (Scheduling)       (Content Generation)
                                               with user feedback
```

---

## WebSocket Notifications

| Event | Direction | Payload |
|-------|-----------|---------|
| `human_review_needed` | Server → Client | `{content_ids, media_ids, preview_urls, created_at}` |
| `review_submitted` | Client → Server | `{decision: "approved"/"rejected", feedback?: string}` |
| `review_completed` | Server → Client | `{decision, next_stage, timestamp}` |

---

## Frontend ApprovalCard Component

The Dashboard displays an approval card with:

| Action | Effect |
|--------|--------|
| **Approve** | Accept content as-is → proceed to Scheduling |
| **Edit & Approve** | User modifies caption/hashtags → save edits → proceed to Scheduling |
| **Reject + Feedback** | User writes feedback → pipeline returns to Stage 4 (Content Generation) with feedback as additional LLM context |

Content preview includes:
- Caption text (per platform)
- Hashtag chips
- Generated images (per platform format: Feed, Story)
- Character count per platform

---

## State Checkpointing

- **Checkpointer:** `PostgresSaver` (LangGraph built-in)
- **Persistence:** Full pipeline state saved to PostgreSQL on `interrupt()`
- **Resume:** Graph resumes from exact checkpoint after user action
- **No timeout:** Pipeline waits indefinitely for user decision
- **Multiple reviews:** If user rejects, content regenerates and returns to review gate again

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `PATCH` | `/content/:id/approve` | Approve content draft |
| `PATCH` | `/content/:id/reject` | Reject with feedback body `{feedback: string}` |
| `PATCH` | `/content/:id/edit` | Edit content before approving |
| `PATCH` | `/media/:id/approve` | Approve media asset |
| `PATCH` | `/media/:id/reject` | Reject media with feedback |

---

## Database Tables

- `content_drafts.status` — ContentStatus enum: `DRAFT → PENDING_REVIEW → APPROVED / REJECTED`
- `media_assets.status` — MediaStatus enum: `GENERATING → PENDING_REVIEW → APPROVED / REJECTED`
- `agent_runs.status` — `INTERRUPTED` while waiting for review, `RUNNING` after resume

---

## Dependencies

- LangGraph (`interrupt()`, checkpointer)
- PostgreSQL (`PostgresSaver` for state persistence)
- WebSocket (NestJS Gateway for real-time notifications)
- Frontend (ApprovalCard component in Next.js)

---

## Related Features

- [F01 Orchestrator](F01-orchestrator-router.md) — Routing logic that checks `review_enabled` and `human_review` state
- [F05 Content Generation](F05-content-generation.md) — Content to review; returns here on rejection
- [F06 Media Creation](F06-media-creation.md) — Media to review
- [F07 Scheduling](F07-scheduling.md) — Next step after approval
