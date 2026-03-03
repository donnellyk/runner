import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobPriority } from '@web-runner/shared';

vi.mock('@web-runner/db/client', () => ({
	getDb: vi.fn(),
}));

vi.mock('$lib/server/queue', () => ({
	getQueue: vi.fn(),
}));

vi.mock('$lib/server/admin-queries', () => ({
	getUserOptions: vi.fn().mockResolvedValue([]),
}));

describe('admin guard', () => {
	it('redirects non-admin users', async () => {
		const { load } = await import(
			'../../../routes/(protected)/admin/+layout.server.js'
		);

		const locals = { user: { id: 1, isAdmin: false }, session: {} };
		await expect(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			load({ locals } as any),
		).rejects.toThrow();
	});

	it('allows admin users', async () => {
		const { load } = await import(
			'../../../routes/(protected)/admin/+layout.server.js'
		);

		const locals = { user: { id: 1, isAdmin: true }, session: {} };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await load({ locals } as any);
		expect(result).toBeUndefined();
	});

	it('redirects when user is null', async () => {
		const { load } = await import(
			'../../../routes/(protected)/admin/+layout.server.js'
		);

		const locals = { user: null, session: null };
		await expect(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			load({ locals } as any),
		).rejects.toThrow();
	});
});

describe('toggleAdmin action', () => {
	it('rejects non-admin callers', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/users/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '2');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: false }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.toggleAdmin({ request, locals } as any);
		expect(result?.status).toBe(403);
	});

	it('rejects toggling own admin status', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/users/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '1');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.toggleAdmin({ request, locals } as any);
		expect(result?.status).toBe(400);
	});

	it('returns 404 for unknown user', async () => {
		const { getDb } = await import('@web-runner/db/client');
		const mockSelect = vi.fn().mockReturnThis();
		const mockFrom = vi.fn().mockReturnThis();
		const mockWhere = vi.fn().mockResolvedValue([]);
		vi.mocked(getDb).mockReturnValue({
			select: mockSelect,
			from: mockFrom,
			where: mockWhere,
		} as never);

		const { actions } = await import(
			'../../../routes/(protected)/admin/users/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '999');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.toggleAdmin({ request, locals } as any);
		expect(result?.status).toBe(404);
	});
});

describe('queue actions', () => {
	let mockAdd: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		mockAdd = vi.fn().mockResolvedValue(undefined);
		const { getQueue } = await import('$lib/server/queue');
		vi.mocked(getQueue).mockReturnValue({ add: mockAdd } as never);
	});

	it('triggerSync enqueues a full-history-import job', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '1');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await actions.triggerSync({ request, locals } as any);
		expect(mockAdd).toHaveBeenCalledWith(
			'full-history-import',
			{ type: 'full-history-import', userId: 1 },
			{ priority: JobPriority.fullHistoryImport },
		);
	});

	it('triggerSync rejects invalid userId', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', 'abc');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.triggerSync({ request, locals } as any);
		expect(result?.status).toBe(400);
		expect(mockAdd).not.toHaveBeenCalled();
	});

	it('reimport enqueues an activity-import job', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '1');
		formData.set('activityId', '12345');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await actions.reimport({ request, locals } as any);
		expect(mockAdd).toHaveBeenCalledWith(
			'activity-import',
			{ type: 'activity-import', userId: 1, activityId: 12345 },
			{ priority: JobPriority.activityImport },
		);
	});

	it('reimport rejects invalid activityId', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '1');
		formData.set('activityId', 'bad');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.reimport({ request, locals } as any);
		expect(result?.status).toBe(400);
	});

	it('retryFailed rejects non-failed jobs', async () => {
		const mockGetJob = vi.fn().mockResolvedValue({
			getState: vi.fn().mockResolvedValue('completed'),
			retry: vi.fn(),
		});
		const { getQueue } = await import('$lib/server/queue');
		vi.mocked(getQueue).mockReturnValue({ getJob: mockGetJob } as never);

		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('jobId', '123');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.retryFailed({ request, locals } as any);
		expect(result?.status).toBe(400);
	});

	it('retryFailed retries failed jobs', async () => {
		const mockRetry = vi.fn().mockResolvedValue(undefined);
		const mockGetJob = vi.fn().mockResolvedValue({
			getState: vi.fn().mockResolvedValue('failed'),
			retry: mockRetry,
		});
		const { getQueue } = await import('$lib/server/queue');
		vi.mocked(getQueue).mockReturnValue({ getJob: mockGetJob } as never);

		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('jobId', '123');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await actions.retryFailed({ request, locals } as any);
		expect(mockRetry).toHaveBeenCalled();
	});

	it('clean rejects invalid status', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('status', 'active');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.clean({ request, locals } as any);
		expect(result?.status).toBe(400);
	});

	it('clean accepts valid status', async () => {
		const mockClean = vi.fn().mockResolvedValue([]);
		const { getQueue } = await import('$lib/server/queue');
		vi.mocked(getQueue).mockReturnValue({ clean: mockClean } as never);

		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('status', 'completed');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await actions.clean({ request, locals } as any);
		expect(mockClean).toHaveBeenCalledWith(0, 1000, 'completed');
	});

	it('refreshSync rejects non-admin', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '1');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: false }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.refreshSync({ request, locals } as any);
		expect(result?.status).toBe(403);
	});

	it('refreshSync rejects invalid userId', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', 'bad');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.refreshSync({ request, locals } as any);
		expect(result?.status).toBe(400);
		expect(mockAdd).not.toHaveBeenCalled();
	});

	it('refreshSync returns 400 when user has no activities', async () => {
		const mockLimit = vi.fn().mockResolvedValue([]);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		const { getDb } = await import('@web-runner/db/client');
		vi.mocked(getDb).mockReturnValue({ select: mockSelect } as never);

		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '1');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.refreshSync({ request, locals } as any);
		expect(result?.status).toBe(400);
		expect(mockAdd).not.toHaveBeenCalled();
	});

	it('refreshSync enqueues job with after timestamp', async () => {
		const latestDate = new Date('2025-03-01T12:00:00Z');
		const mockLimit = vi.fn().mockResolvedValue([{ startDate: latestDate }]);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		const { getDb } = await import('@web-runner/db/client');
		vi.mocked(getDb).mockReturnValue({ select: mockSelect } as never);

		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '1');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await actions.refreshSync({ request, locals } as any);
		expect(mockAdd).toHaveBeenCalledWith(
			'full-history-import',
			{
				type: 'full-history-import',
				userId: 1,
				after: Math.floor(latestDate.getTime() / 1000),
			},
			{ priority: JobPriority.fullHistoryImport },
		);
	});

	it('rejects non-admin queue actions', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/queues/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '1');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: false }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.triggerSync({ request, locals } as any);
		expect(result?.status).toBe(403);
	});
});

