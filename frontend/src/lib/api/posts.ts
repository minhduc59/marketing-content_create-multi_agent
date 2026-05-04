import { z } from "zod";
import apiClient from "./client";
import type {
  ContentPost,
  ContentStatus,
  PaginatedResponse,
  PostFilters,
  PostGenRequest,
} from "./types";

export const articleSchema = z.object({
  url: z
    .string()
    .url("Please enter a valid URL")
    .refine((u) => /^https?:\/\//i.test(u), "URL must start with http(s)://"),
  options: z
    .object({
      num_posts: z.number().int().min(1).max(10).optional(),
      formats: z.array(z.string()).optional(),
    })
    .optional(),
});

export type ArticleInput = z.infer<typeof articleSchema>;

export interface FromArticleResponse {
  scan_run_id: string;
  status: string;
  message?: string;
}

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

export async function createPostFromArticle(
  payload: ArticleInput
): Promise<FromArticleResponse> {
  const { data } = await apiClient.post("/posts/from-article", payload);
  return data;
}

export async function reviewPost(
  id: string,
  dto: { action: "approve" | "reject"; feedback?: string }
) {
  const { data } = await apiClient.post(`/posts/${id}/review`, dto);
  return data;
}
