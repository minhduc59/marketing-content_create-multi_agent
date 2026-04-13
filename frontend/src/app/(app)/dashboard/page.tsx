"use client";

import { Radar, FileText, Send, Activity, Loader2 } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

import { KPICard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentStatusBadge } from "@/components/ui/content-status-badge";
import { useTriggerScan } from "@/hooks/api/use-scans";
import { usePosts } from "@/hooks/api/use-posts";
import { useTopTrends } from "@/hooks/api/use-trends";
import { usePublishHistory } from "@/hooks/api/use-publish";
import { usePipelineStore } from "@/stores/pipeline-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { TriggerScanDto } from "@/lib/api/types";

const pipelineSteps = [
  { label: "Trend Discovery", key: "scanner" },
  { label: "Content Gen", key: "generator" },
  { label: "Review", key: "review" },
  { label: "Publish", key: "publisher" },
];

export default function DashboardPage() {
  const { data: trends, isLoading: trendsLoading } = useTopTrends("7d");
  const { data: posts, isLoading: postsLoading } = usePosts({ pageSize: 1 });
  const { data: published, isLoading: publishLoading } = usePublishHistory({
    status: "published",
    pageSize: 1,
  });
  const { data: upcoming } = usePublishHistory({
    status: "pending",
    pageSize: 5,
  });
  const { data: recentPosts } = usePosts({ pageSize: 5 });

  const triggerScan = useTriggerScan();
  const pipelineStatus = usePipelineStore((s) => s.status);
  const keywords = useSettingsStore((s) => s.keywords);

  function handleStartScan() {
    const dto: TriggerScanDto = {
      platforms: ["hackernews"],
      options: {
        max_items_per_platform: 30,
        generate_posts: true,
        ...(keywords.length > 0 ? { keywords } : {}),
      },
    };
    triggerScan.mutate(dto);
  }

  const isLoading = trendsLoading || postsLoading || publishLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Button onClick={handleStartScan} disabled={triggerScan.isPending}>
          {triggerScan.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Start New Scan
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))
        ) : (
          <>
            <KPICard
              icon={Radar}
              label="Trending Topics"
              value={trends?.length ?? 0}
            />
            <KPICard
              icon={FileText}
              label="Content Created"
              value={posts?.total ?? 0}
            />
            <KPICard
              icon={Send}
              label="Posts Published"
              value={published?.total ?? 0}
            />
            <KPICard
              icon={Activity}
              label="Pipeline Status"
              value={pipelineStatus === "idle" ? "Ready" : pipelineStatus}
            />
          </>
        )}
      </div>

      {/* Pipeline Stepper */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {pipelineSteps.map((step, i) => (
              <div key={step.key} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 items-center justify-center border-2 border-foreground text-xs font-bold">
                    {i + 1}
                  </div>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {step.label}
                  </span>
                </div>
                {i < pipelineSteps.length - 1 && (
                  <div className="mx-2 h-px w-12 bg-border lg:w-24" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Posts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Posts</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming?.items?.length ? (
              <div className="space-y-3">
                {upcoming.items.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {post.platform}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {post.scheduledAt
                          ? format(new Date(post.scheduledAt), "MMM d, HH:mm")
                          : "Pending"}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {post.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No upcoming posts scheduled.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Content */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Content</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/content">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentPosts?.items?.length ? (
              <div className="space-y-3">
                {recentPosts.items.map((post) => (
                  <Link
                    key={post.id}
                    href={`/content/${post.id}`}
                    className="flex items-center justify-between border-b pb-3 last:border-0 hover:bg-accent/50 -mx-2 px-2 py-1 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {post.trendTitle}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {post.caption.slice(0, 80)}...
                      </p>
                    </div>
                    <ContentStatusBadge status={post.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No content created yet. Start a scan to generate content.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
