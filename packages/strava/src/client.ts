import type { SummaryActivity, DetailedActivity, StreamSet, StreamKey, Lap } from './types.js';
import { StravaApiError, StravaRateLimitError } from './errors.js';

export interface RateLimitInfo {
  usage: { shortTerm: number; daily: number };
  limits: { shortTerm: number; daily: number };
}

export class StravaClient {
  constructor(private baseUrl = 'https://www.strava.com/api/v3') {}

  private async request<T>(token: string, path: string, params?: Record<string, string>): Promise<{ data: T; rateLimit: RateLimitInfo }> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const rateLimit = this.parseRateLimitHeaders(res.headers);

    if (res.status === 429) {
      throw new StravaRateLimitError(rateLimit.usage, rateLimit.limits);
    }

    if (!res.ok) {
      throw new StravaApiError(res.status, res.statusText);
    }

    const data = (await res.json()) as T;
    return { data, rateLimit };
  }

  private parseRateLimitHeaders(headers: Headers): RateLimitInfo {
    const limitHeader = headers.get('x-ratelimit-limit') ?? '200,2000';
    const usageHeader = headers.get('x-ratelimit-usage') ?? '0,0';
    const [shortTermLimit, dailyLimit] = limitHeader.split(',').map(Number);
    const [shortTermUsage, dailyUsage] = usageHeader.split(',').map(Number);
    return {
      usage: { shortTerm: shortTermUsage, daily: dailyUsage },
      limits: { shortTerm: shortTermLimit, daily: dailyLimit },
    };
  }

  async listActivities(
    token: string,
    opts: { before?: number; after?: number; page?: number; perPage?: number } = {},
  ): Promise<{ data: SummaryActivity[]; rateLimit: RateLimitInfo }> {
    const params: Record<string, string> = {};
    if (opts.before) params.before = String(opts.before);
    if (opts.after) params.after = String(opts.after);
    if (opts.page) params.page = String(opts.page);
    params.per_page = String(opts.perPage ?? 200);
    return this.request<SummaryActivity[]>(token, '/athlete/activities', params);
  }

  async getActivity(
    token: string,
    id: number,
  ): Promise<{ data: DetailedActivity; rateLimit: RateLimitInfo }> {
    return this.request<DetailedActivity>(token, `/activities/${id}`);
  }

  async getActivityStreams(
    token: string,
    id: number,
    keys: StreamKey[],
  ): Promise<{ data: StreamSet; rateLimit: RateLimitInfo }> {
    return this.request<StreamSet>(token, `/activities/${id}/streams`, {
      keys: keys.join(','),
      key_by_type: 'true',
    });
  }

  async getActivityLaps(
    token: string,
    id: number,
  ): Promise<{ data: Lap[]; rateLimit: RateLimitInfo }> {
    return this.request<Lap[]>(token, `/activities/${id}/laps`);
  }
}
