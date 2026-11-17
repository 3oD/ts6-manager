import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./data/ts6webui.db',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me-in-production',
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  // Refresh token lifetime (days). Sliding: every refresh extends it again.
  refreshRememberDays: parseInt(process.env.REFRESH_REMEMBER_DAYS || '30', 10),
  refreshSessionDays: parseInt(process.env.REFRESH_SESSION_DAYS || '1', 10),
  // Online user history sampling
  statsSampleIntervalMinutes: Math.max(1, parseInt(process.env.STATS_SAMPLE_INTERVAL_MINUTES || '5', 10)),
  statsRetentionDays: Math.max(1, parseInt(process.env.STATS_RETENTION_DAYS || '90', 10)),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  tsAllowSelfSigned: process.env.TS_ALLOW_SELF_SIGNED === 'true' || process.env.TS_ALLOW_SELF_SIGNED === '1',
};
