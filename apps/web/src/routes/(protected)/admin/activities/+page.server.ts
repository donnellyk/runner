import { fail } from '@sveltejs/kit';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities, users } from '@web-runner/db/schema';
import { getQueue } from '$lib/server/queue';
import { getUserOptions } from '$lib/server/admin-queries';
import { JobPriority } from '@web-runner/shared';
import type { ActivityImportJobData, FullHistoryImportJobData } from '@web-runner/shared';
import type { PageServerLoad, Actions } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const statusFilter = url.searchParams.get('status');
	const sportFilter = url.searchParams.get('sport');
	const userFilter = url.searchParams.get('user');
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const offset = (page - 1) * PAGE_SIZE;

	const conditions = [];
	if (statusFilter) conditions.push(eq(activities.syncStatus, statusFilter));
	if (sportFilter) conditions.push(eq(activities.sportType, sportFilter));
	if (userFilter) conditions.push(eq(activities.userId, Number(userFilter)));

	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const activityList = await db
		.select({
			id: activities.id,
			name: activities.name,
			sportType: activities.sportType,
			syncStatus: activities.syncStatus,
			startDate: activities.startDate,
			distance: activities.distance,
			movingTime: activities.movingTime,
			userId: activities.userId,
			externalId: activities.externalId,
			userName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, 'Unknown')`,
		})
		.from(activities)
		.leftJoin(users, eq(activities.userId, users.id))
		.where(where)
		.orderBy(desc(activities.startDate))
		.limit(PAGE_SIZE)
		.offset(offset);

	const [{ count }] = await db
		.select({ count: sql<number>`count(*)` })
		.from(activities)
		.where(where);

	const sportTypes = await db
		.selectDistinct({ sportType: activities.sportType })
		.from(activities);
	const syncStatuses = await db
		.selectDistinct({ syncStatus: activities.syncStatus })
		.from(activities);
	const userOptions = await getUserOptions();

	return {
		activities: activityList,
		total: Number(count),
		page,
		pageSize: PAGE_SIZE,
		filters: {
			status: statusFilter,
			sport: sportFilter,
			user: userFilter,
		},
		sportTypes: sportTypes.map((s) => s.sportType),
		syncStatuses: syncStatuses.map((s) => s.syncStatus),
		users: userOptions,
	};
};

export const actions: Actions = {
	requeue: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const activityId = Number(data.get('activityId'));
		if (!Number.isFinite(activityId) || activityId <= 0) return fail(400, { error: 'Invalid activityId' });

		const db = getDb();
		const [activity] = await db
			.select({ userId: activities.userId, externalId: activities.externalId })
			.from(activities)
			.where(eq(activities.id, activityId));

		if (!activity) return fail(404, { error: 'Activity not found' });

		const jobData: ActivityImportJobData = {
			type: 'activity-import',
			userId: activity.userId,
			activityId: Number(activity.externalId),
		};
		const queue = getQueue();
		await queue.add('activity-import', jobData, { priority: JobPriority.activityImport });

		await db
			.update(activities)
			.set({ syncStatus: 'pending', updatedAt: new Date() })
			.where(eq(activities.id, activityId));
	},

	fullSync: async ({ request, locals }) => {
		if (!locals.user?.isAdmin) return fail(403);

		const data = await request.formData();
		const userId = Number(data.get('userId'));
		if (!Number.isFinite(userId) || userId <= 0) return fail(400, { error: 'Invalid userId' });

		const jobData: FullHistoryImportJobData = { type: 'full-history-import', userId };
		const queue = getQueue();
		await queue.add('full-history-import', jobData, { priority: JobPriority.fullHistoryImport });
	},
};
