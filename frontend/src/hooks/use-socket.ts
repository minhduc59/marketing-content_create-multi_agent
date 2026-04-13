"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { usePipelineStore } from "@/stores/pipeline-store";
import { getSocket, disconnectSocket } from "@/lib/socket";

export function useSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { setStatus, setActiveScan, setActivePublish } = usePipelineStore();

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
    });

    socket.on(
      "publish.status_changed",
      (data: { status: string; id: string }) => {
        if (data.status === "processing") {
          setStatus("running", "Publisher");
          setActivePublish(data.id);
        } else {
          setStatus("idle");
          setActivePublish(null);
        }
      }
    );

    return () => {
      disconnectSocket();
    };
  }, [accessToken, setStatus, setActiveScan, setActivePublish]);
}
