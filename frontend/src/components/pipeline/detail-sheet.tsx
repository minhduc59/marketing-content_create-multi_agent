"use client";
import { useEffect, useState } from "react";
import { X, ExternalLink, MessageSquare, Rocket, Trash2, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { BoardCard } from "@/lib/pipeline/stages";
import { COLUMN_CONFIG } from "@/lib/pipeline/stages";
import { ScanStatus, ContentStatus, type TrendItem } from "@/lib/api/types";
import { getTrend } from "@/lib/api/trends";
import { useReviewPost, useUpdatePostStatus } from "@/hooks/api/use-posts";
import { getMediaUrl } from "@/lib/config";
import { usePublishNow, useAutoPublish, useCancelSchedule } from "@/hooks/api/use-publish";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const SCAN_STATUS_LABEL: Record<ScanStatus, { label: string; className: string }> = {
  [ScanStatus.PENDING]:   { label: "Queued",    className: "bg-gray-100 text-gray-700 border-gray-200" },
  [ScanStatus.RUNNING]:   { label: "Running",   className: "bg-blue-100 text-blue-700 border-blue-200" },
  [ScanStatus.COMPLETED]: { label: "Completed", className: "bg-teal-100 text-teal-700 border-teal-200" },
  [ScanStatus.PARTIAL]:   { label: "Partial",   className: "bg-amber-100 text-amber-700 border-amber-200" },
  [ScanStatus.FAILED]:    { label: "Failed",    className: "bg-red-100 text-red-700 border-red-200" },
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

const INTERNAL_STAGES = [
  "Crawled",
  "Analyzed",
  "Report ready",
  "Content generated",
  "Media created",
  "Pending review",
  "Scheduled",
  "Publishing",
  "Published",
];

const STAGE_TO_STEP: Record<string, number> = {
  scanning: 1,
  pending_review: 6,
  scheduled: 7,
  publishing: 8,
  posted: 9,
};

interface Props {
  card: BoardCard | null;
  onClose: () => void;
}

export function DetailSheet({ card, onClose }: Props) {
  const [trend, setTrend] = useState<TrendItem | null>(null);
  const [reviewInputOpen,  setReviewInputOpen]  = useState(false);
  const [reviewFeedback,   setReviewFeedback]   = useState("");
  const [publishNowOpen,   setPublishNowOpen]   = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const review         = useReviewPost();
  const publishNow     = usePublishNow();
  const autoPublish    = useAutoPublish();
  const cancelSchedule = useCancelSchedule();
  const updateStatus   = useUpdatePostStatus();

  useEffect(() => {
    if (!card?.post?.trendItemId) { setTrend(null); return; }
    getTrend(card.post.trendItemId).then(setTrend).catch(() => setTrend(null));
  }, [card?.post?.trendItemId]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset dialog/form state when card changes
  useEffect(() => {
    setReviewInputOpen(false);
    setReviewFeedback("");
    setPublishNowOpen(false);
    setDeleteDialogOpen(false);
  }, [card?.id]);

  if (!card) return null;

  const { stage, post, publish, scan } = card;
  const isScanCard = card.type === "scan";
  const scanStatusCfg = scan ? SCAN_STATUS_LABEL[scan.status] : null;
  const colConfig = COLUMN_CONFIG[stage];
  const activeStep = STAGE_TO_STEP[stage] ?? 0;
  const isPendingReview = stage === "pending_review";
  const isScheduled     = stage === "scheduled";
  const isAnyPending    = review.isPending || publishNow.isPending ||
                          autoPublish.isPending || cancelSchedule.isPending || updateStatus.isPending;
  const canShowAnalysis = ["pending_review", "scheduled", "publishing", "posted"].includes(stage);
  const canShowAngles = trend && ["pending_review", "scheduled", "publishing", "posted"].includes(stage);
  const canShowContent = post && ["pending_review", "scheduled", "publishing", "posted"].includes(stage);
  const canShowThumbnail = post?.imagePath && ["pending_review", "scheduled", "publishing", "posted"].includes(stage);
  const canShowSchedule = publish?.scheduledAt && ["scheduled", "publishing", "posted"].includes(stage);
  const canShowPerformance = stage === "posted";

  function handleApproveAndSchedule() {
    if (!post) return;
    review.mutate({ id: post.id, action: "approve" }, {
      onSuccess: () => autoPublish.mutate({ postId: post.id }, { onSuccess: onClose }),
    });
  }

  function handleApproveAndPublishNow() {
    if (!post) return;
    review.mutate({ id: post.id, action: "approve" }, {
      onSuccess: () => publishNow.mutate({ postId: post.id }, { onSuccess: onClose }),
    });
  }

  function handleSendForRevision() {
    if (!post) return;
    review.mutate({ id: post.id, action: "reject", feedback: reviewFeedback }, {
      onSuccess: () => { setReviewFeedback(""); setReviewInputOpen(false); },
    });
  }

  function handlePublishNow() {
    if (!post) return;
    publishNow.mutate({ postId: post.id }, { onSuccess: onClose });
  }

  function handleDeleteConfirm() {
    if (!post) return;
    cancelSchedule.mutate(post.id, {
      onSuccess: () => updateStatus.mutate(
        { id: post.id, status: ContentStatus.DRAFT },
        { onSuccess: onClose }
      ),
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

          {/* Scan run details */}
          {isScanCard && scan && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scan Run</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-2.5">
                  <span className="text-xs text-muted-foreground">Status</span>
                  {scanStatusCfg && (
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                      scanStatusCfg.className
                    )}>
                      {scanStatusCfg.label}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Articles found", value: String(scan.totalItemsFound) },
                    { label: "Duration",       value: formatDuration(scan.durationMs) },
                    { label: "Started",        value: format(new Date(scan.startedAt), "MMM d, h:mm a") },
                    { label: "Completed",      value: scan.completedAt ? format(new Date(scan.completedAt), "MMM d, h:mm a") : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-md border border-border bg-muted/30 p-2">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-0.5 text-sm font-medium">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2.5">
                  <p className="mb-1 text-xs text-muted-foreground">Platforms</p>
                  <div className="flex flex-wrap gap-1">
                    {scan.platformsRequested.length === 0 && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {scan.platformsRequested.map((p) => {
                      const completed = scan.platformsCompleted.includes(p);
                      const failed = p in scan.platformsFailed;
                      return (
                        <span
                          key={p}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-medium",
                            failed   ? "bg-red-50 text-red-700 border-red-200" :
                            completed? "bg-teal-50 text-teal-700 border-teal-200" :
                                       "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {p}{failed ? " · failed" : completed ? " · done" : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
                {scan.error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-2.5">
                    <p className="text-xs font-semibold text-red-700">Error</p>
                    <p className="mt-1 text-xs text-red-700/90 break-words">{scan.error}</p>
                  </div>
                )}
                {Object.keys(scan.platformsFailed).length > 0 && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-2.5">
                    <p className="text-xs font-semibold text-red-700">Platform errors</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-red-700/90">
                      {Object.entries(scan.platformsFailed).map(([platform, err]) => (
                        <li key={platform} className="break-words">
                          <span className="font-mono">{platform}:</span> {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

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
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleApproveAndSchedule}
                  disabled={isAnyPending}
                >
                  <CalendarClock className="h-4 w-4" />
                  Approve &amp; Schedule
                </Button>

                <AlertDialog open={publishNowOpen} onOpenChange={setPublishNowOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="w-full gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={isAnyPending}
                    >
                      <Rocket className="h-4 w-4" />
                      Approve &amp; Publish Now
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Publish immediately?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will approve the post and publish it right now, bypassing the golden-hour schedule.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isAnyPending}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={(e) => { e.preventDefault(); handleApproveAndPublishNow(); }}
                        disabled={isAnyPending}
                      >
                        {publishNow.isPending || review.isPending ? "Publishing…" : "Publish Now"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Inline review feedback */}
                {!reviewInputOpen ? (
                  <Button
                    variant="outline"
                    className="w-full gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={() => setReviewInputOpen(true)}
                    disabled={isAnyPending}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Review
                  </Button>
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                    <textarea
                      value={reviewFeedback}
                      onChange={(e) => setReviewFeedback(e.target.value)}
                      placeholder="Provide feedback for revision..."
                      className="w-full resize-none rounded-md border border-amber-200 bg-background p-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-300"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={handleSendForRevision}
                        disabled={isAnyPending}
                      >
                        {review.isPending ? "Sending…" : "Send for Revision"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setReviewInputOpen(false); setReviewFeedback(""); }}
                        disabled={isAnyPending}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Scheduled actions */}
          {isScheduled && post && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</h3>
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handlePublishNow}
                  disabled={isAnyPending}
                >
                  <Rocket className="h-4 w-4" />
                  Publish Now
                </Button>

                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                      disabled={isAnyPending}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel scheduled publish?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will cancel the schedule and revert the post to Draft (back to the Generating column).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isAnyPending}>Keep scheduled</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={(e) => { e.preventDefault(); handleDeleteConfirm(); }}
                        disabled={isAnyPending}
                      >
                        {cancelSchedule.isPending || updateStatus.isPending ? "Deleting…" : "Yes, delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
