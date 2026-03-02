import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processJob } from '../processor.js';
import { StravaRateLimitError } from '@web-runner/strava';

vi.mock('../jobs/full-history-import.js', () => ({
  handleFullHistoryImport: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../jobs/activity-import.js', () => ({
  handleActivityImport: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../jobs/activity-streams.js', () => ({
  handleActivityStreams: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../jobs/webhook-event.js', () => ({
  handleWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

function createMockDeps() {
  const rateLimiter = {
    check: vi.fn().mockResolvedValue({ allowed: true, delayMs: 0, shortTerm: 0, daily: 0 }),
    updateFromHeaders: vi.fn().mockResolvedValue(undefined),
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: {} as any, queue: {} as any, rateLimiter, logger } as any;
}

describe('processJob', () => {
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
    vi.clearAllMocks();
  });

  it('dispatches full-history-import jobs', async () => {
    const { handleFullHistoryImport } = await import('../jobs/full-history-import.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = { data: { type: 'full-history-import', userId: 1 } } as any;
    await processJob(job, deps);
    expect(handleFullHistoryImport).toHaveBeenCalledWith(job, deps);
  });

  it('dispatches activity-import jobs', async () => {
    const { handleActivityImport } = await import('../jobs/activity-import.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = { data: { type: 'activity-import', userId: 1, activityId: 123 } } as any;
    await processJob(job, deps);
    expect(handleActivityImport).toHaveBeenCalledWith(job, deps);
  });

  it('dispatches activity-streams jobs', async () => {
    const { handleActivityStreams } = await import('../jobs/activity-streams.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = { data: { type: 'activity-streams', userId: 1, activityId: 123 } } as any;
    await processJob(job, deps);
    expect(handleActivityStreams).toHaveBeenCalledWith(job, deps);
  });

  it('dispatches webhook-event jobs', async () => {
    const { handleWebhookEvent } = await import('../jobs/webhook-event.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = { data: { type: 'webhook-event', event: {} } } as any;
    await processJob(job, deps);
    expect(handleWebhookEvent).toHaveBeenCalledWith(job, deps);
  });

  it('warns on unknown job type', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = { data: { type: 'unknown' } } as any;
    await processJob(job, deps);
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it('handles StravaRateLimitError by delaying and throwing DelayedError', async () => {
    const { DelayedError } = await import('bullmq');
    const { handleFullHistoryImport } = await import('../jobs/full-history-import.js');
    const error = new StravaRateLimitError(
      { shortTerm: 200, daily: 500 },
      { shortTerm: 200, daily: 2000 },
    );
    vi.mocked(handleFullHistoryImport).mockRejectedValueOnce(error);

    const moveToDelayed = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = { data: { type: 'full-history-import', userId: 1 }, moveToDelayed } as any;

    await expect(processJob(job, deps)).rejects.toThrow(DelayedError);
    expect(deps.rateLimiter.updateFromHeaders).toHaveBeenCalled();
    expect(moveToDelayed).toHaveBeenCalled();
  });
});
