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
import type {
  AutoPublishRequest,
  ManualPublishRequest,
  SchedulePublishRequest,
} from "@/lib/api/types";

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publish"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Publishing started");
    },
    onError: () => {
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
    onSuccess: () => {
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
