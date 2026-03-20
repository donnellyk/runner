import { eq, and, inArray, sql, getTableColumns } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities, activityLaps, activityStreams, activitySegments, userZones, activityNotes } from '@web-runner/db/schema';
import { DEFAULT_ZONES, type ZoneDefinition } from '@web-runner/shared';
import { isNumberArray, isLatLngArray } from '$lib/terminal/types';

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
