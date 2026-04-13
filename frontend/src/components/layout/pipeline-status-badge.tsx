"use client";

import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/stores/pipeline-store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const statusConfig = {
  idle: {
    label: "Ready",
    dotClass: "bg-green-500",
    textClass: "text-green-700",
    animate: "animate-pulse",
  },
  running: {
    label: "Running",
    dotClass: "bg-orange-500",
    textClass: "text-orange-700",
    animate: "animate-spin",
  },
  review: {
    label: "Review needed",
    dotClass: "bg-yellow-500",
    textClass: "text-yellow-700",
    animate: "animate-pulse",
  },
  error: {
    label: "Error",
    dotClass: "bg-red-500",
    textClass: "text-red-700",
    animate: "",
  },
} as const;

export function PipelineStatusBadge() {
  const { status, currentAgent, activeScanId } = usePipelineStore();
  const config = statusConfig[status];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent">
          <span
            className={cn("h-2 w-2 rounded-full", config.dotClass, config.animate)}
          />
          <span className={config.textClass}>
            {currentAgent ? `${config.label}: ${currentAgent}` : config.label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 text-sm">
        <div className="space-y-2">
          <p className="font-medium">Pipeline Status</p>
          <div className="flex items-center gap-2">
            <span
              className={cn("h-2 w-2 rounded-full", config.dotClass)}
            />
            <span>{config.label}</span>
          </div>
          {currentAgent && (
            <p className="text-muted-foreground">
              Agent: <span className="font-mono">{currentAgent}</span>
            </p>
          )}
          {activeScanId && (
            <p className="text-muted-foreground">
              Scan: <span className="font-mono text-xs">{activeScanId.slice(0, 8)}</span>
            </p>
          )}
          {status === "idle" && (
            <p className="text-muted-foreground">
              No active pipeline. Ready for a new scan.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
