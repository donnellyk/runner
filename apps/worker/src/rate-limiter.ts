import type { Redis } from 'ioredis';

const KEY_15MIN = 'strava:ratelimit:15min';
const KEY_DAILY = 'strava:ratelimit:daily';
const LIMIT_15MIN = 200;
const LIMIT_DAILY = 2000;
const SAFETY_MARGIN = 10;
const TTL_15MIN = 15 * 60;

export interface RateLimitState {
  shortTerm: number;
  daily: number;
  allowed: boolean;
  delayMs: number;
}

export class StravaRateLimiter {
  constructor(private redis: Redis) {}

  async check(): Promise<RateLimitState> {
    const [shortTerm, daily] = await Promise.all([
      this.redis.get(KEY_15MIN).then((v) => Number(v) || 0),
      this.redis.get(KEY_DAILY).then((v) => Number(v) || 0),
    ]);

    if (daily >= LIMIT_DAILY - SAFETY_MARGIN) {
      const msUntilMidnight = this.msUntilMidnightUTC();
      return { shortTerm, daily, allowed: false, delayMs: msUntilMidnight };
    }

    if (shortTerm >= LIMIT_15MIN - SAFETY_MARGIN) {
      const ttl = await this.redis.ttl(KEY_15MIN);
      const delayMs = ttl > 0 ? ttl * 1000 : TTL_15MIN * 1000;
      return { shortTerm, daily, allowed: false, delayMs };
    }

    return { shortTerm, daily, allowed: true, delayMs: 0 };
  }

  async increment(): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.incr(KEY_15MIN);
    pipeline.expire(KEY_15MIN, TTL_15MIN, 'NX');
    pipeline.incr(KEY_DAILY);
    pipeline.expire(KEY_DAILY, this.secondsUntilMidnightUTC(), 'NX');
    await pipeline.exec();
  }

  async updateFromHeaders(usage: { shortTerm: number; daily: number }): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.set(KEY_15MIN, usage.shortTerm, 'EX', TTL_15MIN);
    pipeline.set(KEY_DAILY, usage.daily, 'EX', this.secondsUntilMidnightUTC());
    await pipeline.exec();
  }

  private msUntilMidnightUTC(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCDate(midnight.getUTCDate() + 1);
    midnight.setUTCHours(0, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  private secondsUntilMidnightUTC(): number {
    return Math.ceil(this.msUntilMidnightUTC() / 1000);
  }
}
