"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { usePipelineStore } from "@/stores/pipeline-store";
import { getSocket, disconnectSocket } from "@/lib/socket";

export function useSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { setStatus, setActiveScan, setActivePublish } = usePipelineStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;

    const socket = getSocket(accessToken);

    socket.on("connect", () => {
      console.log("[ws] connected");
    });

    socket.on("disconnect", () => {
      console.log("[ws] disconnected");
    });

    socket.on("scan.progress", (data: { status: string; scan_id: string }) => {
      setStatus("running", "Scanner");
      setActiveScan(data.scan_id);
    });

    socket.on("scan.completed", () => {
      setStatus("idle");
      setActiveScan(null);
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    });

    socket.on(
      "publish.status_changed",
      (data: { status: string; id: string }) => {
        if (data.status === "published") {
          toast.success("Post published successfully!");
        } else if (data.status === "failed") {
          toast.error("Publishing failed. Please try again.");
        }

        if (data.status === "processing") {
          setStatus("running", "Publisher");
          setActivePublish(data.id);
        } else {
          setStatus("idle");
          setActivePublish(null);
        }
        // Refetch the kanban data so the card moves between Publishing/Posted
        // columns the moment the Zernio webhook flips status, instead of
        // waiting on the 3 s polling cycle.
        queryClient.invalidateQueries({ queryKey: ["publish"] });
        queryClient.invalidateQueries({ queryKey: ["posts"] });
      }
    );

    return () => {
      disconnectSocket();
    };
  }, [accessToken, setStatus, setActiveScan, setActivePublish, queryClient]);
}
