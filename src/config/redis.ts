import { RedisOptions } from 'ioredis';

// BullMQ needs connection options rather than a URL
export function redisConnection(url: string): RedisOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    db: Number(parsed.pathname.slice(1) || 0),
    maxRetriesPerRequest: null,
  };
}
