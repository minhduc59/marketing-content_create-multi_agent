"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, XCircle, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import DynamicVideoPlayer from "@/components/video-clipper/dynamic-video-player";

import { useAuthStore } from "@/stores/auth-store";
import { getSocket } from "@/lib/socket";
import {
  getVideoTask,
  reviewClip,
  type VideoTask,
  type VideoClip,
} from "@/lib/api/video";

const STAGE_LABELS: Record<string, string> = {
  downloading: "Downloading video",
  transcribing: "Transcribing audio",
  analyzing: "Selecting clips with AI",
  clipping: "Cutting clips",
  captioning: "Burning captions",
  uploading: "Uploading to cloud",
  completed: "Done",
  error: "Error",
};

const STATUS_COLOR: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  downloading: "bg-blue-100 text-blue-800",
  transcribing: "bg-purple-100 text-purple-800",
  analyzing: "bg-orange-100 text-orange-800",
  clipping: "bg-indigo-100 text-indigo-800",
  captioning: "bg-pink-100 text-pink-800",
  uploading: "bg-cyan-100 text-cyan-800",
  completed: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  cancelled: "bg-muted text-muted-foreground",
};

export default function VideoTaskPage({
  params,
}: {
  params: { taskId: string };
}) {
  const { taskId } = params;
  const accessToken = useAuthStore((s) => s.accessToken);

  const [task, setTask] = useState<VideoTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [isTerminal, setIsTerminal] = useState(false);
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [reviewingClipId, setReviewingClipId] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    try {
      const t = await getVideoTask(taskId);
      setTask(t);
      setProgress(t.progress ?? 0);
      if (t.status === "completed" || t.status === "error" || t.status === "cancelled") {
        setIsTerminal(true);
      }
    } catch {
      toast.error("Failed to load task");
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  useEffect(() => {
    if (!accessToken || isTerminal) return;

    const socket = getSocket(accessToken);
    const room = `video:${taskId}`;

    socket.emit("subscribe", { resource: "video", id: taskId });

    socket.on("video.progress", (data: { taskId: string; stage: string; percentComplete: number; message?: string }) => {
      if (data.taskId !== taskId) return;
      setProgress(data.percentComplete);
      setProgressMsg(STAGE_LABELS[data.stage] ?? data.stage);
    });

    socket.on("video.completed", (data: { taskId: string }) => {
      if (data.taskId !== taskId) return;
      setProgress(100);
      setProgressMsg("Completed");
      setIsTerminal(true);
      fetchTask();
      socket.emit("unsubscribe", { resource: "video", id: taskId });
    });

    socket.on("video.error", (data: { taskId: string; message: string }) => {
      if (data.taskId !== taskId) return;
      setIsTerminal(true);
      toast.error(`Pipeline error: ${data.message}`);
      fetchTask();
      socket.emit("unsubscribe", { resource: "video", id: taskId });
    });

    return () => {
      socket.emit("unsubscribe", { resource: "video", id: taskId });
      socket.off("video.progress");
      socket.off("video.completed");
      socket.off("video.error");
    };
  }, [accessToken, taskId, isTerminal, fetchTask]);

  const handleReview = async (clip: VideoClip, action: "approve" | "reject") => {
    setReviewingClipId(clip.id);
    try {
      await reviewClip(clip.id, { action, feedback: feedbacks[clip.id] });
      toast.success(action === "approve" ? "Clip approved" : "Clip rejected");
      fetchTask();
    } catch {
      toast.error("Review failed");
    } finally {
      setReviewingClipId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (!task) {
    return <p className="text-muted-foreground">Task not found.</p>;
  }

  const clips = task.clips ?? [];
  const isProcessing = !isTerminal && task.status !== "queued";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/video-clipper">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">
            Video Task
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{taskId.slice(0, 8)}</span>
            <Badge className={STATUS_COLOR[task.status] ?? "bg-muted"}>
              {task.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Progress section */}
      {(isProcessing || task.status === "queued") && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {progressMsg || task.progressMessage || "Processing…"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {progress}% complete
                  </p>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {task.status === "error" && task.errorMessage && (
        <Card className="border-red-200">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3 text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm">{task.errorMessage}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clips review grid */}
      {clips.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Clips ({clips.length})
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {clips.map((clip) => (
              <Card key={clip.id} className="overflow-hidden">
                <DynamicVideoPlayer src={clip.storageUrl} className="w-full" />
                <CardContent className="space-y-3 pt-3">
                  {/* Clip metadata */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Clip {clip.clipIndex + 1} &middot;{" "}
                      {(clip.durationSeconds ?? 0).toFixed(1)}s
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        clip.status === "approved"
                          ? "border-green-500 text-green-700"
                          : clip.status === "rejected"
                          ? "border-red-500 text-red-700"
                          : ""
                      }
                    >
                      {clip.status}
                    </Badge>
                  </div>

                  {clip.llmRationale && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {clip.llmRationale}
                    </p>
                  )}

                  {/* Review actions — only shown for draft clips */}
                  {clip.status === "draft" && (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Feedback (optional)"
                        value={feedbacks[clip.id] ?? ""}
                        onChange={(e) =>
                          setFeedbacks((prev) => ({
                            ...prev,
                            [clip.id]: e.target.value,
                          }))
                        }
                        className="min-h-[60px] text-xs"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 gap-1"
                          onClick={() => handleReview(clip, "approve")}
                          disabled={reviewingClipId === clip.id}
                        >
                          {reviewingClipId === clip.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1"
                          onClick={() => handleReview(clip, "reject")}
                          disabled={reviewingClipId === clip.id}
                        >
                          <XCircle className="h-3 w-3" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state while waiting for clips */}
      {task.status === "completed" && clips.length === 0 && (
        <p className="text-sm text-muted-foreground">No clips were generated.</p>
      )}
    </div>
  );
}
