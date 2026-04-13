import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sentiment } from "@/lib/api/types";

const sentimentConfig: Record<Sentiment, { label: string; className: string }> = {
  [Sentiment.BULLISH]: {
    label: "Bullish",
    className: "border-green-200 bg-green-50 text-green-700",
  },
  [Sentiment.NEUTRAL]: {
    label: "Neutral",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  },
  [Sentiment.BEARISH]: {
    label: "Bearish",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  [Sentiment.CONTROVERSIAL]: {
    label: "Controversial",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const config = sentimentConfig[sentiment];
  return (
    <Badge variant="outline" className={cn("font-medium", config.className)}>
      {config.label}
    </Badge>
  );
}
