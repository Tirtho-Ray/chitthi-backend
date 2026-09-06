import { ConfigService } from '@nestjs/config';
import {
  bullMqConnectionFromConfig,
  getStandaloneRedisOptions,
} from './redis-options.factory';

function mockConfig(map: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string, defaultValue?: T): T => {
      const k = key as keyof typeof map;
      const v = map[k];
      return (v !== undefined ? v : defaultValue) as T;
    },
  } as ConfigService;
}

describe('redis-options.factory', () => {
  describe('bullMqConnectionFromConfig', () => {
    it('uses redis URL when set (cleartext redis:// — no TLS object)', () => {
      const c = mockConfig({
        'redis.url': 'redis://user:pass@redis.example:6379/0',
      });
      expect(bullMqConnectionFromConfig(c)).toEqual({
        url: 'redis://user:pass@redis.example:6379/0',
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });
    });

    it('falls back to host/port and null maxRetriesPerRequest for BullMQ', () => {
      const c = mockConfig({
        'redis.host': '127.0.0.1',
        'redis.port': 6379,
        'redis.password': 'secret',
      });
      const conn = bullMqConnectionFromConfig(c);
      expect(conn).toMatchObject({
        host: '127.0.0.1',
        port: 6379,
        password: 'secret',
        maxRetriesPerRequest: null,
      });
    });

    it('adds tls options for rediss:// URLs', () => {
      const c = mockConfig({
        'redis.url': 'rediss://user:pass@redis.example:6380/0',
        'redis.tlsRejectUnauthorized': 'true',
      });
      const conn = bullMqConnectionFromConfig(c);
      expect(conn).toMatchObject({
        url: 'rediss://user:pass@redis.example:6380/0',
        tls: { rejectUnauthorized: true },
      });
    });
  });

  describe('getStandaloneRedisOptions', () => {
    it('builds Sentinel options without standalone host', () => {
      const c = mockConfig({
        'redis.sentinelHost': '10.0.0.1',
        'redis.sentinelPort': 26379,
        'redis.sentinelMaster': 'mymaster',
        'redis.password': 'abc',
      });
      const opts = getStandaloneRedisOptions(c);
      expect(opts).toMatchObject({
        sentinels: [{ host: '10.0.0.1', port: 26379 }],
        name: 'mymaster',
        password: 'abc',
        maxRetriesPerRequest: null,
      });
      expect((opts as { host?: string }).host).toBeUndefined();
    });
  });
});
