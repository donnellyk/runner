import { redis } from '$lib/server/redis';
import {
	RATE_LIMIT_KEY_15MIN,
	RATE_LIMIT_KEY_DAILY,
	RATE_LIMIT_15MIN,
	RATE_LIMIT_DAILY,
} from '@web-runner/shared';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const shortTerm = Number(await redis.get(RATE_LIMIT_KEY_15MIN)) || 0;
	const daily = Number(await redis.get(RATE_LIMIT_KEY_DAILY)) || 0;
	const shortTermTtl = await redis.ttl(RATE_LIMIT_KEY_15MIN);
	const dailyTtl = await redis.ttl(RATE_LIMIT_KEY_DAILY);

	const subscriptionId = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID || null;
	const verifyTokenConfigured = !!process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;

	return {
		rateLimit: {
			shortTerm: { usage: shortTerm, limit: RATE_LIMIT_15MIN, ttl: shortTermTtl },
			daily: { usage: daily, limit: RATE_LIMIT_DAILY, ttl: dailyTtl },
		},
		webhook: {
			subscriptionId,
			verifyTokenConfigured,
		},
	};
};
