"use client";

import Link from "next/link";
import { ArrowLeft, Download, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentStatusBadge } from "@/components/ui/content-status-badge";
import { usePost } from "@/hooks/api/use-posts";
import { getMediaUrl } from "@/lib/config";

export default function MediaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const { data: post, isLoading } = usePost(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="aspect-square max-w-lg" />
      </div>
    );
  }

  if (!post) {
    return <p className="text-muted-foreground">Post not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/media">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">
            {post.trendTitle}
          </h1>
          <ContentStatusBadge status={post.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Image Preview */}
        <Card>
          <CardContent className="p-4">
            {post.imagePath ? (
              <Tabs defaultValue="feed">
                <TabsList className="mb-4">
                  <TabsTrigger value="feed">Feed 1:1</TabsTrigger>
                  <TabsTrigger value="story">Story 9:16</TabsTrigger>
                  <TabsTrigger value="wide">Wide 1.91:1</TabsTrigger>
                </TabsList>
                <TabsContent value="feed">
                  <div className="aspect-square overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getMediaUrl(post.imagePath)!} alt={post.trendTitle} className="h-full w-full rounded-md border border-border object-cover" />
                  </div>
                </TabsContent>
                <TabsContent value="story">
                  <div className="aspect-[9/16] max-h-[500px] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getMediaUrl(post.imagePath)!} alt={post.trendTitle} className="h-full w-full rounded-md border border-border object-cover" />
                  </div>
                </TabsContent>
                <TabsContent value="wide">
                  <div className="aspect-[1.91/1] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getMediaUrl(post.imagePath)!} alt={post.trendTitle} className="h-full w-full rounded-md border border-border object-cover" />
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="aspect-square bg-muted flex items-center justify-center rounded-md">
                <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details */}
        <div className="space-y-4">
          {post.imagePrompt && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Image Prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {JSON.stringify(post.imagePrompt, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Caption Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{post.caption}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {post.hashtags.map((tag, i) => (
                  <span key={i} className="text-xs text-blue-600">
                    #{tag}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {post.imagePath && (
            <Button variant="outline" className="w-full" asChild>
              <a href={getMediaUrl(post.imagePath)!} download target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Download Image
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
