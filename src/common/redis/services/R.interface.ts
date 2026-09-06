// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CacheSetOptions {
    ttl?: number;         // seconds
    tags?: string[];      // for tag-based invalidation
    jitter?: boolean;     // TTL jitter to prevent avalanche
}

export interface MSetEntry {
    key: string;
    value: unknown;
    ttl: number;
    tags?: string[];
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetInSeconds: number;
}