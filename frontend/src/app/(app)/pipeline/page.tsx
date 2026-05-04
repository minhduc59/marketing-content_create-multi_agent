"use client";
import { useState, useEffect } from "react";
import { KanbanSquare } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceFilter } from "@/components/pipeline/source-filter";
import { ModeBadge } from "@/components/pipeline/mode-badge";
import { PipelineBoard } from "@/components/pipeline/board";
import { usePipelineBoard, type SourceFilter as SF } from "@/hooks/use-pipeline-board";
import { useScans } from "@/hooks/api/use-scans";
import { usePipelineStore } from "@/stores/pipeline-store";
import { useAuthStore } from "@/stores/auth-store";
import { getSocket } from "@/lib/socket";
import { ScanStatus } from "@/lib/api/types";

export default function PipelinePage() {
  const [sourceFilter, setSourceFilter] = useState<SF>("all");
  const { columns, isLoading } = usePipelineBoard(sourceFilter);
  const { data: scansData } = useScans({ pageSize: 5 });
  const activeScanId = usePipelineStore((s) => s.activeScanId);
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  // Determine if there's a running scan for the Daemon/One-time badge
  const hasRunningScan = scansData?.items.some(
    (s) => s.status === ScanStatus.RUNNING || s.status === ScanStatus.PENDING
  );

  // Subscribe to active scan WS for real-time progress
  useEffect(() => {
    if (!activeScanId || !accessToken) return;
    const socket = getSocket(accessToken);

    socket.emit("subscribe", { resource: "scan", id: activeScanId });

    function onProgress() {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["scans"] });
    }
    socket.on("scan.progress", onProgress);
    socket.on("scan.completed", onProgress);

    return () => {
      socket.off("scan.progress", onProgress);
      socket.off("scan.completed", onProgress);
      socket.emit("unsubscribe", { resource: "scan", id: activeScanId });
    };
  }, [activeScanId, accessToken, queryClient]);

  // Also poll every 8s as a fallback
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["publish"] });
    }, 8_000);
    return () => clearInterval(interval);
  }, [queryClient]);

  const pendingReviewCount = columns.get("pending_review")?.length ?? 0;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <KanbanSquare className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Pipeline</h1>
          {pendingReviewCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
              {pendingReviewCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SourceFilter value={sourceFilter} onChange={setSourceFilter} />
          <ModeBadge mode={hasRunningScan ? "daemon" : "onetime"} />
        </div>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-72 shrink-0" />
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <PipelineBoard columns={columns} />
        </div>
      )}
    </div>
  );
}
