import { useQuery } from "@tanstack/react-query";
import { getReports, getReport } from "@/lib/api/reports";

export function useReports(params?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ["reports", params],
    queryFn: () => getReports(params),
  });
}

export function useReport(scanRunId: string) {
  return useQuery({
    queryKey: ["reports", scanRunId],
    queryFn: () => getReport(scanRunId),
    enabled: !!scanRunId,
  });
}
