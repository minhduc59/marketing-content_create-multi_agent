import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: number;
  trendDirection?: "up" | "down";
}

export function KPICard({
  icon: Icon,
  label,
  value,
  trend,
  trendDirection,
}: KPICardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <Icon className="h-5 w-5 text-muted-foreground" />
          {trend !== undefined && trendDirection && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                trendDirection === "up" ? "text-green-600" : "text-red-600"
              )}
            >
              {trendDirection === "up" ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend}%
            </div>
          )}
        </div>
        <div className="mt-3">
          <p className="font-mono text-2xl font-bold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
