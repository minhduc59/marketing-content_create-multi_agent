"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { getSocket } from "@/lib/socket";

export function useScanProgress(scanId: string | null) {
  const [progress, setProgress] = useState<Record<string, unknown> | null>(
    null
  );
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!scanId || !accessToken) return;

    const socket = getSocket(accessToken);
    socket.emit("subscribe", { resource: "scan", id: scanId });

    const handleProgress = (data: Record<string, unknown>) => {
      setProgress(data);
    };

    const handleCompleted = (data: Record<string, unknown>) => {
      setProgress(data);
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      queryClient.invalidateQueries({ queryKey: ["trends"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Scan completed!");
    };

    socket.on("scan.progress", handleProgress);
    socket.on("scan.completed", handleCompleted);

    return () => {
      socket.emit("unsubscribe", { resource: "scan", id: scanId });
      socket.off("scan.progress", handleProgress);
      socket.off("scan.completed", handleCompleted);
    };
  }, [scanId, accessToken, queryClient]);

  return progress;
}
