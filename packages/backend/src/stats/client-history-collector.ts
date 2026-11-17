import { PrismaClient } from '../../generated/prisma/index.js';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import { config } from '../config.js';

/**
 * Periodically records how many users are online on every virtual server of
 * every configured TeamSpeak instance, so the dashboard can show a history.
 */
export class ClientHistoryCollector {
  private sampleTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private prisma: PrismaClient, private pool: ConnectionPool) {}

  start(): void {
    const intervalMs = config.statsSampleIntervalMinutes * 60 * 1000;
    // First sample shortly after startup, then on a fixed interval
    setTimeout(() => this.sample(), 15_000).unref();
    this.sampleTimer = setInterval(() => this.sample(), intervalMs);
    this.cleanupTimer = setInterval(() => this.cleanup(), 6 * 60 * 60 * 1000);
    this.cleanup();
    console.log(
      `[Stats] Recording online users every ${config.statsSampleIntervalMinutes} min, ` +
      `keeping ${config.statsRetentionDays} days of history`,
    );
  }

  destroy(): void {
    if (this.sampleTimer) clearInterval(this.sampleTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async sample(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const timestamp = new Date();
      const rows: { serverConfigId: number; virtualServerId: number; clients: number; maxClients: number; timestamp: Date }[] = [];

      await Promise.all(this.pool.getClientIds().map(async (configId) => {
        try {
          const list = await this.pool.getClient(configId).execute(0, 'serverlist');
          const servers = Array.isArray(list) ? list : list ? [list] : [];
          for (const vs of servers) {
            if (vs.virtualserver_status && String(vs.virtualserver_status) !== 'online') continue;
            const sid = Number(vs.virtualserver_id);
            if (!sid) continue;
            // clientsonline includes query clients (bots, this panel) — exclude them
            const total = Number(vs.virtualserver_clientsonline) || 0;
            const query = Number(vs.virtualserver_queryclientsonline) || 0;
            rows.push({
              serverConfigId: configId,
              virtualServerId: sid,
              clients: Math.max(0, total - query),
              maxClients: Number(vs.virtualserver_maxclients) || 0,
              timestamp,
            });
          }
        } catch (err: any) {
          // Server unreachable — skip this round, the gap shows up in the chart
          console.warn(`[Stats] Could not sample server config ${configId}: ${err?.message ?? err}`);
        }
      }));

      if (rows.length) await this.prisma.clientCountSample.createMany({ data: rows });
    } catch (err) {
      console.error('[Stats] Sampling failed:', err);
    } finally {
      this.running = false;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - config.statsRetentionDays * 24 * 60 * 60 * 1000);
      await this.prisma.clientCountSample.deleteMany({ where: { timestamp: { lt: cutoff } } });
    } catch (err) {
      console.error('[Stats] Cleanup failed:', err);
    }
  }
}
