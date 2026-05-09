import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  publishNow,
  schedulePublish,
  autoPublish,
  cancelSchedule,
  getPublishHistory,
  getGoldenHours,
  getPublishStatus,
} from "@/lib/api/publish";
import { getSocketInstance } from "@/lib/socket";
import {
  PublishMode,
  PublishStatus,
  type AutoPublishRequest,
  type ManualPublishRequest,
  type PublishedPost,
  type SchedulePublishRequest,
} from "@/lib/api/types";

type PublishHistoryCache = { items: PublishedPost[]; total: number; page: number; pageSize: number };

export function usePublishHistory(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ["publish", "history", params],
    queryFn: () => getPublishHistory(params),
  });
}

export function usePublishStatus(id: string | null) {
  return useQuery({
    queryKey: ["publish", id, "status"],
    queryFn: () => getPublishStatus(id!),
    enabled: !!id,
    refetchInterval: 3000,
  });
}

export function useGoldenHours() {
  return useQuery({
    queryKey: ["golden-hours"],
    queryFn: getGoldenHours,
  });
}

export function usePublishNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      postId,
      dto,
    }: {
      postId: string;
      dto?: ManualPublishRequest;
    }) => publishNow(postId, dto),
    onMutate: async ({ postId }) => {
      // Optimistic update: inject a PROCESSING PublishedPost into every
      // ["publish", "history", ...] cache so the kanban moves the card to
      // the "Publishing" column immediately. deriveStage maps PROCESSING → publishing.
      await queryClient.cancelQueries({ queryKey: ["publish", "history"] });
      const previous = queryClient.getQueriesData<PublishHistoryCache>({
        queryKey: ["publish", "history"],
      });
      const optimisticEntry: PublishedPost = {
        id: `optimistic-${postId}`,
        contentPostId: postId,
        publishedBy: null,
        platform: "tiktok",
        publishMode: PublishMode.MANUAL,
        status: PublishStatus.PROCESSING,
        privacyLevel: "PUBLIC_TO_EVERYONE",
        tiktokPublishId: null,
        platformPostId: null,
        goldenHourSlot: null,
        scheduledAt: null,
        publishedAt: null,
        errorMessage: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      queryClient.setQueriesData<PublishHistoryCache>(
        { queryKey: ["publish", "history"] },
        (old) => {
          if (!old) return old;
          return { ...old, items: [optimisticEntry, ...old.items], total: old.total + 1 };
        },
      );
      return { previous };
    },
    onSuccess: (data) => {
      getSocketInstance()?.emit("subscribe", {
        resource: "publish",
        id: data.published_post_id,
      });
      queryClient.invalidateQueries({ queryKey: ["publish"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Publishing started");
    },
    onError: (_err, _vars, context) => {
      // Roll back optimistic entries
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Failed to publish");
    },
  });
}

export function useSchedulePublish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      postId,
      dto,
    }: {
      postId: string;
      dto: SchedulePublishRequest;
    }) => schedulePublish(postId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publish"] });
      toast.success("Post scheduled successfully");
    },
    onError: () => {
      toast.error("Failed to schedule post");
    },
  });
}

export function useAutoPublish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      postId,
      dto,
    }: {
      postId: string;
      dto?: AutoPublishRequest;
    }) => autoPublish(postId, dto),
    onSuccess: (data) => {
      getSocketInstance()?.emit("subscribe", {
        resource: "publish",
        id: data.published_post_id,
      });
      queryClient.invalidateQueries({ queryKey: ["publish"] });
      toast.success("Auto-publish scheduled for golden hour");
    },
    onError: () => {
      toast.error("Failed to auto-publish");
    },
  });
}

export function useCancelSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => cancelSchedule(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publish"] });
      toast.success("Schedule cancelled");
    },
    onError: () => {
      toast.error("Failed to cancel schedule");
    },
  });
}
