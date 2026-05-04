import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getPosts,
  getPost,
  generatePosts,
  updatePostStatus,
  createPostFromArticle,
  reviewPost,
  type ArticleInput,
} from "@/lib/api/posts";
import type { ContentStatus, PostFilters, PostGenRequest } from "@/lib/api/types";
import { usePipelineStore } from "@/stores/pipeline-store";

export function usePosts(params?: PostFilters) {
  return useQuery({
    queryKey: ["posts", params],
    queryFn: () => getPosts(params),
    placeholderData: (prev) => prev,
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: ["posts", id],
    queryFn: () => getPost(id),
    enabled: !!id,
  });
}

export function useGeneratePosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: PostGenRequest) => generatePosts(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post generation started");
    },
    onError: () => {
      toast.error("Failed to generate posts");
    },
  });
}

export function useCreatePostFromArticle() {
  const queryClient = useQueryClient();
  const setActiveScan = usePipelineStore((s) => s.setActiveScan);
  return useMutation({
    mutationFn: (payload: ArticleInput) => createPostFromArticle(payload),
    onSuccess: (res) => {
      setActiveScan(res.scan_run_id);
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      toast.success("Article submitted — generating posts");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to submit article";
      toast.error(msg);
    },
  });
}

export function useUpdatePostStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      updatePostStatus(id, status),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(`Post marked as ${status}`);
    },
    onError: () => {
      toast.error("Failed to update post status");
    },
  });
}

export function useReviewPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, feedback }: { id: string; action: "approve" | "reject"; feedback?: string }) =>
      reviewPost(id, { action, feedback }),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success(action === "approve" ? "Post approved" : "Post sent back for revision");
    },
    onError: () => toast.error("Review action failed"),
  });
}
