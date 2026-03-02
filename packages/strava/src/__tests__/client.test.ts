import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StravaClient } from '../client.js';
import { StravaApiError, StravaRateLimitError } from '../errors.js';

function mockFetch(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({
      'x-ratelimit-limit': '200,2000',
      'x-ratelimit-usage': '10,100',
      ...headers,
    }),
    json: () => Promise.resolve(body),
  });
}

describe('StravaClient', () => {
  let client: StravaClient;

  beforeEach(() => {
    client = new StravaClient('https://strava.test/api/v3');
  });

  describe('listActivities', () => {
    it('constructs correct URL with pagination params', async () => {
      const fetchSpy = mockFetch([]);
      vi.stubGlobal('fetch', fetchSpy);

      await client.listActivities('tok', { before: 1000, after: 500, page: 2, perPage: 50 });

      const url = new URL(fetchSpy.mock.calls[0][0]);
      expect(url.pathname).toBe('/api/v3/athlete/activities');
      expect(url.searchParams.get('before')).toBe('1000');
      expect(url.searchParams.get('after')).toBe('500');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('per_page')).toBe('50');
    });

    it('defaults perPage to 200', async () => {
      const fetchSpy = mockFetch([]);
      vi.stubGlobal('fetch', fetchSpy);

      await client.listActivities('tok');

      const url = new URL(fetchSpy.mock.calls[0][0]);
      expect(url.searchParams.get('per_page')).toBe('200');
    });

    it('passes authorization header', async () => {
      const fetchSpy = mockFetch([]);
      vi.stubGlobal('fetch', fetchSpy);

      await client.listActivities('my-token');

      expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer my-token');
    });

    it('returns data and rateLimit info', async () => {
      const activities = [{ id: 1, name: 'Run' }];
      vi.stubGlobal('fetch', mockFetch(activities, 200, {
        'x-ratelimit-usage': '5,50',
        'x-ratelimit-limit': '200,2000',
      }));

      const result = await client.listActivities('tok');
      expect(result.data).toEqual(activities);
      expect(result.rateLimit.usage).toEqual({ shortTerm: 5, daily: 50 });
      expect(result.rateLimit.limits).toEqual({ shortTerm: 200, daily: 2000 });
    });
  });

  describe('getActivity', () => {
    it('fetches activity by id', async () => {
      const activity = { id: 123, name: 'Morning Run' };
      vi.stubGlobal('fetch', mockFetch(activity));

      const result = await client.getActivity('tok', 123);
      expect(result.data).toEqual(activity);
    });
  });

  describe('getActivityStreams', () => {
    it('passes stream keys as comma-separated query param', async () => {
      const fetchSpy = mockFetch([]);
      vi.stubGlobal('fetch', fetchSpy);

      await client.getActivityStreams('tok', 1, ['heartrate', 'time']);

      const url = new URL(fetchSpy.mock.calls[0][0]);
      expect(url.searchParams.get('keys')).toBe('heartrate,time');
      expect(url.searchParams.get('key_by_type')).toBe('true');
    });
  });

  describe('getActivityLaps', () => {
    it('fetches laps for an activity', async () => {
      const laps = [{ id: 1, lap_index: 0 }];
      vi.stubGlobal('fetch', mockFetch(laps));

      const result = await client.getActivityLaps('tok', 123);
      expect(result.data).toEqual(laps);
    });
  });

  describe('error handling', () => {
    it('throws StravaRateLimitError on 429', async () => {
      vi.stubGlobal('fetch', mockFetch({}, 429, {
        'x-ratelimit-usage': '200,1500',
        'x-ratelimit-limit': '200,2000',
      }));

      await expect(client.listActivities('tok'))
        .rejects.toThrow(StravaRateLimitError);
    });

    it('throws StravaApiError on non-ok responses', async () => {
      vi.stubGlobal('fetch', mockFetch({}, 500));

      await expect(client.getActivity('tok', 1))
        .rejects.toThrow(StravaApiError);
    });

    it('includes status in StravaApiError', async () => {
      vi.stubGlobal('fetch', mockFetch({}, 404));

      try {
        await client.getActivity('tok', 1);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(StravaApiError);
        expect((err as StravaApiError).status).toBe(404);
      }
    });
  });
});
