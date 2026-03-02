import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebhookEvent } from '../jobs/webhook-event.js';
import { JobPriority } from '@web-runner/shared';

function createMockDeps() {
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ id: 1 }]),
    delete: vi.fn().mockReturnThis(),
  };
  const queue = {
    add: vi.fn().mockResolvedValue({}),
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db, queue, logger } as any;
}

function createJob(event: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: { type: 'webhook-event', event } } as any;
}

describe('handleWebhookEvent', () => {
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('enqueues activity-import for activity:create', async () => {
    await handleWebhookEvent(
      createJob({
        object_type: 'activity',
        aspect_type: 'create',
        object_id: 12345,
        owner_id: 67890,
      }),
      deps,
    );

    expect(deps.queue.add).toHaveBeenCalledWith(
      'activity-import',
      expect.objectContaining({ type: 'activity-import', activityId: 12345 }),
      expect.objectContaining({ priority: JobPriority.activityImport }),
    );
  });

  it('enqueues activity-import for activity:update', async () => {
    await handleWebhookEvent(
      createJob({
        object_type: 'activity',
        aspect_type: 'update',
        object_id: 12345,
        owner_id: 67890,
      }),
      deps,
    );

    expect(deps.queue.add).toHaveBeenCalledWith(
      'activity-import',
      expect.objectContaining({ type: 'activity-import' }),
      expect.any(Object),
    );
  });

  it('deletes activity for activity:delete', async () => {
    await handleWebhookEvent(
      createJob({
        object_type: 'activity',
        aspect_type: 'delete',
        object_id: 12345,
        owner_id: 67890,
      }),
      deps,
    );

    expect(deps.db.delete).toHaveBeenCalled();
  });

  it('warns on unknown athlete', async () => {
    deps.db.where = vi.fn().mockResolvedValue([]);

    await handleWebhookEvent(
      createJob({
        object_type: 'activity',
        aspect_type: 'create',
        object_id: 12345,
        owner_id: 99999,
      }),
      deps,
    );

    expect(deps.logger.warn).toHaveBeenCalled();
    expect(deps.queue.add).not.toHaveBeenCalled();
  });
});
