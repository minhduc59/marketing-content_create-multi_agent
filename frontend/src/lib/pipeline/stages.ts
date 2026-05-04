import type { ContentPost, PublishedPost, ScanRun } from "@/lib/api/types";
import { ContentStatus, PublishStatus, EngagementPrediction } from "@/lib/api/types";

export type PipelineStage =
  | "scanning" | "generating" | "pending_review"
  | "scheduled" | "publishing" | "posted";

export const COLUMN_ORDER: PipelineStage[] = [
  "scanning", "generating", "pending_review", "scheduled", "publishing", "posted",
];

export interface ColumnConfig {
  id: PipelineStage;
  label: string;
  topBarClass: string; // bg-* color class
  textClass: string;   // text-* color class
}

export const COLUMN_CONFIG: Record<PipelineStage, ColumnConfig> = {
  scanning:      { id: "scanning",      label: "Scanning",      topBarClass: "bg-blue-500",   textClass: "text-blue-600"   },
  generating:    { id: "generating",    label: "Generating",    topBarClass: "bg-purple-500", textClass: "text-purple-600" },
  pending_review:{ id: "pending_review",label: "Pending Review",topBarClass: "bg-amber-500",  textClass: "text-amber-600"  },
  scheduled:     { id: "scheduled",     label: "Scheduled",     topBarClass: "bg-teal-500",   textClass: "text-teal-600"   },
  publishing:    { id: "publishing",    label: "Publishing",    topBarClass: "bg-green-500",  textClass: "text-green-600"  },
  posted:        { id: "posted",        label: "Posted",        topBarClass: "bg-gray-400",   textClass: "text-gray-600"   },
};

export interface BoardCard {
  id: string;          // unique: post-${id} or scan-${id}
  type: "post" | "scan";
  stage: PipelineStage;
  source: "hackernews" | "url";
  title: string;
  engagementPrediction: EngagementPrediction | null;
  createdAt: string;
  post?: ContentPost;
  publish?: PublishedPost;
  scan?: ScanRun;
}

/** Derives pipeline column from ContentPost + optional latest PublishedPost */
export function deriveStage(post: ContentPost, publish?: PublishedPost): PipelineStage {
  if (publish) {
    if (publish.status === PublishStatus.PUBLISHED) return "posted";
    if (publish.status === PublishStatus.PROCESSING) return "publishing";
    if (publish.status === PublishStatus.PENDING)    return "scheduled";
    if (publish.status === PublishStatus.FAILED)     return "pending_review";
  }
  switch (post.status) {
    case ContentStatus.PUBLISHED:          return "posted";
    case ContentStatus.APPROVED:           return "scheduled";
    case ContentStatus.FLAGGED_FOR_REVIEW: return "pending_review";
    case ContentStatus.NEEDS_REVISION:
    case ContentStatus.DRAFT:
    default:
      return "generating";
  }
}

/** Maps a target stage back to a ContentStatus for drag-drop updates */
export function stageToDragStatus(stage: PipelineStage): ContentStatus | null {
  switch (stage) {
    case "generating":    return ContentStatus.DRAFT;
    case "pending_review":return ContentStatus.FLAGGED_FOR_REVIEW;
    default:              return null; // not supported via simple status change
  }
}

export function isActiveStage(stage: PipelineStage): boolean {
  return stage === "scanning" || stage === "generating" || stage === "publishing";
}

export function isProgressStage(stage: PipelineStage): boolean {
  return stage === "scanning" || stage === "generating";
}
