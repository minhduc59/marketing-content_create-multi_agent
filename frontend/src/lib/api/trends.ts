import apiClient from "./client";
import type { PaginatedResponse, TrendFilters, TrendItem } from "./types";

export async function getTrends(
  params?: TrendFilters
): Promise<PaginatedResponse<TrendItem>> {
  const { data } = await apiClient.get("/trends", { params });
  return data;
}

export async function getTopTrends(
  window: "24h" | "7d" | "30d" = "24h"
): Promise<TrendItem[]> {
  const { data } = await apiClient.get("/trends/top", {
    params: { window },
  });
  return data;
}

export async function getTrend(id: string): Promise<TrendItem> {
  const { data } = await apiClient.get(`/trends/${id}`);
  return data;
}