describe('activity actions', () => {
	let mockAdd: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		mockAdd = vi.fn().mockResolvedValue(undefined);
		const { getQueue } = await import('$lib/server/queue');
		vi.mocked(getQueue).mockReturnValue({ add: mockAdd } as never);
	});

	it('requeue rejects non-admin', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/activities/+page.server.js'
		);

		const formData = new FormData();
		formData.set('activityId', '1');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: false }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.requeue({ request, locals } as any);
		expect(result?.status).toBe(403);
	});

	it('requeue rejects invalid activityId', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/activities/+page.server.js'
		);

		const formData = new FormData();
		formData.set('activityId', 'bad');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.requeue({ request, locals } as any);
		expect(result?.status).toBe(400);
	});

	it('requeue returns 404 for missing activity', async () => {
		const mockSelect = vi.fn().mockReturnThis();
		const mockFrom = vi.fn().mockReturnThis();
		const mockWhere = vi.fn().mockResolvedValue([]);
		const { getDb } = await import('@web-runner/db/client');
		vi.mocked(getDb).mockReturnValue({
			select: mockSelect,
			from: mockFrom,
			where: mockWhere,
		} as never);

		const { actions } = await import(
			'../../../routes/(protected)/admin/activities/+page.server.js'
		);

		const formData = new FormData();
		formData.set('activityId', '999');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.requeue({ request, locals } as any);
		expect(result?.status).toBe(404);
	});

	it('fullSync rejects non-admin', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/activities/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '1');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: false }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.fullSync({ request, locals } as any);
		expect(result?.status).toBe(403);
	});

	it('fullSync rejects invalid userId', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/activities/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await actions.fullSync({ request, locals } as any);
		expect(result?.status).toBe(400);
	});

	it('fullSync enqueues job with correct priority', async () => {
		const { actions } = await import(
			'../../../routes/(protected)/admin/activities/+page.server.js'
		);

		const formData = new FormData();
		formData.set('userId', '1');
		const request = new Request('http://test', { method: 'POST', body: formData });
		const locals = { user: { id: 1, isAdmin: true }, session: {} };

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await actions.fullSync({ request, locals } as any);
		expect(mockAdd).toHaveBeenCalledWith(
			'full-history-import',
			{ type: 'full-history-import', userId: 1 },
			{ priority: JobPriority.fullHistoryImport },
		);
	});
});
