import { error, fail } from '@sveltejs/kit';
import { eq, sql, and, desc } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { users, oauthAccounts, activities } from '@web-runner/db/schema';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const userId = Number(params.id);

	const [user] = await db
		.select({
			id: users.id,
			firstName: users.firstName,
			lastName: users.lastName,
			stravaAthleteId: users.stravaAthleteId,
			isAdmin: users.isAdmin,
			timezone: users.timezone,
			distanceUnit: users.distanceUnit,
			createdAt: users.createdAt,
			tokenExpiresAt: oauthAccounts.expiresAt,
		})
		.from(users)
		.leftJoin(
			oauthAccounts,
			and(eq(oauthAccounts.userId, users.id), eq(oauthAccounts.provider, 'strava')),
		)
		.where(eq(users.id, userId));

	if (!user) error(404, 'User not found');

	const [stats] = await db
		.select({
			count: sql<number>`count(*)`,
			lastSync: sql<string>`max(${activities.updatedAt})`,
		})
		.from(activities)
		.where(eq(activities.userId, userId));

	const activityList = await db
		.select({
			id: activities.id,
			name: activities.name,
			sportType: activities.sportType,
			syncStatus: activities.syncStatus,
			startDate: activities.startDate,
			distance: activities.distance,
			movingTime: activities.movingTime,
		})
		.from(activities)
		.where(eq(activities.userId, userId))
		.orderBy(desc(activities.startDate));

	return {
		profile: {
			...user,
			activityCount: stats ? Number(stats.count) : 0,
			lastSync: stats?.lastSync ?? null,
		},
		activities: activityList,
	};
};

export const actions: Actions = {
	updateUnits: async ({ request, locals, params }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const userId = Number(params.id);
		const data = await request.formData();
		const unit = data.get('distanceUnit');
		if (unit !== 'metric' && unit !== 'imperial') {
			return fail(400, { error: 'Invalid unit' });
		}

		const db = getDb();
		await db
			.update(users)
			.set({ distanceUnit: unit, updatedAt: new Date() })
			.where(eq(users.id, userId));
	},
};
