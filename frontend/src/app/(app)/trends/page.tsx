"use client";

import { useState } from "react";
import { Radar, ExternalLink } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LifecycleBadge } from "@/components/ui/lifecycle-badge";
import { SentimentBadge } from "@/components/ui/sentiment-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useTrends } from "@/hooks/api/use-trends";
import { Sentiment, TrendLifecycle, type TrendItem } from "@/lib/api/types";

export default function TrendsPage() {
  const [window, setWindow] = useState<"24h" | "7d" | "30d">("7d");
  const [sentiment, setSentiment] = useState<Sentiment | "all">("all");
  const [lifecycle, setLifecycle] = useState<TrendLifecycle | "all">("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useTrends({
    ...(sentiment !== "all" ? { sentiment } : {}),
    ...(lifecycle !== "all" ? { lifecycle } : {}),
    page,
    pageSize: 12,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Trend Radar</h1>
        <Tabs value={window} onValueChange={(v) => setWindow(v as typeof window)}>
          <TabsList>
            <TabsTrigger value="24h">24h</TabsTrigger>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select
          value={sentiment}
          onValueChange={(v) => {
            setSentiment(v as Sentiment | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sentiment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sentiment</SelectItem>
            {Object.values(Sentiment).map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={lifecycle}
          onValueChange={(v) => {
            setLifecycle(v as TrendLifecycle | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Lifecycle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lifecycle</SelectItem>
            {Object.values(TrendLifecycle).map((l) => (
              <SelectItem key={l} value={l}>
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <EmptyState
          icon={Radar}
          title="No trends found"
          description="Start a scan to discover trending technology topics from HackerNews."
          action={{ label: "Start a Scan", href: "/dashboard" }}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((trend) => (
              <TrendCard key={trend.id} trend={trend} />
            ))}
          </div>

          {/* Pagination */}
          {data.total > 12 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {Math.ceil(data.total / 12)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(data.total / 12)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TrendCard({ trend }: { trend: TrendItem }) {
  return (
    <Card className="transition-colors hover:border-foreground/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 text-sm font-semibold">
            {trend.title}
          </CardTitle>
          {trend.sourceUrl && (
            <a
              href={trend.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {trend.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {trend.description}
          </p>
        )}

        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold">
            {trend.relevanceScore?.toFixed(1) ?? "—"}
          </span>
          <span className="text-xs text-muted-foreground">/ 10</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {trend.lifecycle && <LifecycleBadge lifecycle={trend.lifecycle} />}
          {trend.sentiment && <SentimentBadge sentiment={trend.sentiment} />}
          {trend.category && (
            <span className="border px-2 py-0.5 text-xs text-muted-foreground">
              {trend.category}
            </span>
          )}
        </div>

        {trend.contentAngles?.length > 0 && (
          <div className="border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground">
              Content angles
            </p>
            {trend.contentAngles.slice(0, 2).map((angle, i) => (
              <p key={i} className="mt-1 text-xs">
                {angle.hook_line}
              </p>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full" asChild>
          <a href={`/content?trendId=${trend.id}`}>Create Content</a>
        </Button>
      </CardContent>
    </Card>
  );
}
