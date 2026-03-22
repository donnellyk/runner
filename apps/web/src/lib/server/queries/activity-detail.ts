import { eq, and, inArray, sql, getTableColumns, ilike, ne, desc, gte, between } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities, activityLaps, activityStreams, activitySegments, userZones, activityNotes } from '@web-runner/db/schema';
import { DEFAULT_ZONES, type ZoneDefinition, RACE_DISTANCES, raceDistanceBounds } from '@web-runner/shared';
import { isNumberArray, isLatLngArray } from '$lib/terminal/types';

const RACE_DISTANCE_PRESETS = RACE_DISTANCES.map((d) => ({
	...d,
	...raceDistanceBounds(d.meters),
}));

export async function getActivity(activityId: number, userId: number, opts?: { skipZones?: boolean }) {
	const db = getDb();

	const [activity] = await db
		.select({
			...getTableColumns(activities),
			routeGeoJson: sql<string | null>`ST_AsGeoJSON(${activities.route})`,
		})
		.from(activities)
		.where(and(eq(activities.id, activityId), eq(activities.userId, userId)));

	if (!activity) return null;

	const streamTypes = ['heartrate', 'altitude', 'cadence', 'watts', 'velocity_smooth', 'grade_smooth', 'latlng', 'distance', 'time'];

	const queries = [
		db.select().from(activityLaps).where(eq(activityLaps.activityId, activityId)).orderBy(activityLaps.lapIndex),
		db
			.select({ streamType: activityStreams.streamType, data: activityStreams.data })
			.from(activityStreams)
			.where(and(eq(activityStreams.activityId, activityId), inArray(activityStreams.streamType, streamTypes))),
		db.select().from(activitySegments).where(eq(activitySegments.activityId, activityId)).orderBy(activitySegments.segmentIndex),
		opts?.skipZones ? Promise.resolve({ paceZones: [], hrZones: [] }) : getUserZones(userId),
		db.select().from(activityNotes).where(eq(activityNotes.activityId, activityId)).orderBy(activityNotes.distanceStart),
	] as const;

	const [laps, streams, segments, zones, notes] = await Promise.all(queries);

	const streamMap: Record<string, number[] | [number, number][]> = {};
	for (const s of streams) {
		if (s.streamType === 'latlng') {
			if (isLatLngArray(s.data)) streamMap[s.streamType] = s.data;
		} else {
			if (isNumberArray(s.data)) streamMap[s.streamType] = s.data;
		}
	}

	return { activity, laps, segments, streamMap, ...zones, notes };
}

export async function searchActivities(
	userId: number,
	opts: { q?: string; sport: string; exclude?: number; limit?: number; workout?: string; range?: string; distance?: string },
) {
	const db = getDb();
	const limit = opts.limit ?? 20;

	const conditions = [
		eq(activities.userId, userId),
		eq(activities.sportType, opts.sport),
	];

	if (opts.q) {
		conditions.push(ilike(activities.name, '%' + opts.q + '%'));
	}
	if (opts.exclude) {
		conditions.push(ne(activities.id, opts.exclude));
	}
	if (opts.workout) {
		conditions.push(eq(activities.workoutType, opts.workout));
	}
	if (opts.range === 'week') {
		const since = new Date();
		since.setDate(since.getDate() - 7);
		conditions.push(gte(activities.startDate, since));
	} else if (opts.range === 'month') {
		const since = new Date();
		since.setMonth(since.getMonth() - 1);
		conditions.push(gte(activities.startDate, since));
	} else if (opts.range === '90d') {
		const since = new Date();
		since.setDate(since.getDate() - 90);
		conditions.push(gte(activities.startDate, since));
	}
	if (opts.distance) {
		const preset = RACE_DISTANCE_PRESETS.find((p) => p.label === opts.distance);
		if (preset) {
			conditions.push(between(activities.distance, preset.lo, preset.hi));
		}
	}

	const rows = await db
		.select({
			id: activities.id,
			name: activities.name,
			sportType: activities.sportType,
			startDate: activities.startDate,
			distance: activities.distance,
			movingTime: activities.movingTime,
			averageSpeed: activities.averageSpeed,
		})
		.from(activities)
		.where(and(...conditions))
		.orderBy(desc(activities.startDate))
		.limit(limit);

	return rows;
}

export async function getUserZones(userId: number) {
	const db = getDb();
	const [paceRow, hrRow] = await Promise.all([
		db.select().from(userZones).where(and(eq(userZones.userId, userId), eq(userZones.zoneType, 'pace'))).limit(1),
		db.select().from(userZones).where(and(eq(userZones.userId, userId), eq(userZones.zoneType, 'heartrate'))).limit(1),
	]);
	return {
		paceZones: (paceRow[0]?.zones as ZoneDefinition[]) ?? DEFAULT_ZONES,
		hrZones: (hrRow[0]?.zones as ZoneDefinition[]) ?? DEFAULT_ZONES,
	};
}
