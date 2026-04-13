import apiClient from "./client";
import type {
  AutoPublishRequest,
  GoldenHoursResponse,
  ManualPublishRequest,
  PaginatedResponse,
  PublishAcceptedResponse,
  PublishedPost,
  PublishStatusResponse,
  SchedulePublishRequest,
} from "./types";

export async function publishNow(
  postId: string,
  dto?: ManualPublishRequest
): Promise<PublishAcceptedResponse> {
  const { data } = await apiClient.post(`/publish/${postId}`, dto ?? {});
  return data;
}

export async function schedulePublish(
  postId: string,
  dto: SchedulePublishRequest
): Promise<PublishAcceptedResponse> {
  const { data } = await apiClient.post(`/publish/${postId}/schedule`, dto);
  return data;
}

export async function autoPublish(
  postId: string,
  dto?: AutoPublishRequest
): Promise<PublishAcceptedResponse> {
  const { data } = await apiClient.post(`/publish/${postId}/auto`, dto ?? {});
  return data;
}

export async function cancelSchedule(postId: string) {
  const { data } = await apiClient.delete(`/publish/${postId}/schedule`);
  return data;
}

export async function getPublishHistory(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<PublishedPost>> {
  const { data } = await apiClient.get("/publish/history", { params });
  return data;
}

export async function getGoldenHours(): Promise<GoldenHoursResponse> {
  const { data } = await apiClient.get("/publish/golden-hours");
  return data;
}

export async function getPublishStatus(
  publishedPostId: string
): Promise<PublishStatusResponse> {
  const { data } = await apiClient.get(`/publish/${publishedPostId}/status`);
  return data;
}
