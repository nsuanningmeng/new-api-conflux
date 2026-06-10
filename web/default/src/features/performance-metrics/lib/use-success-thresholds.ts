import { useQuery } from '@tanstack/react-query'
import { getPerfMetricsSummary } from '../api'

export function useSuccessThresholds() {
  const query = useQuery({
    queryKey: ['perf-metrics-summary', 24],
    queryFn: () => getPerfMetricsSummary(24),
    staleTime: 60 * 1000,
    retry: false,
  })
  return {
    green: query.data?.data.success_threshold_green ?? 99.9,
    red: query.data?.data.success_threshold_red ?? 99.0,
  }
}
