import { TrendingUp, Flame, TrendingDown, Minus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrendLifecycle } from "@/lib/api/types";

const lifecycleConfig: Record<
  TrendLifecycle,
  { label: string; icon: typeof TrendingUp; className: string }
> = {
  [TrendLifecycle.EMERGING]: {
    label: "Emerging",
    icon: Sparkles,
    className: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  [TrendLifecycle.RISING]: {
    label: "Rising",
    icon: TrendingUp,
    className: "border-green-200 bg-green-50 text-green-700",
  },
  [TrendLifecycle.PEAKING]: {
    label: "Peaking",
    icon: Flame,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  [TrendLifecycle.SATURATED]: {
    label: "Saturated",
    icon: Minus,
    className: "border-slate-200 bg-slate-50 text-slate-600",
  },
  [TrendLifecycle.DECLINING]: {
    label: "Declining",
    icon: TrendingDown,
    className: "border-red-200 bg-red-50 text-red-700",
  },
};

export function LifecycleBadge({ lifecycle }: { lifecycle: TrendLifecycle }) {
  const config = lifecycleConfig[lifecycle];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
