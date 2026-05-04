"use client";
import { cn } from "@/lib/utils";
import type { SourceFilter } from "@/hooks/use-pipeline-board";

const OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hackernews", label: "HackerNews" },
  { value: "url", label: "URL" },
];

interface Props {
  value: SourceFilter;
  onChange: (v: SourceFilter) => void;
}

export function SourceFilter({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
