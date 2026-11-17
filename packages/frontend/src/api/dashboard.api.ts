import api from './client';

export type HistoryRange = '6h' | '24h' | '7d' | '30d' | '90d';

export interface UserHistoryPoint {
  t: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export interface UserHistory {
  range: HistoryRange;
  bucketMinutes: number;
  sampleIntervalMinutes: number;
  sampleCount: number;
  average: number | null;
  peak: { clients: number; timestamp: string } | null;
  points: UserHistoryPoint[];
}

export const dashboardApi = {
  get: (configId: number, sid: number) =>
    api.get(`/servers/${configId}/vs/${sid}/dashboard`).then((r) => r.data),

  history: (configId: number, sid: number, range: HistoryRange) =>
    api
      .get<UserHistory>(`/servers/${configId}/vs/${sid}/dashboard/history`, { params: { range } })
      .then((r) => r.data),
};
