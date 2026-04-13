"use client";

import { useState, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  Send,
  Award,
} from "lucide-react";

import { KPICard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { usePublishHistory, useGoldenHours } from "@/hooks/api/use-publish";
import { useReports } from "@/hooks/api/use-reports";

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("7d");
  const { data: publishData, isLoading } = usePublishHistory({ pageSize: 100 });
  const { data: goldenHours } = useGoldenHours();
  const { data: reports } = useReports({ pageSize: 5 });

  const published = useMemo(
    () => publishData?.items?.filter((p) => p.status === "published") ?? [],
    [publishData]
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!published.length) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <EmptyState
          icon={BarChart3}
          title="No analytics data yet"
          description="Publish your first post to start tracking performance."
          action={{ label: "Browse Content", href: "/content" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <Tabs
          value={timeRange}
          onValueChange={(v) => setTimeRange(v as typeof timeRange)}
        >
          <TabsList>
            <TabsTrigger value="7d">7 days</TabsTrigger>
            <TabsTrigger value="30d">30 days</TabsTrigger>
            <TabsTrigger value="90d">90 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={TrendingUp}
          label="Total Published"
          value={published.length}
        />
        <KPICard
          icon={Send}
          label="Pending"
          value={
            publishData?.items?.filter((p) => p.status === "pending").length ?? 0
          }
        />
        <KPICard
          icon={Award}
          label="Failed"
          value={
            publishData?.items?.filter((p) => p.status === "failed").length ?? 0
          }
        />
        <KPICard
          icon={BarChart3}
          label="Total Reports"
          value={reports?.total ?? 0}
        />
      </div>

      {/* Golden Hours */}
      {goldenHours && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Golden Hours (Best Posting Times)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {goldenHours.top_slots.map((slot) => (
                <div
                  key={slot.slot_index}
                  className="border p-2 text-center"
                  style={{
                    backgroundColor: `rgba(59, 130, 246, ${Math.min(
                      slot.weighted_score / 100,
                      0.5
                    )})`,
                  }}
                >
                  <p className="font-mono text-xs font-bold">
                    {slot.slot_time}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Score: {slot.weighted_score.toFixed(1)}
                  </p>
                </div>
              ))}
            </div>
            {goldenHours.selected_slot && (
              <p className="mt-3 text-sm text-muted-foreground">
                Recommended slot:{" "}
                <span className="font-mono font-medium text-foreground">
                  {goldenHours.selected_slot.slot_time}
                </span>
                {goldenHours.is_fallback && " (fallback)"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Publish History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publish History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Golden Hour</TableHead>
                <TableHead>Published At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {publishData?.items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.platform}
                  </TableCell>
                  <TableCell>{item.publishMode}</TableCell>
                  <TableCell>
                    <span
                      className={`text-xs font-medium ${
                        item.status === "published"
                          ? "text-green-600"
                          : item.status === "failed"
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {item.status}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.goldenHourSlot ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.publishedAt
                      ? new Date(item.publishedAt).toLocaleString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
