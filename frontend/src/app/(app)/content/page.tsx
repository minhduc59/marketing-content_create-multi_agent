"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { FileText } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ContentStatusBadge } from "@/components/ui/content-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { usePosts } from "@/hooks/api/use-posts";
import { ContentStatus, PostFormat } from "@/lib/api/types";

const statusTabs = [
  { value: "all", label: "All" },
  { value: ContentStatus.DRAFT, label: "Draft" },
  { value: ContentStatus.APPROVED, label: "Approved" },
  { value: ContentStatus.NEEDS_REVISION, label: "Needs Revision" },
  { value: ContentStatus.FLAGGED_FOR_REVIEW, label: "Flagged" },
  { value: ContentStatus.PUBLISHED, label: "Published" },
];

const formatLabels: Record<PostFormat, string> = {
  [PostFormat.QUICK_TIPS]: "Quick Tips",
  [PostFormat.HOT_TAKE]: "Hot Take",
  [PostFormat.TRENDING_BREAKDOWN]: "Trending Breakdown",
  [PostFormat.DID_YOU_KNOW]: "Did You Know",
  [PostFormat.TUTORIAL_HACK]: "Tutorial Hack",
  [PostFormat.MYTH_BUSTERS]: "Myth Busters",
  [PostFormat.BEHIND_THE_TECH]: "Behind the Tech",
};

export default function ContentListPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = usePosts({
    ...(statusFilter !== "all"
      ? { status: statusFilter as ContentStatus }
      : {}),
    page,
    pageSize: 20,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Content Studio</h1>
      </div>

      <Tabs
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <TabsList>
          {statusTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <EmptyState
          icon={FileText}
          title="No content yet"
          description="Generate content from trending topics to get started."
          action={{ label: "Browse Trends", href: "/trends" }}
        />
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((post) => (
              <Link
                key={post.id}
                href={`/content/${post.id}`}
                className="flex items-center gap-4 border p-4 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {formatLabels[post.format] ?? post.format}
                    </Badge>
                    <span className="truncate text-sm font-medium">
                      {post.trendTitle}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {post.caption.slice(0, 120)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {post.reviewScore !== null && (
                    <span className="font-mono text-sm">
                      {post.reviewScore.toFixed(1)}
                    </span>
                  )}
                  <ContentStatusBadge status={post.status} />
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(post.createdAt), "MMM d")}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {data.total > 20 && (
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
                Page {page} of {Math.ceil(data.total / 20)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(data.total / 20)}
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
