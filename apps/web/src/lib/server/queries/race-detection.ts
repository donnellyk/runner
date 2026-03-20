import { eq, and, desc, gte, between } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { activities } from '@web-runner/db/schema';
import { RACE_DISTANCE_PRESETS } from './activity-list';

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
