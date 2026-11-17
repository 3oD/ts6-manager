import { useQuery } from '@tanstack/react-query';
import { dashboardApi, type HistoryRange } from '../api/dashboard.api';
import { useServerStore } from '../stores/server.store';

export function useDashboard() {
  const { selectedConfigId, selectedSid } = useServerStore();
  return useQuery({
    queryKey: ['dashboard', selectedConfigId, selectedSid],
    queryFn: () => dashboardApi.get(selectedConfigId!, selectedSid!),
    enabled: !!selectedConfigId && !!selectedSid,
    refetchInterval: 10000,
  });
}

export function useUserHistory(range: HistoryRange) {
  const { selectedConfigId, selectedSid } = useServerStore();
  return useQuery({
    queryKey: ['dashboard-history', selectedConfigId, selectedSid, range],
    queryFn: () => dashboardApi.history(selectedConfigId!, selectedSid!, range),
    enabled: !!selectedConfigId && !!selectedSid,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
}
