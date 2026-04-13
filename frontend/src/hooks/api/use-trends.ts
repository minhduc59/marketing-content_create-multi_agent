import { useQuery } from "@tanstack/react-query";
import { getTrends, getTopTrends, getTrend } from "@/lib/api/trends";
import type { TrendFilters } from "@/lib/api/types";

export function useTrends(params?: TrendFilters) {
  return useQuery({
    queryKey: ["trends", params],
    queryFn: () => getTrends(params),
    placeholderData: (prev) => prev,
  });
}

export function useTopTrends(window: "24h" | "7d" | "30d" = "24h") {
  return useQuery({
    queryKey: ["trends", "top", window],
    queryFn: () => getTopTrends(window),
  });
}

export function useTrend(id: string) {
  return useQuery({
    queryKey: ["trends", id],
    queryFn: () => getTrend(id),
    enabled: !!id,
  });
}
