"use client";

import { Image as ImageIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentStatusBadge } from "@/components/ui/content-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { usePosts } from "@/hooks/api/use-posts";

export default function MediaPage() {
  const { data, isLoading } = usePosts({ pageSize: 50 });

  const postsWithImages = data?.items?.filter((p) => p.imagePath) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Visual Factory</h1>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : postsWithImages.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No media assets yet"
          description="Media will appear here once content with images is generated."
          action={{ label: "Create Content", href: "/content" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {postsWithImages.map((post) => (
            <Link key={post.id} href={`/media/${post.id}`}>
              <Card className="overflow-hidden transition-colors hover:border-foreground/20">
                <div className="aspect-square bg-muted flex items-center justify-center">
                  <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                </div>
                <CardContent className="p-3">
                  <p className="truncate text-sm font-medium">
                    {post.trendTitle}
                  </p>
                  <div className="mt-1">
                    <ContentStatusBadge status={post.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
