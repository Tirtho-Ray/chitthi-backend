import { ConfigService } from '@nestjs/config';
import type { ConnectionOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';

/**
 * Shared ioredis options for app cache, pub/sub subscribers, and BullMQ workers.
 * BullMQ requires maxRetriesPerRequest: null on the underlying ioredis client.
 */
export function getStandaloneRedisOptions(
  config: ConfigService,
): RedisOptions {
  const tlsEnabled = config.get<string>('redis.tls') === 'true';
  const sentinelHost = config.get<string>('redis.sentinelHost');
  const rejectUnauthorized =
    config.get<string>('redis.tlsRejectUnauthorized', 'true') !== 'false';

  const common: RedisOptions = {
    password: config.get<string>('redis.password'),
    username: config.get<string>('redis.username'),
    db: config.get<number>('redis.db', 0),
    tls: tlsEnabled ? { rejectUnauthorized } : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: config.get<number>('redis.connectTimeoutMs', 10_000),
    retryStrategy: (times: number) => {
      if (times > 10) return null;
      return Math.min(2 ** times * 100, 5_000);
    },
  };

  if (sentinelHost) {
    return {
      ...common,
      sentinels: [
        {
          host: sentinelHost,
          port: config.get<number>('redis.sentinelPort', 26379),
        },
      ],
      name: config.get<string>('redis.sentinelMaster', 'mymaster'),
    };
  }

  return {
    ...common,
    host: config.get<string>('redis.host', 'localhost'),
    port: config.get<number>('redis.port', 6379),
  };
}

/**
 * BullMQ / Nest @nestjs/bullmq connection — keep in sync with RedisService.
 */
export function bullMqConnectionFromConfig(
  config: ConfigService,
): ConnectionOptions {
  const url = config.get<string>('redis.url')?.trim();
  if (url) {
    const isTlsUrl = /^rediss:/i.test(url);
    const tlsEnv = config.get<string>('redis.tls') === 'true';
    const rejectUnauthorized =
      config.get<string>('redis.tlsRejectUnauthorized', 'true') !== 'false';
    const tls =
      isTlsUrl || tlsEnv ? { rejectUnauthorized } : undefined;

    return {
      url,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      ...(tls ? { tls } : {}),
    };
  }
  return getStandaloneRedisOptions(config);
}
