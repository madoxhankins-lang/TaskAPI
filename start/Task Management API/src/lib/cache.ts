import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { config } from '../config';
import { logger } from './logger';

export const redis = createClient({
  url: config.REDIS_URL,
  disableOfflineQueue: true,
  socket: { connectTimeout: 2000, reconnectStrategy: retries => Math.min(100 * (retries + 1), 2000) }
});
redis.on('error', () => logger.warn('Redis unavailable; task lists will use PostgreSQL'));
let connectionEpoch = randomUUID();
redis.on('ready', () => { connectionEpoch = randomUUID(); });

// Each write changes the owner's version, so an old in-flight read cannot
// refill the current cache with stale data. Pages share the same version.
export const taskCache = {
  async version(ownerId: string): Promise<string | null> {
    if (!redis.isReady) return null;
    try {
      const key = 'tasks:version:' + ownerId;
      await redis.set(key, randomUUID(), { NX: true });
      const version = await redis.get(key);
      return version ? connectionEpoch + ':' + version : null;
    } catch { return null; }
  },
  async get(key: string): Promise<unknown | null> {
    if (!redis.isReady) return null;
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch { return null; }
  },
  async set(key: string, data: unknown): Promise<void> {
    if (!redis.isReady) return;
    try { await redis.set(key, JSON.stringify(data), { EX: 60 }); }
    catch { logger.warn('Cache write skipped'); }
  },
  async invalidate(ownerId: string): Promise<void> {
    // A reconnect changes connectionEpoch, bypassing entries left over while
    // this API instance was writing with Redis unavailable.
    if (!redis.isReady) return;
    try { await redis.set('tasks:version:' + ownerId, randomUUID()); }
    catch {
      connectionEpoch = randomUUID();
      logger.warn('Cache invalidation unavailable; previous entries bypassed');
    }
  }
};
