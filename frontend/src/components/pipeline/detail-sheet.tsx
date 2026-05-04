"use client";
import { useEffect, useState, useRef } from "react";
import { X, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { BoardCard } from "@/lib/pipeline/stages";
import { COLUMN_CONFIG } from "@/lib/pipeline/stages";
import type { TrendItem } from "@/lib/api/types";
import { getTrend } from "@/lib/api/trends";
import { useReviewPost } from "@/hooks/api/use-posts";
import { getMediaUrl } from "@/lib/config";

const INTERNAL_STAGES = [
  "Crawled",
  "Analyzed",
  "Report ready",
  "Content generated",
  "Media created",
  "Pending review",
  "Scheduled",
  "Published",
];

const STAGE_TO_STEP: Record<string, number> = {
  scanning: 1,
  generating: 3,
  pending_review: 5,
  scheduled: 6,
  publishing: 7,
  posted: 8,
};

interface Props {
  card: BoardCard | null;
  onClose: () => void;
}

export function DetailSheet({ card, onClose }: Props) {
  const [trend, setTrend] = useState<TrendItem | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const review = useReviewPost();

  useEffect(() => {
    if (!card?.post?.trendItemId) { setTrend(null); return; }
    getTrend(card.post.trendItemId).then(setTrend).catch(() => setTrend(null));
  }, [card?.post?.trendItemId]);

  useEffect(() => {
    if (rejectOpen) textareaRef.current?.focus();
  }, [rejectOpen]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset reject state when card changes
  useEffect(() => {
    setRejectOpen(false);
    setRejectFeedback("");
  }, [card?.id]);

  if (!card) return null;

  const { stage, post, publish } = card;
  const colConfig = COLUMN_CONFIG[stage];
  const activeStep = STAGE_TO_STEP[stage] ?? 0;
  const isPendingReview = stage === "pending_review";
  const canShowAnalysis = ["pending_review", "scheduled", "publishing", "posted"].includes(stage) ||
    (stage === "generating" && trend != null);
  const canShowAngles = trend && ["pending_review", "scheduled", "publishing", "posted"].includes(stage);
  const canShowContent = post && ["pending_review", "scheduled", "publishing", "posted"].includes(stage);
  const canShowThumbnail = post?.imagePath && ["pending_review", "scheduled", "publishing", "posted"].includes(stage);
  const canShowSchedule = publish?.scheduledAt && ["scheduled", "publishing", "posted"].includes(stage);
  const canShowPerformance = stage === "posted";

  function handleApprove() {
    if (!post) return;
    review.mutate({ id: post.id, action: "approve" }, { onSuccess: onClose });
  }
  function handleRejectConfirm() {
    if (!post) return;
    review.mutate({ id: post.id, action: "reject", feedback: rejectFeedback }, {
      onSuccess: () => { onClose(); setRejectFeedback(""); setRejectOpen(false); },
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-full flex-col border-l border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-snug">{card.title}</h2>
            {post?.trendUrl && (
              <a href={post.trendUrl} target="_blank" rel="noopener noreferrer"
                className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3 w-3" />
                <span className="truncate">{new URL(post.trendUrl).hostname}</span>
              </a>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Pipeline stepper */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pipeline</h3>
            <div className="space-y-1">
              {INTERNAL_STAGES.map((label, i) => {
                const step = i + 1;
                const done = step < activeStep;
                const active = step === activeStep;
                return (
                  <div key={label} className="flex items-center gap-2.5">
                    <div className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      done ? "bg-teal-500 text-white" :
                      active ? "bg-blue-500 text-white" :
                      "border border-muted-foreground/30 text-muted-foreground/40"
                    )}>
                      {done ? "✓" : step}
                    </div>
                    <span className={cn(
                      "text-xs",
                      done ? "text-teal-700 line-through" :
                      active ? "font-medium text-foreground" :
                      "text-muted-foreground/50"
                    )}>
                      {label}
                    </span>
                    {active && (
                      <span className={cn("text-xs font-medium", colConfig.textClass)}>
                        ← current
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Analysis metadata */}
          {canShowAnalysis && trend && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Analysis</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Engagement", value: trend.engagementPrediction ?? "—" },
                  { label: "Sentiment",  value: trend.sentiment ?? "—" },
                  { label: "Lifecycle",  value: trend.lifecycle ?? "—" },
                  { label: "Quality",    value: trend.qualityScore ? `${trend.qualityScore}/10` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md border border-border bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-sm font-medium capitalize">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* TikTok angles */}
          {canShowAngles && trend.contentAngles.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">TikTok Angles</h3>
              <div className="space-y-2">
                {trend.contentAngles.slice(0, 3).map((angle, i) => (
                  <div key={i} className="rounded-md border border-border bg-muted/20 p-2.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                      {angle.format}
                    </span>
                    <p className="mt-1.5 text-xs italic text-foreground/80">&quot;{angle.hook_line}&quot;</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Generated content */}
          {canShowContent && post && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content</h3>
              <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-foreground/80 select-text whitespace-pre-wrap">
                {post.caption}
              </div>
              {post.hashtags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {post.hashtags.map((tag) => (
                    <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Thumbnail */}
          {canShowThumbnail && post && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thumbnail</h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getMediaUrl(post.imagePath)!}
                alt="Generated thumbnail"
                className="w-full rounded-md border border-border object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </section>
          )}

          {/* Review actions */}
          {isPendingReview && post && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review</h3>
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleApprove}
                  disabled={review.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => setRejectOpen(!rejectOpen)}
                  disabled={review.isPending}
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              </div>
              {/* Slide-in feedback textarea */}
              <div className={cn(
                "overflow-hidden transition-all duration-200",
                rejectOpen ? "mt-2 max-h-40" : "max-h-0"
              )}>
                <textarea
                  ref={textareaRef}
                  value={rejectFeedback}
                  onChange={(e) => setRejectFeedback(e.target.value)}
                  placeholder="Reason for rejection (optional)..."
                  className="w-full resize-none rounded-md border border-red-200 bg-background p-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-300"
                  rows={3}
                />
                <Button
                  size="sm"
                  onClick={handleRejectConfirm}
                  disabled={review.isPending}
                  className="mt-1.5 w-full bg-red-600 hover:bg-red-700 text-white"
                >
                  Confirm Rejection
                </Button>
              </div>
            </section>
          )}

          {/* Schedule info */}
          {canShowSchedule && publish && publish.scheduledAt && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schedule</h3>
              <div className="rounded-md border border-teal-100 bg-teal-50 p-3 text-sm">
                <p className="font-medium text-teal-800">
                  {format(new Date(publish.scheduledAt), "EEEE, MMM d 'at' h:mm a")}
                </p>
                {publish.goldenHourSlot && (
                  <p className="mt-1 text-xs text-teal-600">
                    Golden hour · {publish.goldenHourSlot}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Performance (Phase 1: N/A placeholder) */}
          {canShowPerformance && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Performance</h3>
              <p className="text-xs text-muted-foreground italic">Metrics sync from TikTok — check back after 24h.</p>
            </section>
          )}

          {/* Activity log */}
          {post && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity</h3>
              <div className="space-y-2 text-xs">
                <div className="flex gap-2">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  <div>
                    <p className="text-muted-foreground">Post created</p>
                    <p className="text-muted-foreground/60">{format(new Date(post.createdAt), "MMM d, h:mm a")}</p>
                  </div>
                </div>
                {post.updatedAt && post.updatedAt !== post.createdAt && (
                  <div className="flex gap-2">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    <div>
                      <p className="text-muted-foreground">Status → <span className="capitalize">{post.status.replace("_", " ")}</span></p>
                      <p className="text-muted-foreground/60">{format(new Date(post.updatedAt), "MMM d, h:mm a")}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
