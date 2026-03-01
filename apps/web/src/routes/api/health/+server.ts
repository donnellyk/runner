import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '@web-runner/db';
import { redis } from '$lib/server/redis';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async () => {
	const checks: Record<string, string> = {};
	let healthy = true;

	// Check database
	try {
		const db = getDb();
		await db.execute('SELECT 1' as never);
		checks.database = 'ok';
	} catch (err) {
		logger.error({ err }, 'Database health check failed');
		checks.database = 'error';
		healthy = false;
	}

	// Check Redis
	try {
		await redis.ping();
		checks.redis = 'ok';
	} catch (err) {
		logger.error({ err }, 'Redis health check failed');
		checks.redis = 'error';
		healthy = false;
	}

	return json(
		{ status: healthy ? 'healthy' : 'unhealthy', checks },
		{ status: healthy ? 200 : 503 }
	);
};
