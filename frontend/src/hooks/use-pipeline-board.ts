"use client";
import { useMemo } from "react";
import { usePosts } from "@/hooks/api/use-posts";
import { usePublishHistory } from "@/hooks/api/use-publish";
import { useScans } from "@/hooks/api/use-scans";
import { deriveStage, COLUMN_ORDER, type BoardCard, type PipelineStage } from "@/lib/pipeline/stages";
import type { EngagementPrediction } from "@/lib/api/types";
import { ScanStatus } from "@/lib/api/types";

export type SourceFilter = "all" | "hackernews" | "url";

export function usePipelineBoard(sourceFilter: SourceFilter = "all") {
  const { data: postsData, isLoading: postsLoading } = usePosts({ pageSize: 100 });
  const { data: publishData } = usePublishHistory({ pageSize: 200 });
  const { data: scansData } = useScans({ pageSize: 20 });

  const cards = useMemo<BoardCard[]>(() => {
    const posts = postsData?.items ?? [];
    const publishedPosts = publishData?.items ?? [];
    const scans = scansData?.items ?? [];

    // Build map: contentPostId → latest PublishedPost
    const publishMap = new Map<string, (typeof publishedPosts)[0]>();
    for (const p of publishedPosts) {
      const existing = publishMap.get(p.contentPostId);
      if (!existing || new Date(p.createdAt) > new Date(existing.createdAt)) {
        publishMap.set(p.contentPostId, p);
      }
    }

    // Build map: scanRunId → platformsRequested
    const scanMap = new Map<string, string[]>();
    for (const s of scans) {
      scanMap.set(s.id, s.platformsRequested);
    }

    // Scan cards (Scanning column) — active scan runs
    const scanCards: BoardCard[] = scans
      .filter((s) => s.status === ScanStatus.RUNNING || s.status === ScanStatus.PENDING)
      .map((s) => ({
        id: `scan-${s.id}`,
        type: "scan" as const,
        stage: "scanning" as PipelineStage,
        source: "hackernews" as const,
        title: `Scan · ${s.totalItemsFound} articles found`,
        engagementPrediction: null,
        createdAt: s.startedAt,
        scan: s,
      }));

    // Post cards
    const postCards: BoardCard[] = posts.map((post) => {
      const publish = publishMap.get(post.id);
      const stage = deriveStage(post, publish);
      const platforms = scanMap.get(post.scanRunId) ?? [];
      const source = platforms.includes("hackernews") ? "hackernews" : "url";
      return {
        id: `post-${post.id}`,
        type: "post" as const,
        stage,
        source,
        title: post.trendTitle,
        engagementPrediction: (post.engagementPrediction as EngagementPrediction | null) ?? null,
        createdAt: post.createdAt,
        post,
        publish,
      };
    });

    const all = [...scanCards, ...postCards];

    // Apply source filter
    if (sourceFilter === "all") return all;
    return all.filter((c) => c.source === sourceFilter);
  }, [postsData, publishData, scansData, sourceFilter]);

  // Group by stage, sorted newest-first within each group
  const columns = useMemo(() => {
    const map = new Map<PipelineStage, BoardCard[]>();
    for (const card of cards) {
      const list = map.get(card.stage) ?? [];
      list.push(card);
      map.set(card.stage, list);
    }
    // Sort newest-first
    COLUMN_ORDER.forEach((stage) => {
      const list = map.get(stage);
      if (list) {
        map.set(stage, list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }
    });
    return map;
  }, [cards]);

  return { columns, isLoading: postsLoading };
}
