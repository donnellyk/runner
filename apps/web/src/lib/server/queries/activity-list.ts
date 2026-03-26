import { eq, and, desc, gte, lte, lt, or, between, inArray, ilike, sql } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities, activityStreams } from '@web-runner/db/schema';
import { RACE_DISTANCES, raceDistanceBounds } from '@web-runner/shared';
import { isNumberArray } from '$lib/terminal/types';

export const PAGE_SIZE = 30;

export const RACE_DISTANCE_PRESETS = RACE_DISTANCES.map((d) => ({
	...d,
	...raceDistanceBounds(d.meters),
}));

export interface ActivityListFilters {
	q?: string;
	sport?: string;
	workout?: string;
	range?: string;
	distance?: string;
	cursor?: string;
}

export async function listActivities(userId: number, filters: ActivityListFilters) {
	const db = getDb();
	const { q, sport, workout, range, distance, cursor } = filters;

	// Filter conditions (used for both the page query and the count query)
	const filterConditions = [eq(activities.userId, userId)];

	if (q) filterConditions.push(ilike(activities.name, `%${q}%`));
	if (sport) filterConditions.push(eq(activities.sportType, sport));
	if (workout) filterConditions.push(eq(activities.workoutType, workout));

	if (range === 'week') {
		const since = new Date();
		since.setDate(since.getDate() - 7);
		filterConditions.push(gte(activities.startDate, since));
	} else if (range === 'month') {
		const since = new Date();
		since.setMonth(since.getMonth() - 1);
		filterConditions.push(gte(activities.startDate, since));
	} else if (range === '90d') {
		const since = new Date();
		since.setDate(since.getDate() - 90);
		filterConditions.push(gte(activities.startDate, since));
	}

	if (distance) {
		const preset = RACE_DISTANCE_PRESETS.find((p) => p.label === distance);
		if (preset) {
			filterConditions.push(between(activities.distance, preset.lo, preset.hi));
		}
	}

	const hasFilters = !!(q || sport || workout || range || distance);

	// Pagination conditions (only for the page query, not the count)
	const conditions = [...filterConditions];
	if (cursor) {
		const [cursorDate, cursorId] = cursor.split(',');
		const cursorTime = new Date(cursorDate);
		if (cursorId) {
			conditions.push(
				or(
					lt(activities.startDate, cursorTime),
					and(eq(activities.startDate, cursorTime), lt(activities.id, Number(cursorId))),
				)!,
			);
		} else {
			conditions.push(lte(activities.startDate, cursorTime));
		}
	}

	const rows = await db
		.select({
			id: activities.id,
			name: activities.name,
			sportType: activities.sportType,
			workoutType: activities.workoutType,
			startDate: activities.startDate,
			distance: activities.distance,
			movingTime: activities.movingTime,
			totalElevationGain: activities.totalElevationGain,
			averageSpeed: activities.averageSpeed,
			averageHeartrate: activities.averageHeartrate,
			hasHeartrate: activities.hasHeartrate,
		})
		.from(activities)
		.where(and(...conditions))
		.orderBy(desc(activities.startDate), desc(activities.id))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const items = rows.slice(0, PAGE_SIZE);

	const activityIds = items.map((a) => a.id);
	const sparklineMap = new Map<number, number[]>();

	if (activityIds.length > 0) {
		const sparklineRows = await db
			.select({ activityId: activityStreams.activityId, data: activityStreams.data })
			.from(activityStreams)
			.where(
				and(
					inArray(activityStreams.activityId, activityIds),
					eq(activityStreams.streamType, 'velocity_smooth'),
				),
			);

		for (const row of sparklineRows) {
			if (!isNumberArray(row.data)) continue;
			const step = Math.max(1, Math.floor(row.data.length / 60));
			sparklineMap.set(row.activityId, row.data.filter((_, i) => i % step === 0));
		}
	}

	const [sportTypes, totalCount] = await Promise.all([
		db.selectDistinct({ sportType: activities.sportType })
			.from(activities)
			.where(eq(activities.userId, userId)),
		hasFilters
			? db.select({ count: sql<number>`count(*)` })
				.from(activities)
				.where(and(...filterConditions))
				.then((r) => Number(r[0].count))
			: Promise.resolve(null),
	]);

	const last = items[items.length - 1];
	const nextCursor = hasMore ? `${last.startDate.toISOString()},${last.id}` : null;

	return {
		activities: items.map((a) => ({ ...a, sparkline: sparklineMap.get(a.id) ?? null })),
		sportTypes: sportTypes.map((r) => r.sportType),
		nextCursor,
		hasMore,
		totalCount,
	};
}
