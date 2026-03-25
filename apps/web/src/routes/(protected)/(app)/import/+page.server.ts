import { fail } from '@sveltejs/kit';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { getQueue } from '$lib/server/queue';
import { JobPriority } from '@web-runner/shared';
import type { PageServerLoad, Actions } from './$types';

const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

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

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		const userId = locals.user!.id;

		const formData = await request.formData();
		const file = formData.get('file');

		if (!file || !(file instanceof File)) {
			return fail(400, { error: 'No file uploaded' });
		}

		if (file.size > MAX_UPLOAD_SIZE) {
			return fail(400, { error: 'File too large (max 2GB)' });
		}

		if (!file.name.endsWith('.zip')) {
			return fail(400, { error: 'File must be a .zip archive' });
		}

		const uploadDir = join(tmpdir(), 'web-runner-imports', String(userId));
		await mkdir(uploadDir, { recursive: true });

		const filePath = join(uploadDir, `${randomUUID()}.zip`);
		const buffer = Buffer.from(await file.arrayBuffer());
		await writeFile(filePath, buffer);

		const queue = getQueue();
		const job = await queue.add('bulk-import', {
			type: 'bulk-import' as const,
			userId,
			filePath,
		}, { priority: JobPriority.fullHistoryImport });

		return { success: true, jobId: job.id };
	},
};
