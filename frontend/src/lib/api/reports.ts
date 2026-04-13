import apiClient from "./client";
import type { PaginatedResponse, ReportListItem } from "./types";

export async function getReports(params?: {
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<ReportListItem>> {
  const { data } = await apiClient.get("/reports", { params });
  return data;
}

export async function getReport(
  scanRunId: string
): Promise<{ id: string; status: string; totalItemsFound: number; startedAt: string; completedAt: string | null; reportFilePath: string }> {
  const { data } = await apiClient.get(`/reports/${scanRunId}`);
  return data;
}
