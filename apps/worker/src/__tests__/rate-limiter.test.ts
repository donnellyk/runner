import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StravaRateLimiter } from '../rate-limiter.js';

function createMockRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();

  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, val: string | number) => {
      store.set(key, String(val));
      return Promise.resolve('OK');
    }),
    incr: vi.fn((key: string) => {
      const current = Number(store.get(key) || 0) + 1;
      store.set(key, String(current));
      return Promise.resolve(current);
    }),
    ttl: vi.fn((key: string) => Promise.resolve(ttls.get(key) ?? -1)),
    expire: vi.fn((key: string, seconds: number) => {
      ttls.set(key, seconds);
      return Promise.resolve(1);
    }),
    pipeline: vi.fn(() => {
      const cmds: Array<() => void> = [];
      const pipe = {
        incr: vi.fn((key: string) => { cmds.push(() => { const c = Number(store.get(key) || 0) + 1; store.set(key, String(c)); }); return pipe; }),
        set: vi.fn((key: string, val: string | number) => { cmds.push(() => store.set(key, String(val))); return pipe; }),
        expire: vi.fn((key: string, seconds: number) => { cmds.push(() => ttls.set(key, seconds)); return pipe; }),
        exec: vi.fn(async () => { cmds.forEach((c) => c()); return []; }),
      };
      return pipe;
    }),
    _store: store,
    _ttls: ttls,
  };
}

describe('StravaRateLimiter', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let limiter: StravaRateLimiter;

  beforeEach(() => {
    redis = createMockRedis();
    limiter = new StravaRateLimiter(redis as never);
  });

  describe('check', () => {
    it('allows requests when under limits', async () => {
      const state = await limiter.check();
      expect(state.allowed).toBe(true);
      expect(state.delayMs).toBe(0);
    });

    it('blocks when 15-min limit approached', async () => {
      redis._store.set('strava:ratelimit:15min', '195');
      redis._ttls.set('strava:ratelimit:15min', 600);

      const state = await limiter.check();
      expect(state.allowed).toBe(false);
      expect(state.delayMs).toBeGreaterThan(0);
    });

    it('blocks when daily limit approached', async () => {
      redis._store.set('strava:ratelimit:daily', '1995');

      const state = await limiter.check();
      expect(state.allowed).toBe(false);
      expect(state.delayMs).toBeGreaterThan(0);
    });

    it('returns current counters', async () => {
      redis._store.set('strava:ratelimit:15min', '50');
      redis._store.set('strava:ratelimit:daily', '500');

      const state = await limiter.check();
      expect(state.shortTerm).toBe(50);
      expect(state.daily).toBe(500);
    });
  });

  describe('increment', () => {
    it('increments both counters', async () => {
      await limiter.increment();

      expect(redis._store.get('strava:ratelimit:15min')).toBe('1');
      expect(redis._store.get('strava:ratelimit:daily')).toBe('1');
    });
  });

  describe('updateFromHeaders', () => {
    it('sets counters from header values', async () => {
      await limiter.updateFromHeaders({ shortTerm: 42, daily: 300 });

      expect(redis._store.get('strava:ratelimit:15min')).toBe('42');
      expect(redis._store.get('strava:ratelimit:daily')).toBe('300');
    });
  });
});
