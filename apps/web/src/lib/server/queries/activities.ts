import { eq, and, desc, gte, lte, lt, or, between, sql, inArray, getTableColumns } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities, activityLaps, activityStreams, activitySegments, userZones, activityNotes } from '@web-runner/db/schema';
import { DEFAULT_ZONES, RACE_DISTANCES, raceDistanceBounds, type ZoneDefinition } from '@web-runner/shared';
import { isNumberArray, isLatLngArray } from '$lib/terminal/types';

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

	const sportTypes = await db
		.selectDistinct({ sportType: activities.sportType })
		.from(activities)
		.where(eq(activities.userId, userId));

	const last = items[items.length - 1];
	const nextCursor = hasMore ? `${last.startDate.toISOString()},${last.id}` : null;

	return {
		activities: items.map((a) => ({ ...a, sparkline: sparklineMap.get(a.id) ?? null })),
		sportTypes: sportTypes.map((r) => r.sportType),
		nextCursor,
		hasMore,
	};
}

export interface MileageSummary {
	label: string;
	totalMeters: number;
	dailyMeters: number[];  // one entry per day in the period
	periodDays: number;     // total days in the period
	elapsedDays: number;    // days elapsed so far
	priorTotalMeters?: number;
}

export interface MileageSummaries {
	thisWeek: MileageSummary;
	last7Days: MileageSummary;
	month: MileageSummary;
	year: MileageSummary;
}

export async function getRunningMileageSummaries(userId: number): Promise<MileageSummaries> {
	const db = getDb();
	const now = new Date();

	// Start of current week (Monday)
	const weekStart = new Date(now);
	weekStart.setHours(0, 0, 0, 0);
	const dayOfWeek = weekStart.getDay();
	weekStart.setDate(weekStart.getDate() - ((dayOfWeek + 6) % 7));

	// Start of current month
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

	// Start of current year and previous year
	const yearStart = new Date(now.getFullYear(), 0, 1);
	const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);

	// Previous month
	const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

	// Fetch all running activities from prev year onward (covers all periods)
	const rows = await db
		.select({
			startDate: activities.startDate,
			distance: activities.distance,
		})
		.from(activities)
		.where(
			and(
				eq(activities.userId, userId),
				inArray(activities.sportType, ['run', 'trail_run']),
				gte(activities.startDate, prevYearStart),
				eq(activities.syncStatus, 'complete'),
			),
		);

	function sumRange(start: Date, end: Date): number {
		let total = 0;
		for (const row of rows) {
			const d = new Date(row.startDate);
			if (d >= start && d <= end) total += row.distance ?? 0;
		}
		return total;
	}

	function buildSummary(label: string, periodStart: Date, periodDays: number): MileageSummary {
		const elapsedDays = Math.floor((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
		const dailyMeters = new Array(Math.min(elapsedDays, periodDays)).fill(0);

		for (const row of rows) {
			const date = new Date(row.startDate);
			if (date < periodStart) continue;
			const dayIndex = Math.floor((date.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
			if (dayIndex >= 0 && dayIndex < dailyMeters.length) {
				dailyMeters[dayIndex] += row.distance ?? 0;
			}
		}

		return {
			label,
			totalMeters: dailyMeters.reduce((a, b) => a + b, 0),
			dailyMeters,
			periodDays,
			elapsedDays: Math.min(elapsedDays, periodDays),
		};
	}

	// Rolling last 7 days
	const last7Start = new Date(now);
	last7Start.setHours(0, 0, 0, 0);
	last7Start.setDate(last7Start.getDate() - 6);

	const isLeapYear = (now.getFullYear() % 4 === 0 && now.getFullYear() % 100 !== 0) || (now.getFullYear() % 400 === 0);
	const daysInYear = isLeapYear ? 366 : 365;
	const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

	const prevYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

	// Previous week (Mon-Sun before current week)
	const prevWeekStart = new Date(weekStart);
	prevWeekStart.setDate(prevWeekStart.getDate() - 7);
	const prevWeekEnd = new Date(weekStart.getTime() - 1);

	// Previous rolling 7 days (the 7 days before the current last-7-days window)
	const prevLast7Start = new Date(last7Start);
	prevLast7Start.setDate(prevLast7Start.getDate() - 7);
	const prevLast7End = new Date(last7Start.getTime() - 1);

	const thisWeek = buildSummary('This Week', weekStart, 7);
	thisWeek.priorTotalMeters = sumRange(prevWeekStart, prevWeekEnd);

	const last7Days = buildSummary('Last 7 Days', last7Start, 7);
	last7Days.priorTotalMeters = sumRange(prevLast7Start, prevLast7End);

	const month = buildSummary('Month', monthStart, daysInMonth);
	month.priorTotalMeters = sumRange(prevMonthStart, prevMonthEnd);

	const year = buildSummary('Year', yearStart, daysInYear);
	year.priorTotalMeters = sumRange(prevYearStart, prevYearEnd);

	return { thisWeek, last7Days, month, year };
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

	const [laps, streams, segments, zones, notes] = await Promise.all([
		db.select().from(activityLaps).where(eq(activityLaps.activityId, activityId)).orderBy(activityLaps.lapIndex),
		db
			.select({ streamType: activityStreams.streamType, data: activityStreams.data })
			.from(activityStreams)
			.where(and(eq(activityStreams.activityId, activityId), inArray(activityStreams.streamType, streamTypes))),
		db.select().from(activitySegments).where(eq(activitySegments.activityId, activityId)).orderBy(activitySegments.segmentIndex),
		getUserZones(userId),
		db.select().from(activityNotes).where(eq(activityNotes.activityId, activityId)).orderBy(activityNotes.distanceStart),
	]);

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
