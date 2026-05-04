"use client";

import { Image as ImageIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentStatusBadge } from "@/components/ui/content-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { usePosts } from "@/hooks/api/use-posts";
import { getMediaUrl } from "@/lib/config";

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
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {post.imagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getMediaUrl(post.imagePath)!}
                      alt={post.trendTitle}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = "none";
                        img.parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-muted-foreground/30 m-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>';
                      }}
                    />
                  ) : (
                    <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                  )}
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
