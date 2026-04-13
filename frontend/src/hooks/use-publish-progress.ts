"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { getSocket } from "@/lib/socket";

export function usePublishProgress(publishId: string | null) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!publishId || !accessToken) return;

    const socket = getSocket(accessToken);
    socket.emit("subscribe", { resource: "publish", id: publishId });

    const handleStatusChanged = (data: Record<string, unknown>) => {
      setStatus(data);
      const s = data.status as string;
      if (s === "published") {
        queryClient.invalidateQueries({ queryKey: ["publish"] });
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        toast.success("Post published successfully!");
      } else if (s === "failed") {
        toast.error("Publishing failed");
      }
    };

    socket.on("publish.status_changed", handleStatusChanged);

    return () => {
      socket.emit("unsubscribe", { resource: "publish", id: publishId });
      socket.off("publish.status_changed", handleStatusChanged);
    };
  }, [publishId, accessToken, queryClient]);

  return status;
}
