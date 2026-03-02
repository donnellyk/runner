import { fail } from '@sveltejs/kit';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { users, oauthAccounts, activities } from '@web-runner/db/schema';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
	const db = getDb();

	const userList = await db
		.select({
			id: users.id,
			firstName: users.firstName,
			lastName: users.lastName,
			stravaAthleteId: users.stravaAthleteId,
			isAdmin: users.isAdmin,
			createdAt: users.createdAt,
			tokenExpiresAt: oauthAccounts.expiresAt,
		})
		.from(users)
		.leftJoin(
			oauthAccounts,
			and(eq(oauthAccounts.userId, users.id), eq(oauthAccounts.provider, 'strava')),
		)
		.orderBy(users.id);

	const activityStats = await db
		.select({
			userId: activities.userId,
			count: sql<number>`count(*)`,
			lastSync: sql<string>`max(${activities.updatedAt})`,
		})
		.from(activities)
		.groupBy(activities.userId);

	const statsMap = new Map(activityStats.map((s) => [s.userId, s]));

	return {
		users: userList.map((u) => {
			const stats = statsMap.get(u.id);
			return {
				...u,
				activityCount: stats ? Number(stats.count) : 0,
				lastSync: stats?.lastSync ?? null,
			};
		}),
	};
};

export const actions: Actions = {
	toggleAdmin: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) {
			return fail(403);
		}

		const data = await request.formData();
		const userId = Number(data.get('userId'));

		if (userId === locals.user.id) {
			return fail(400, { error: 'Cannot toggle your own admin status' });
		}

		const db = getDb();
		const [target] = await db
			.select({ isAdmin: users.isAdmin })
			.from(users)
			.where(eq(users.id, userId));

		if (!target) {
			return fail(404, { error: 'User not found' });
		}

		await db
			.update(users)
			.set({ isAdmin: !target.isAdmin, updatedAt: new Date() })
			.where(eq(users.id, userId));
	},
};
