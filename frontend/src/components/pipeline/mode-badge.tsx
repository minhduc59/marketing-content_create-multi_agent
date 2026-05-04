"use client";
import { cn } from "@/lib/utils";

interface Props {
  mode: "daemon" | "onetime";
  interval?: string; // e.g. "every 6h"
}

export function ModeBadge({ mode, interval = "every 6h" }: Props) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
      mode === "daemon"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-gray-200 bg-gray-50 text-gray-600"
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        mode === "daemon" ? "bg-blue-500 animate-pulse" : "bg-gray-400"
      )} />
      {mode === "daemon" ? `Daemon · ${interval}` : "One-time"}
    </span>
  );
}
