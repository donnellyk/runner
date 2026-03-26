import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireApiUser } from '$lib/server/validation';
import { getBulkImportQueue } from '$lib/server/queue';

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = requireApiUser(locals);
	const jobId = url.searchParams.get('jobId');
	if (!jobId) return json({ error: 'Missing jobId' }, { status: 400 });

	const queue = getBulkImportQueue();
	const job = await queue.getJob(jobId);

	if (!job || job.data?.userId !== user.id) {
		return json({ status: 'not_found' });
	}

	const state = await job.getState();
	const progress = job.progress as { current?: number; total?: number; imported?: number; skipped?: number; failed?: number } | number;

	const cancelled = job.data?.cancelled === true;

	return json({
		status: cancelled && state === 'completed' ? 'cancelled' : state,
		progress: typeof progress === 'object' ? progress : null,
	});
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
	const user = requireApiUser(locals);
	const jobId = url.searchParams.get('jobId');
	if (!jobId) return json({ error: 'Missing jobId' }, { status: 400 });

	const queue = getBulkImportQueue();
	const job = await queue.getJob(jobId);

	if (!job || job.data?.userId !== user.id) {
		return json({ error: 'Job not found' }, { status: 404 });
	}

	const state = await job.getState();
	if (state === 'active') {
		// Signal cancellation via job data — the worker checks this each iteration
		await job.updateData({ ...job.data, cancelled: true });
	} else if (state === 'waiting' || state === 'delayed') {
		await job.remove();
	}

	return json({ ok: true });
};
