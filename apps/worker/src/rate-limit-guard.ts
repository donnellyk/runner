import type { Job } from 'bullmq';
import { DelayedError } from 'bullmq';
import type { StravaRateLimiter } from './rate-limiter.js';

export async function checkRateLimit(
	rateLimiter: StravaRateLimiter,
	job: Job,
	token?: string,
): Promise<void> {
	const state = await rateLimiter.check();
	if (!state.allowed) {
		await job.moveToDelayed(Date.now() + state.delayMs, token);
		throw new DelayedError();
	}
	await rateLimiter.increment();
}
