import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { Cluster, RedisOptions, ClusterOptions } from 'ioredis';
import { LRUCache } from 'lru-cache';
import { CacheSetOptions, MSetEntry, RateLimitResult } from './R.interface';
import { getStandaloneRedisOptions } from '../redis-options.factory';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));



// ─────────────────────────────────────────────
// RedisService
// ─────────────────────────────────────────────

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private redis!: Redis | Cluster;
  private readonly prefix: string;
  private readonly useCluster: boolean;

  // L1 — In-process LRU (hot-key shield)
  private readonly localCache: LRUCache<string, any>;

  // Active stampede-prevention locks
  private readonly lockMap = new Map<string, Promise<unknown>>();

  constructor(private readonly configService: ConfigService) {
    this.prefix = this.configService.get<string>('redis.prefix', 'myapp');
    this.useCluster = this.configService.get<boolean>('redis.cluster', false);

    this.localCache = new LRUCache<string, any>({
      max: this.configService.get<number>('redis.localCacheMax', 1000),
      ttl: this.configService.get<number>('redis.localCacheTtlMs', 5_000),
    });
  }

  // ─────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────

  onModuleInit(): void {
    this.useCluster ? this.initCluster() : this.initStandalone();
    this.registerEvents();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis connection closed gracefully');
    }
  }

  // ─────────────────────────────────────────────
  // Init helpers
  // ─────────────────────────────────────────────

  private redisRetryStrategy(): (times: number) => number | null {
    return (times: number) => {
      if (times > 10) {
        this.logger.error(`Redis: max retries (${times}) reached — giving up`);
        return null;
      }
      const delay = Math.min(2 ** times * 100, 5_000);
      this.logger.warn(`Redis: retry #${times} in ${delay}ms`);
      return delay;
    };
  }

  /**
   * Standalone ioredis client (cache, rate limit, etc.).
   * Uses redis.url when set (Docker / managed Redis); otherwise host/port from config.
   */
  private openStandaloneRedis(): Redis {
    const url = this.configService.get<string>('redis.url')?.trim();
    const connectTimeout = this.configService.get<number>(
      'redis.connectTimeoutMs',
      10_000,
    );
    const retryStrategy = this.redisRetryStrategy();
    if (url) {
      return new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        connectTimeout,
        retryStrategy,
      });
    }
    const base = getStandaloneRedisOptions(this.configService);
    return new Redis({
      ...base,
      retryStrategy,
    });
  }

  private initStandalone(): void {
    this.redis = this.openStandaloneRedis();
  }

  private initCluster(): void {
    const raw = this.configService.get<string>('redis.clusterNodes', '');
    const nodes = raw
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const [host, port] = n.split(':');
        return { host, port: Number(port) || 6379 };
      });

    if (!nodes.length) {
      throw new Error(
        'redis.cluster is true but redis.clusterNodes is empty — set REDIS_CLUSTER_NODES (e.g. host1:6379,host2:6379)',
      );
    }

    const options: ClusterOptions = {
      redisOptions: {
        password: this.configService.get<string>('redis.password'),
        maxRetriesPerRequest: null,
      },
      clusterRetryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(2 ** times * 100, 5_000);
      },
    };

    this.redis = new Cluster(nodes, options);
  }

  private registerEvents(): void {
    this.redis.on('connect', () => this.logger.log('Redis: connected ✅'));
    this.redis.on('ready', () => this.logger.log('Redis: ready ✅'));
    this.redis.on('error', (err) => this.logger.error('Redis error ❌', err.message));
    this.redis.on('close', () => this.logger.warn('Redis: connection closed'));
    this.redis.on('reconnecting', () => this.logger.warn('Redis: reconnecting…'));
    this.redis.on('end', () => this.logger.warn('Redis: connection ended'));
  }

  // ─────────────────────────────────────────────
  // Key helpers
  // ─────────────────────────────────────────────

  /**
   * Cluster-safe key: hash tag {prefix} keeps related keys on same slot.
   */
  private buildKey(key: string): string {
    return this.useCluster
      ? `{${this.prefix}}:${key}`
      : `${this.prefix}:${key}`;
  }

  private tagKey(tag: string): string {
    return this.buildKey(`tag:${tag}`);
  }

  private lockKey(key: string): string {
    return this.buildKey(`lock:${key}`);
  }

  // ─────────────────────────────────────────────
  // Serialisation
  // ─────────────────────────────────────────────

  private serialize(value: unknown): string {
    if (value === undefined) throw new Error('Cannot store undefined in Redis');
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  private deserialize<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  // ─────────────────────────────────────────────
  // TTL Jitter — prevents Cache Avalanche
  // ─────────────────────────────────────────────

  private applyJitter(ttl: number): number {
    // ±20% random jitter
    const variance = Math.floor(ttl * 0.2);
    return ttl + Math.floor(Math.random() * variance * 2) - variance;
  }

  // ─────────────────────────────────────────────
  // Core — SET / GET / DEL
  // ─────────────────────────────────────────────

  async set(key: string, value: unknown, options: CacheSetOptions = {}): Promise<void> {
    const { ttl, tags = [], jitter = false } = options;
    const k = this.buildKey(key);
    const d = this.serialize(value);
    const finalTtl = ttl ? (jitter ? this.applyJitter(ttl) : ttl) : undefined;

    const pipeline = (this.redis as Redis).pipeline();

    if (finalTtl) {
      pipeline.set(k, d, 'EX', finalTtl);
    } else {
      pipeline.set(k, d);
    }

    // Register this key under each tag (for invalidation)
    for (const tag of tags) {
      pipeline.sadd(this.tagKey(tag), key);
    }

    await pipeline.exec();

    // Invalidate local cache on write
    this.localCache.delete(k);
  }

  async get<T>(key: string): Promise<T | null> {
    const k = this.buildKey(key);

    // L1: local in-process cache
    const local = this.localCache.get(k);
    if (local !== undefined) return local as T;

    // L2: Redis
    const raw = await this.redis.get(k);
    if (raw === null) return null;

    const value = this.deserialize<T>(raw);
    this.localCache.set(k, value);
    return value;
  }

  async del(key: string): Promise<boolean> {
    const k = this.buildKey(key);
    this.localCache.delete(k);
    return (await this.redis.del(k)) > 0;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(this.buildKey(key))) === 1;
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.redis.expire(this.buildKey(key), ttl);
  }

  async ttl(key: string): Promise<number> {
    return this.redis.ttl(this.buildKey(key));
  }

  // ─────────────────────────────────────────────
  // Anti Cache Stampede — getOrSet with Mutex
  // ─────────────────────────────────────────────

  /**
   * Only ONE concurrent fetcher runs per key.
   * All other callers wait and get the same result — zero stampede.
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheSetOptions & { ttl: number },
  ): Promise<T> {
    // Fast path — cache hit
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // Deduplication via in-process promise map (same pod)
    if (this.lockMap.has(key)) {
      return this.lockMap.get(key) as Promise<T>;
    }

    // Distributed Redis lock (cross-pod)
    let lockAcquired = await this.acquireLock(key);
    if (!lockAcquired) {
      const maxWaitMs = this.configService.get<number>(
        'redis.lockAcquireMaxWaitMs',
        2_000,
      );
      const stepMs = 50;
      for (let waited = 0; !lockAcquired && waited < maxWaitMs; waited += stepMs) {
        const again = await this.get<T>(key);
        if (again !== null) return again;
        await sleep(stepMs);
        lockAcquired = await this.acquireLock(key);
      }
    }

    const work = (async (): Promise<T> => {
      try {
        const recheck = await this.get<T>(key);
        if (recheck !== null) return recheck;

        const fresh = await fetcher();
        await this.set(key, fresh, options);
        return fresh;
      } finally {
        if (lockAcquired) await this.releaseLock(key);
        this.lockMap.delete(key);
      }
    })();

    this.lockMap.set(key, work);
    return work;
  }

  // ─────────────────────────────────────────────
  // Distributed Lock (Redis SET NX)
  // ─────────────────────────────────────────────

  async acquireLock(key: string, ttlSeconds = 10): Promise<boolean> {
    const result = await this.redis.set(
      this.lockKey(key),
      '1',
      'EX', ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.redis.del(this.lockKey(key));
  }

  // ─────────────────────────────────────────────
  // Tag-based Invalidation
  // ─────────────────────────────────────────────

  async invalidateTag(tag: string): Promise<void> {
    const tk = this.tagKey(tag);
    const keys = await (this.redis as Redis).smembers(tk);

    if (!keys.length) return;

    const pipeline = (this.redis as Redis).pipeline();
    keys.forEach((k) => {
      pipeline.del(this.buildKey(k));
      this.localCache.delete(this.buildKey(k));
    });
    pipeline.del(tk);

    await pipeline.exec();
    this.logger.log(`Tag [${tag}] invalidated — ${keys.length} keys removed`);
  }

  async invalidateTags(tags: string[]): Promise<void> {
    await Promise.all(tags.map((t) => this.invalidateTag(t)));
  }

  // ─────────────────────────────────────────────
  // Pipeline Batch — mGet / mSet
  // ─────────────────────────────────────────────

  async mGet<T>(keys: string[]): Promise<(T | null)[]> {
    if (!keys.length) return [];

    const builtKeys = keys.map((k) => this.buildKey(k));

    // L1 hit check first
    const results: (T | null)[] = new Array(keys.length).fill(null);
    const missIndexes: number[] = [];

    builtKeys.forEach((bk, i) => {
      const local = this.localCache.get(bk);
      if (local !== undefined) {
        results[i] = local as T;
      } else {
        missIndexes.push(i);
      }
    });

    if (!missIndexes.length) return results;

    // Pipeline fetch misses from Redis
    const pipeline = (this.redis as Redis).pipeline();
    missIndexes.forEach((i) => pipeline.get(builtKeys[i]));
    const redisResults = await pipeline.exec();

    redisResults!.forEach(([err, val], idx) => {
      const i = missIndexes[idx];
      if (!err && val !== null) {
        const parsed = this.deserialize<T>(val as string);
        results[i] = parsed;
        this.localCache.set(builtKeys[i], parsed);
      }
    });

    return results;
  }

  async mSet(entries: MSetEntry[]): Promise<void> {
    if (!entries.length) return;

    const pipeline = (this.redis as Redis).pipeline();

    for (const { key, value, ttl, tags = [] } of entries) {
      const k = this.buildKey(key);
      const d = this.serialize(value);
      const finalTtl = this.applyJitter(ttl);

      pipeline.set(k, d, 'EX', finalTtl);
      this.localCache.delete(k);

      for (const tag of tags) {
        pipeline.sadd(this.tagKey(tag), key);
      }
    }

    await pipeline.exec();
  }

  async mDel(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const pipeline = (this.redis as Redis).pipeline();
    keys.forEach((k) => {
      const bk = this.buildKey(k);
      pipeline.del(bk);
      this.localCache.delete(bk);
    });
    await pipeline.exec();
  }

  // ─────────────────────────────────────────────
  // Hash Operations
  // ─────────────────────────────────────────────

  async hSet(hash: string, field: string, value: unknown): Promise<void> {
    await this.redis.hset(this.buildKey(hash), field, this.serialize(value));
  }

  async hGet<T>(hash: string, field: string): Promise<T | null> {
    const v = await this.redis.hget(this.buildKey(hash), field);
    return v === null ? null : this.deserialize<T>(v);
  }

  async hGetAll<T extends Record<string, unknown>>(hash: string): Promise<T | null> {
    const raw = await this.redis.hgetall(this.buildKey(hash));
    if (!raw || Object.keys(raw).length === 0) return null;

    const result = {} as Record<string, unknown>;
    for (const [field, val] of Object.entries(raw)) {
      result[field] = this.deserialize(val);
    }
    return result as T;
  }

  async hDel(hash: string, ...fields: string[]): Promise<number> {
    return this.redis.hdel(this.buildKey(hash), ...fields);
  }

  async hExists(hash: string, field: string): Promise<boolean> {
    return (await this.redis.hexists(this.buildKey(hash), field)) === 1;
  }

  // ─────────────────────────────────────────────
  // Sorted Set (Leaderboards, Priority Queues)
  // ─────────────────────────────────────────────

  async zAdd(key: string, score: number, member: string): Promise<void> {
    await this.redis.zadd(this.buildKey(key), score, member);
  }

  async zRange(key: string, start: number, stop: number): Promise<string[]> {
    return this.redis.zrange(this.buildKey(key), start, stop);
  }

  async zRangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<{ member: string; score: number }[]> {
    const raw = await this.redis.zrange(this.buildKey(key), start, stop, 'WITHSCORES');
    const result: { member: string; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({ member: raw[i], score: parseFloat(raw[i + 1]) });
    }
    return result;
  }

  async zRank(key: string, member: string): Promise<number | null> {
    return this.redis.zrank(this.buildKey(key), member);
  }

  async zScore(key: string, member: string): Promise<number | null> {
    const s = await this.redis.zscore(this.buildKey(key), member);
    return s === null ? null : parseFloat(s);
  }

  // ─────────────────────────────────────────────
  // Rate Limiting — Sliding Window (Lua atomic)
  // ─────────────────────────────────────────────

  /**
   * Sliding window rate limiter using a Lua script.
   * Atomic — safe for distributed environments.
   */
  async rateLimit(
    identifier: string,     // e.g. userId or IP
    limit: number,          // max requests
    windowSeconds: number,  // window size
  ): Promise<RateLimitResult> {
    const key = this.buildKey(`rl:${identifier}`);
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const randomSeed = Math.random().toString(36).substring(2, 10);

    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local unique_member = ARGV[1] .. '-' .. ARGV[4]
      local clearBefore = now - window

      redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)
      local count = redis.call('ZCARD', key)

      if count < limit then
        redis.call('ZADD', key, now, unique_member)
        redis.call('PEXPIRE', key, window)
        return {1, limit - count - 1, 0}
      else
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local resetIn = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
        return {0, 0, resetIn}
      end
    `;

    const result = await (this.redis as Redis).eval(
      luaScript, 1, key,
      now.toString(),
      windowMs.toString(),
      limit.toString(),
      randomSeed
    ) as [number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetInSeconds: result[2],
    };
  }

  // ─────────────────────────────────────────────
  // Counter (Atomic Increment)
  // ─────────────────────────────────────────────

  async increment(key: string, by = 1): Promise<number> {
    return this.redis.incrby(this.buildKey(key), by);
  }

  async decrement(key: string, by = 1): Promise<number> {
    return this.redis.decrby(this.buildKey(key), by);
  }

  // ─────────────────────────────────────────────
  // Pub / Sub helpers
  // ─────────────────────────────────────────────

  /**
   * Pub/Sub requires a SEPARATE Redis connection — never reuse the main client.
   * This returns a dedicated subscriber instance.
   */
  createSubscriber(): Redis {
    if (this.useCluster) {
      this.logger.warn(
        'createSubscriber: cluster mode — returning standalone options; use a dedicated replica URL for subscribers in production',
      );
    }
    return this.openStandaloneRedis();
  }

  async publish(channel: string, message: unknown): Promise<number> {
    return this.redis.publish(
      `${this.prefix}:${channel}`,
      this.serialize(message),
    );
  }

  // ─────────────────────────────────────────────
  // Health Check
  // ─────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async info(): Promise<string> {
    return (this.redis as Redis).info();
  }

  // ─────────────────────────────────────────────
  // Token Bucket Rate Limiter
  // ─────────────────────────────────────────────
  async tokenBucket(
    key: string,
    capacity: number,
    refillRatePerSecond: number,
  ): Promise<{ hasTokens: boolean }> {
    const redisKey = this.buildKey(`tb:${key}`);
    const now = Date.now();

    const luaScript = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])

      local data = redis.call('HMGET', key, 'tokens', 'last_refilled')
      local tokens = tonumber(data[1])
      local last_refilled = tonumber(data[2])

      if not tokens then
        tokens = capacity
        last_refilled = now
      else
        local elapsed = (now - last_refilled) / 1000
        tokens = math.min(capacity, tokens + elapsed * refill_rate)
        last_refilled = now
      end

      if tokens >= 1 then
        tokens = tokens - 1
        redis.call('HMSET', key, 'tokens', tokens, 'last_refilled', last_refilled)
        redis.call('EXPIRE', key, math.ceil(capacity / refill_rate))
        return 1
      else
        redis.call('HMSET', key, 'tokens', tokens, 'last_refilled', last_refilled)
        redis.call('EXPIRE', key, math.ceil(capacity / refill_rate))
        return 0
      end
    `;

    const result = await (this.redis as Redis).eval(
      luaScript,
      1,
      redisKey,
      capacity.toString(),
      refillRatePerSecond.toString(),
      now.toString(),
    );

    return { hasTokens: result === 1 };
  }

  // ─────────────────────────────────────────────
  // Expose raw client (escape hatch — use sparingly)
  // ─────────────────────────────────────────────

  getClient(): Redis | Cluster {
    if (!this.redis) throw new Error('Redis not initialised yet');
    return this.redis;
  }
}