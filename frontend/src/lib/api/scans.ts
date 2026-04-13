import apiClient from "./client";
import type {
  PaginatedResponse,
  ScanRun,
  ScanStatusResponse,
  TriggerScanDto,
} from "./types";

export async function triggerScan(dto: TriggerScanDto) {
  const { data } = await apiClient.post("/scans", dto);
  return data;
}

export async function getScans(params?: {
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<ScanRun>> {
  const { data } = await apiClient.get("/scans", { params });
  return data;
}

export async function getScan(id: string): Promise<ScanRun> {
  const { data } = await apiClient.get(`/scans/${id}`);
  return data;
}

export async function getScanStatus(id: string): Promise<ScanStatusResponse> {
  const { data } = await apiClient.get(`/scans/${id}/status`);
  return data;
}
