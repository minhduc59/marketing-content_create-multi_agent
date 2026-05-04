"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import type { BoardCard } from "@/lib/pipeline/stages";
import { isActiveStage } from "@/lib/pipeline/stages";
import { ScanStatus, type EngagementPrediction } from "@/lib/api/types";

const PLATFORM_LABEL: Record<string, string> = {
  hackernews: "HackerNews",
  url: "Article URL",
};

function formatPlatforms(platforms: string[]): string {
  if (platforms.length === 0) return "—";
  return platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(", ");
}

const ENGAGEMENT_CONFIG: Record<EngagementPrediction, { label: string; className: string }> = {
  viral:  { label: "Viral",   className: "bg-red-100 text-red-700 border-red-200" },
  high:   { label: "High",    className: "bg-orange-100 text-orange-700 border-orange-200" },
  medium: { label: "Medium",  className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  low:    { label: "Low",     className: "bg-gray-100 text-gray-600 border-gray-200" },
};

const SCAN_STATUS_CONFIG: Record<ScanStatus, { label: string; className: string }> = {
  [ScanStatus.PENDING]:   { label: "Queued",    className: "bg-gray-100 text-gray-700 border-gray-200" },
  [ScanStatus.RUNNING]:   { label: "Running",   className: "bg-blue-100 text-blue-700 border-blue-200" },
  [ScanStatus.COMPLETED]: { label: "Completed", className: "bg-teal-100 text-teal-700 border-teal-200" },
  [ScanStatus.PARTIAL]:   { label: "Partial",   className: "bg-amber-100 text-amber-700 border-amber-200" },
  [ScanStatus.FAILED]:    { label: "Failed",    className: "bg-red-100 text-red-700 border-red-200" },
};

function deriveSubLabel(card: BoardCard): string {
  const { stage, post, publish, scan } = card;
  switch (stage) {
    case "scanning": {
      if (!scan) return "Step 1/3 · Crawling...";
      const platforms = formatPlatforms(scan.platformsRequested);
      const found = scan.totalItemsFound;
      switch (scan.status) {
        case ScanStatus.PENDING:
          return `${platforms} · Queued`;
        case ScanStatus.RUNNING: {
          const done = scan.platformsCompleted.length;
          const total = scan.platformsRequested.length || 1;
          return found > 0
            ? `${platforms} · ${found} articles · ${done}/${total}`
            : `${platforms} · Crawling… ${done}/${total}`;
        }
        case ScanStatus.FAILED:
          return scan.error ? `Failed · ${scan.error}` : "Failed";
        case ScanStatus.PARTIAL:
          return `Partial · ${found} articles · ${platforms}`;
        case ScanStatus.COMPLETED:
          return `Completed · ${found} articles`;
        default:
          return `${platforms} · ${found} articles`;
      }
    }
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
  const scanStatusCfg = card.type === "scan" && card.scan ? SCAN_STATUS_CONFIG[card.scan.status] : null;

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
          {scanStatusCfg ? (
            <span className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              scanStatusCfg.className
            )}>
              {scanStatusCfg.label}
            </span>
          ) : engagementCfg ? (
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
