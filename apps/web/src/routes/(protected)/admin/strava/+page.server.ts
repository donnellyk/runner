import { fail } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { StravaClient, getValidToken } from '@web-runner/strava';
import { getUserOptions } from '$lib/server/admin-queries';
import { getDb } from '@web-runner/db/client';
import { activities } from '@web-runner/db/schema';
import { eq, desc } from 'drizzle-orm';
import {
	RATE_LIMIT_KEY_15MIN,
	RATE_LIMIT_KEY_DAILY,
	RATE_LIMIT_15MIN,
	RATE_LIMIT_DAILY,
} from '@web-runner/shared';
import type { PageServerLoad, Actions } from './$types';

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
		users: await getUserOptions(),
	};
};

export const actions: Actions = {
	listActivities: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const formData = await request.formData();
		const userId = Number(formData.get('userId'));
		if (!Number.isFinite(userId) || userId <= 0) return fail(400, { error: 'Invalid userId' });

		const db = getDb();
		const token = await getValidToken(db, userId);
		if (!token) return fail(400, { error: 'No valid token for user' });

		const client = new StravaClient();
		const { data, rateLimit } = await client.listActivities(token, { perPage: 30 });
		return { items: data, rateLimit, action: 'listActivities' as const };
	},

	listRaces: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const formData = await request.formData();
		const userId = Number(formData.get('userId'));
		if (!Number.isFinite(userId) || userId <= 0) return fail(400, { error: 'Invalid userId' });

		const db = getDb();
		const token = await getValidToken(db, userId);
		if (!token) return fail(400, { error: 'No valid token for user' });

		const client = new StravaClient();
		const { data, rateLimit } = await client.listActivities(token, { perPage: 200 });
		const races = data.filter((a) => a.workout_type === 1);
		return { items: races, rateLimit, action: 'listRaces' as const, scanned: data.length };
	},

	refresh: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const formData = await request.formData();
		const userId = Number(formData.get('userId'));
		if (!Number.isFinite(userId) || userId <= 0) return fail(400, { error: 'Invalid userId' });

		const db = getDb();
		const [latest] = await db
			.select({ startDate: activities.startDate })
			.from(activities)
			.where(eq(activities.userId, userId))
			.orderBy(desc(activities.startDate))
			.limit(1);

		if (!latest) return fail(400, { error: 'No activities found for user — cannot determine refresh point' });

		const after = Math.floor(latest.startDate.getTime() / 1000);
		const token = await getValidToken(db, userId);
		if (!token) return fail(400, { error: 'No valid token for user' });

		const client = new StravaClient();
		const { data, rateLimit } = await client.listActivities(token, { after, perPage: 200 });
		return { items: data, rateLimit, action: 'refresh' as const, after };
	},

	getActivity: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const formData = await request.formData();
		const userId = Number(formData.get('userId'));
		const activityId = Number(formData.get('activityId'));
		if (!Number.isFinite(userId) || userId <= 0) return fail(400, { error: 'Invalid userId' });
		if (!Number.isFinite(activityId) || activityId <= 0) return fail(400, { error: 'Invalid activityId' });

		const db = getDb();
		const token = await getValidToken(db, userId);
		if (!token) return fail(400, { error: 'No valid token for user' });

		const client = new StravaClient();
		const { data, rateLimit } = await client.getActivity(token, activityId);
		return { items: [data], rateLimit, action: 'getActivity' as const };
	},
};
