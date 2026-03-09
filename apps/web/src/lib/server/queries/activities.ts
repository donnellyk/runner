import { eq, and, desc, gte, lte, between, sql, inArray, getTableColumns } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities, activityLaps, activityStreams, activitySegments, userZones, activityNotes } from '@web-runner/db/schema';
import { DEFAULT_ZONES, RACE_DISTANCES, raceDistanceBounds, type ZoneDefinition } from '@web-runner/shared';

export const PAGE_SIZE = 30;

export const RACE_DISTANCE_PRESETS = RACE_DISTANCES.map((d) => ({
	...d,
	...raceDistanceBounds(d.meters),
}));

export interface ActivityListFilters {
	sport?: string;
	workout?: string;
	range?: string;
	distance?: string;
	cursor?: string;
}

export async function listActivities(userId: number, filters: ActivityListFilters) {
	const db = getDb();
	const { sport, workout, range, distance, cursor } = filters;

	const conditions = [eq(activities.userId, userId)];

	if (sport) conditions.push(eq(activities.sportType, sport));
	if (workout) conditions.push(eq(activities.workoutType, workout));

	if (range === 'week') {
		const since = new Date();
		since.setDate(since.getDate() - 7);
		conditions.push(gte(activities.startDate, since));
	} else if (range === 'month') {
		const since = new Date();
		since.setMonth(since.getMonth() - 1);
		conditions.push(gte(activities.startDate, since));
	} else if (range === '90d') {
		const since = new Date();
		since.setDate(since.getDate() - 90);
		conditions.push(gte(activities.startDate, since));
	}

	if (distance) {
		const preset = RACE_DISTANCE_PRESETS.find((p) => p.label === distance);
		if (preset) {
			conditions.push(between(activities.distance, preset.lo, preset.hi));
		}
	}

	if (cursor) {
		conditions.push(lte(activities.startDate, new Date(cursor)));
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
		.orderBy(desc(activities.startDate))
		.limit(PAGE_SIZE + 1);

	const hasMore = rows.length > PAGE_SIZE;
	const items = rows.slice(0, PAGE_SIZE);

	const activityIds = items.map((a) => a.id);
	let sparklineMap = new Map<number, number[]>();

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
			const d = row.data as number[];
			const step = Math.max(1, Math.floor(d.length / 60));
			sparklineMap.set(row.activityId, d.filter((_, i) => i % step === 0));
		}
	}

	const sportTypes = await db
		.selectDistinct({ sportType: activities.sportType })
		.from(activities)
		.where(eq(activities.userId, userId));

	const nextCursor = hasMore ? items[items.length - 1].startDate.toISOString() : null;

	return {
		activities: items.map((a) => ({ ...a, sparkline: sparklineMap.get(a.id) ?? null })),
		sportTypes: sportTypes.map((r) => r.sportType),
		nextCursor,
		hasMore,
	};
}

export async function getActivity(activityId: number, userId: number) {
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

	const [laps, streams, segments, paceZonesRow, hrZonesRow, notes] = await Promise.all([
		db.select().from(activityLaps).where(eq(activityLaps.activityId, activityId)).orderBy(activityLaps.lapIndex),
		db
			.select({ streamType: activityStreams.streamType, data: activityStreams.data })
			.from(activityStreams)
			.where(and(eq(activityStreams.activityId, activityId), inArray(activityStreams.streamType, streamTypes))),
		db.select().from(activitySegments).where(eq(activitySegments.activityId, activityId)).orderBy(activitySegments.segmentIndex),
		db.select().from(userZones).where(and(eq(userZones.userId, userId), eq(userZones.zoneType, 'pace'))).limit(1),
		db.select().from(userZones).where(and(eq(userZones.userId, userId), eq(userZones.zoneType, 'heartrate'))).limit(1),
		db.select().from(activityNotes).where(eq(activityNotes.activityId, activityId)).orderBy(activityNotes.distanceStart),
	]);

	const streamMap = Object.fromEntries(streams.map((s) => [s.streamType, s.data as number[]]));
	const paceZones: ZoneDefinition[] = (paceZonesRow[0]?.zones as ZoneDefinition[]) ?? DEFAULT_ZONES;
	const hrZones: ZoneDefinition[] = (hrZonesRow[0]?.zones as ZoneDefinition[]) ?? DEFAULT_ZONES;

	return { activity, laps, segments, streamMap, paceZones, hrZones, notes };
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

export async function findRaceActivities(userId: number) {
	const db = getDb();
	const since = new Date();
	since.setFullYear(since.getFullYear() - 1);

	const { ZONE_CALC_PRIORITY } = await import('@web-runner/shared');

	for (const distLabel of ZONE_CALC_PRIORITY) {
		const preset = RACE_DISTANCE_PRESETS.find((p) => p.label === distLabel);
		if (!preset) continue;

		const candidates = await db
			.select({
				id: activities.id,
				name: activities.name,
				startDate: activities.startDate,
				distance: activities.distance,
				movingTime: activities.movingTime,
				averageSpeed: activities.averageSpeed,
				averageHeartrate: activities.averageHeartrate,
				workoutType: activities.workoutType,
			})
			.from(activities)
			.where(
				and(
					eq(activities.userId, userId),
					gte(activities.startDate, since),
					between(activities.distance, preset.lo, preset.hi),
				),
			)
			.orderBy(desc(activities.averageSpeed));

		if (candidates.length === 0) continue;

		// Race-tagged first, then by speed; take top 3
		const raceTagged = candidates.filter((c) => c.workoutType === 'Race');
		const rest = candidates.filter((c) => c.workoutType !== 'Race');
		const sorted = [...raceTagged, ...rest].slice(0, 3);

		return { candidates: sorted, distanceLabel: distLabel, preset };
	}

	return null;
}
