import type { RequestHandler } from './$types';
import { requireApiUser } from '$lib/server/validation';
import { getQueue } from '$lib/server/queue';

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = requireApiUser(locals);
	const jobId = url.searchParams.get('jobId');
	if (!jobId) {
		return new Response('Missing jobId', { status: 400 });
	}

	const queue = getQueue();

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			function send(event: string, data: unknown) {
				controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			}

			let lastProgress = '';

			const poll = async () => {
				const job = await queue.getJob(jobId);

				if (!job || job.data?.userId !== user.id) {
					send('error', { message: 'Job not found' });
					controller.close();
					return false;
				}

				const state = await job.getState();
				const cancelled = job.data?.cancelled === true;
				const progress = typeof job.progress === 'object' ? job.progress : null;

				// Only send if progress changed
				const progressKey = JSON.stringify(progress);
				if (progress && progressKey !== lastProgress) {
					lastProgress = progressKey;
					send('progress', progress);
				}

				if (cancelled && (state === 'completed' || state === 'active')) {
					send('cancelled', progress ?? {});
					controller.close();
					return false;
				}

				if (state === 'completed') {
					send('complete', progress ?? {});
					controller.close();
					return false;
				}

				if (state === 'failed') {
					send('failed', { message: job.failedReason ?? 'Unknown error', progress });
					controller.close();
					return false;
				}

				return true;
			};

			// Initial check
			const shouldContinue = await poll();
			if (!shouldContinue) return;

			// Poll every 2 seconds
			const interval = setInterval(async () => {
				try {
					const shouldContinue = await poll();
					if (!shouldContinue) clearInterval(interval);
				} catch {
					clearInterval(interval);
					try { controller.close(); } catch { /* already closed */ }
				}
			}, 2000);

			// Clean up if the client disconnects
			// The cancel() callback is invoked when the client closes the connection
		},
		cancel() {
			// Client disconnected — nothing to clean up since the interval
			// will fail on the next controller.enqueue and get cleared
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	});
};
