import { Router, Request, Response } from 'express';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import { config } from '../config.js';

export const dashboardRoutes: Router = Router({ mergeParams: true });

const getClient = (req: Request) => {
  const pool: ConnectionPool = req.app.locals.connectionPool;
  return pool.getClient(parseInt(String(req.params.configId)));
};

dashboardRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const sid = parseInt(String(req.params.sid));
    const client = getClient(req);

    const [serverInfo, clientList, channelList, connectionInfo] = await Promise.all([
      client.execute(sid, 'serverinfo'),
      client.execute(sid, 'clientlist'),
      client.execute(sid, 'channellist'),
      client.execute(sid, 'serverrequestconnectioninfo'),
    ]);

    const info = Array.isArray(serverInfo) ? serverInfo[0] : serverInfo;
    const connInfo = Array.isArray(connectionInfo) ? connectionInfo[0] : connectionInfo;
    const clients = Array.isArray(clientList) ? clientList : [];
    const channels = Array.isArray(channelList) ? channelList : [];

    const onlineClients = clients.filter((c: any) => String(c.client_type) === '0');

    res.json({
      serverName: info.virtualserver_name,
      platform: info.virtualserver_platform,
      version: info.virtualserver_version,
      onlineUsers: onlineClients.length,
      maxClients: Number(info.virtualserver_maxclients) || 0,
      uptime: Number(info.virtualserver_uptime) || 0,
      channelCount: channels.length,
      bandwidth: {
        incoming: Number(connInfo.connection_bandwidth_received_last_second_total) || 0,
        outgoing: Number(connInfo.connection_bandwidth_sent_last_second_total) || 0,
      },
      packetloss: Number(info.virtualserver_total_packetloss_total) || 0,
      ping: Number(info.virtualserver_total_ping) || 0,
    });
  } catch (err) { next(err); }
});

// Online user history, aggregated into time buckets for charting.
// Range → bucket size (minutes). Keeps every response at roughly 150–300 points.
const HISTORY_RANGES: Record<string, { hours: number; bucketMinutes: number }> = {
  '6h': { hours: 6, bucketMinutes: 5 },
  '24h': { hours: 24, bucketMinutes: 5 },
  '7d': { hours: 24 * 7, bucketMinutes: 60 },
  '30d': { hours: 24 * 30, bucketMinutes: 180 },
  '90d': { hours: 24 * 90, bucketMinutes: 720 },
};

dashboardRoutes.get('/history', async (req: Request, res: Response, next) => {
  try {
    const configId = parseInt(String(req.params.configId));
    const sid = parseInt(String(req.params.sid));
    const rangeKey = String(req.query.range || '24h');
    const range = HISTORY_RANGES[rangeKey];
    if (!range) {
      return res.status(400).json({ error: `Invalid range. Use one of: ${Object.keys(HISTORY_RANGES).join(', ')}` });
    }

    const bucketMinutes = Math.max(range.bucketMinutes, config.statsSampleIntervalMinutes);
    const bucketMs = bucketMinutes * 60 * 1000;
    const now = Date.now();
    const since = new Date(now - range.hours * 60 * 60 * 1000);

    const prisma = req.app.locals.prisma;
    const samples: { clients: number; timestamp: Date }[] = await prisma.clientCountSample.findMany({
      where: { serverConfigId: configId, virtualServerId: sid, timestamp: { gte: since } },
      select: { clients: true, timestamp: true },
      orderBy: { timestamp: 'asc' },
    });

    // Aggregate samples into buckets
    const buckets = new Map<number, { sum: number; count: number; min: number; max: number }>();
    let peak: { clients: number; timestamp: string } | null = null;
    let total = 0;
    for (const s of samples) {
      const key = Math.floor(s.timestamp.getTime() / bucketMs) * bucketMs;
      const b = buckets.get(key);
      if (b) {
        b.sum += s.clients; b.count++;
        b.min = Math.min(b.min, s.clients); b.max = Math.max(b.max, s.clients);
      } else {
        buckets.set(key, { sum: s.clients, count: 1, min: s.clients, max: s.clients });
      }
      total += s.clients;
      if (!peak || s.clients >= peak.clients) peak = { clients: s.clients, timestamp: s.timestamp.toISOString() };
    }

    // Emit every bucket in the range so periods without data show up as gaps
    const points: { t: number; avg: number | null; min: number | null; max: number | null }[] = [];
    const first = Math.floor(since.getTime() / bucketMs) * bucketMs;
    for (let t = first; t <= now; t += bucketMs) {
      const b = buckets.get(t);
      points.push(b
        ? { t, avg: Math.round((b.sum / b.count) * 10) / 10, min: b.min, max: b.max }
        : { t, avg: null, min: null, max: null });
    }

    res.json({
      range: rangeKey,
      bucketMinutes,
      sampleIntervalMinutes: config.statsSampleIntervalMinutes,
      sampleCount: samples.length,
      average: samples.length ? Math.round((total / samples.length) * 10) / 10 : null,
      peak,
      points,
    });
  } catch (err) { next(err); }
});
