"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ContentStatusBadge } from "@/components/ui/content-status-badge";
import { usePost, useUpdatePostStatus } from "@/hooks/api/use-posts";
import { usePublishNow, useAutoPublish } from "@/hooks/api/use-publish";
import { ContentStatus, PostFormat } from "@/lib/api/types";

const formatLabels: Record<PostFormat, string> = {
  [PostFormat.QUICK_TIPS]: "Quick Tips",
  [PostFormat.HOT_TAKE]: "Hot Take",
  [PostFormat.TRENDING_BREAKDOWN]: "Trending Breakdown",
  [PostFormat.DID_YOU_KNOW]: "Did You Know",
  [PostFormat.TUTORIAL_HACK]: "Tutorial Hack",
  [PostFormat.MYTH_BUSTERS]: "Myth Busters",
  [PostFormat.BEHIND_THE_TECH]: "Behind the Tech",
};

export default function ContentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const { data: post, isLoading } = usePost(id);
  const updateStatus = useUpdatePostStatus();
  const publishNow = usePublishNow();
  const autoPublish = useAutoPublish();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!post) {
    return <p className="text-muted-foreground">Post not found.</p>;
  }

  const isReadOnly = post.status === ContentStatus.PUBLISHED;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/content">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">
            {post.trendTitle}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">
              {formatLabels[post.format] ?? post.format}
            </Badge>
            <ContentStatusBadge status={post.status} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Content */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Caption</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={post.caption}
                readOnly={isReadOnly}
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="mt-2 text-right font-mono text-xs text-muted-foreground">
                {post.caption.length} characters
              </p>
            </CardContent>
          </Card>

          {/* Hashtags */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hashtags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {post.hashtags.map((tag, i) => (
                  <Badge key={i} variant="outline">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* CTA */}
          {post.cta && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Call to Action</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{post.cta}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Review + Actions */}
        <div className="space-y-4">
          {/* Review Score */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {post.reviewScore !== null && (
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-bold">
                    {post.reviewScore.toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground">/ 10</span>
                </div>
              )}
              {post.reviewNotes && (
                <div className="bg-muted p-3 text-sm">{post.reviewNotes}</div>
              )}
              {post.reviewCriteria && (
                <div className="space-y-1">
                  {Object.entries(post.reviewCriteria).map(([key, val]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-muted-foreground">{key}</span>
                      <span className="font-mono">{String(val)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {post.engagementPrediction && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Engagement</span>
                  <span className="font-medium">
                    {post.engagementPrediction}
                  </span>
                </div>
              )}
              {post.bestPostingDay && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Best day</span>
                  <span className="font-medium">{post.bestPostingDay}</span>
                </div>
              )}
              {post.bestPostingTime && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Best time</span>
                  <span className="font-mono">{post.bestPostingTime}</span>
                </div>
              )}
              {post.wordCount !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Word count</span>
                  <span className="font-mono">{post.wordCount}</span>
                </div>
              )}
              {post.trendUrl && (
                <a
                  href={post.trendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  View original <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <Separator />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Created</span>
                <span>{format(new Date(post.createdAt), "MMM d, HH:mm")}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Revisions</span>
                <span>{post.revisionCount}</span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {!isReadOnly && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(post.status === ContentStatus.DRAFT ||
                  post.status === ContentStatus.FLAGGED_FOR_REVIEW ||
                  post.status === ContentStatus.NEEDS_REVISION) && (
                  <Button
                    className="w-full"
                    onClick={() =>
                      updateStatus.mutate({
                        id: post.id,
                        status: ContentStatus.APPROVED,
                      })
                    }
                    disabled={updateStatus.isPending}
                  >
                    Approve
                  </Button>
                )}

                {post.status === ContentStatus.DRAFT && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      updateStatus.mutate({
                        id: post.id,
                        status: ContentStatus.NEEDS_REVISION,
                      })
                    }
                    disabled={updateStatus.isPending}
                  >
                    Needs Revision
                  </Button>
                )}

                {post.status === ContentStatus.APPROVED && (
                  <>
                    <Button
                      className="w-full"
                      onClick={() =>
                        publishNow.mutate({ postId: post.id })
                      }
                      disabled={publishNow.isPending}
                    >
                      Publish Now
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        autoPublish.mutate({ postId: post.id })
                      }
                      disabled={autoPublish.isPending}
                    >
                      Auto-publish (Golden Hour)
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
