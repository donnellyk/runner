import { error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities, activityLaps, activityStreams, activitySegments } from '@web-runner/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const activityId = Number(params.id);

	const [activity] = await db.select().from(activities).where(eq(activities.id, activityId));
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

	const [{ count: segmentCount }] = await db
		.select({ count: sql<number>`count(*)` })
		.from(activitySegments)
		.where(eq(activitySegments.activityId, activityId));

	return {
		activity,
		laps,
		streams,
		segmentCount: Number(segmentCount),
	};
};
