"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import type { BoardCard } from "@/lib/pipeline/stages";
import { isActiveStage } from "@/lib/pipeline/stages";
import type { EngagementPrediction } from "@/lib/api/types";

const ENGAGEMENT_CONFIG: Record<EngagementPrediction, { label: string; className: string }> = {
  viral:  { label: "Viral",   className: "bg-red-100 text-red-700 border-red-200" },
  high:   { label: "High",    className: "bg-orange-100 text-orange-700 border-orange-200" },
  medium: { label: "Medium",  className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  low:    { label: "Low",     className: "bg-gray-100 text-gray-600 border-gray-200" },
};

function deriveSubLabel(card: BoardCard): string {
  const { stage, post, publish, scan } = card;
  switch (stage) {
    case "scanning":
      if (scan) return `Scanning · ${scan.totalItemsFound} articles`;
      return "Step 1/3 · Crawling...";
    case "generating":
      if (post && post.revisionCount > 0) return `Revision ${post.revisionCount} · Refining`;
      return "Step 2/3 · Analyzing...";
    case "pending_review":
      if (post?.reviewScore) return `AI score: ${post.reviewScore.toFixed(1)}/10`;
      return "Awaiting review";
    case "scheduled":
      if (publish?.scheduledAt)
        return `Posting at ${format(new Date(publish.scheduledAt), "h:mm a")}`;
      return "Scheduled";
    case "publishing":
      return "Publishing now...";
    case "posted":
      if (publish?.publishedAt)
        return `Published ${formatDistanceToNow(new Date(publish.publishedAt), { addSuffix: true })}`;
      return "Posted";
    default:
      return "";
  }
}

interface Props {
  card: BoardCard;
  onClick: () => void;
  isDragOverlay?: boolean;
}

export function PipelineCard({ card, onClick, isDragOverlay }: Props) {
  const { stage, source, engagementPrediction, createdAt } = card;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: stage === "posted" || card.type === "scan" });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const borderColor = source === "hackernews" ? "#f97316" : "#3b82f6";
  const active = isActiveStage(stage);
  const subLabel = deriveSubLabel(card);
  const engagementCfg = engagementPrediction ? ENGAGEMENT_CONFIG[engagementPrediction] : null;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderLeftColor: borderColor }}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onClick();
      }}
      className={cn(
        "relative cursor-pointer select-none rounded-md border border-border bg-background p-3 shadow-sm",
        "border-l-2 hover:shadow-md transition-shadow",
        isDragging && "opacity-40",
        isDragOverlay && "shadow-lg rotate-1",
        active && "animate-pulse-subtle"
      )}
    >
      <div className="space-y-1.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{card.title}</p>
        <p className="text-xs text-muted-foreground">{subLabel}</p>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {engagementCfg ? (
            <span className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              engagementCfg.className
            )}>
              {engagementCfg.label}
            </span>
          ) : <span />}
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  );
}
