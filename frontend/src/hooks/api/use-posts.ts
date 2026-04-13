import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getPosts,
  getPost,
  generatePosts,
  updatePostStatus,
} from "@/lib/api/posts";
import type { ContentStatus, PostFilters, PostGenRequest } from "@/lib/api/types";

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
