import { getQueue } from '$lib/server/queue';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const queue = getQueue();

	// Check for an active or waiting bulk-import job for this user
	const jobs = await queue.getJobs(['active', 'waiting', 'delayed']);
	const activeJob = jobs.find(
		(j) => j.data?.type === 'bulk-import' && j.data?.userId === userId && !j.data?.cancelled,
	);

	if (activeJob) {
		const progress = typeof activeJob.progress === 'object' ? activeJob.progress : null;
		return { activeJobId: activeJob.id, progress };
	}

	return { activeJobId: null, progress: null };
};
