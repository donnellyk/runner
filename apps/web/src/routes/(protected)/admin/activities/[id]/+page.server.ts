import { error, redirect } from '@sveltejs/kit';
import { eq, sql, and, inArray, getTableColumns } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities, activityLaps, activityStreams, activitySegments } from '@web-runner/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user?.isAdmin) {
		redirect(302, '/');
	}
	const db = getDb();
	const activityId = Number(params.id);

	const [activity] = await db
		.select({
			...getTableColumns(activities),
			routeGeoJson: sql<string | null>`ST_AsGeoJSON(${activities.route})`,
		})
		.from(activities)
		.where(eq(activities.id, activityId));
	if (!activity) {
		error(404, 'Activity not found');
	}

	const laps = await db
		.select()
		.from(activityLaps)
		.where(eq(activityLaps.activityId, activityId))
		.orderBy(activityLaps.lapIndex);

	const streams = await db
		.select({
			streamType: activityStreams.streamType,
			originalSize: activityStreams.originalSize,
		})
		.from(activityStreams)
		.where(eq(activityStreams.activityId, activityId));

	const chartStreamTypes = [
		'heartrate', 'altitude', 'cadence', 'watts',
		'velocity_smooth', 'grade_smooth', 'latlng',
	];
	const chartStreams = await db
		.select({
			streamType: activityStreams.streamType,
			data: activityStreams.data,
		})
		.from(activityStreams)
		.where(
			and(
				eq(activityStreams.activityId, activityId),
				inArray(activityStreams.streamType, chartStreamTypes),
			),
		);

	const segments = await db
		.select()
		.from(activitySegments)
		.where(eq(activitySegments.activityId, activityId))
		.orderBy(activitySegments.segmentIndex);

	return {
		activity,
		laps,
		streams,
		chartStreams,
		segments,
	};
};
