import apiClient from "./client";
import type {
  ContentPost,
  ContentStatus,
  PaginatedResponse,
  PostFilters,
  PostGenRequest,
} from "./types";

export async function getPosts(
  params?: PostFilters
): Promise<PaginatedResponse<ContentPost>> {
  const { data } = await apiClient.get("/posts", { params });
  return data;
}

export async function getPost(id: string): Promise<ContentPost> {
  const { data } = await apiClient.get(`/posts/${id}`);
  return data;
}

export async function generatePosts(dto: PostGenRequest) {
  const { data } = await apiClient.post("/posts/generate", dto);
  return data;
}

export async function updatePostStatus(id: string, status: ContentStatus) {
  const { data } = await apiClient.patch(`/posts/${id}/status`, { status });
  return data;
}
