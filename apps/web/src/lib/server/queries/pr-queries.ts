import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { personalRecords, activities } from '@web-runner/db/schema';
import { RACE_DISTANCE_PRESETS } from './activity-list';

export async function getUserPRs(userId: number) {
	const db = getDb();

	const rows = await db
		.select({
			id: personalRecords.id,
			activityId: personalRecords.activityId,
			raceDistance: personalRecords.raceDistance,
			timeSeconds: personalRecords.timeSeconds,
			createdAt: personalRecords.createdAt,
			activityName: activities.name,
			startDate: activities.startDate,
			averageSpeed: activities.averageSpeed,
			sportType: activities.sportType,
		})
		.from(personalRecords)
		.innerJoin(activities, eq(activities.id, personalRecords.activityId))
		.where(eq(personalRecords.userId, userId))
		.orderBy(personalRecords.raceDistance, asc(personalRecords.timeSeconds));

	// Keep only the best (lowest time) per distance
	const bestByDistance = new Map<string, (typeof rows)[number]>();
	for (const row of rows) {
		if (!bestByDistance.has(row.raceDistance)) {
			bestByDistance.set(row.raceDistance, row);
		}
	}

	return { best: Array.from(bestByDistance.values()), all: rows };
}

export async function getActivityPR(activityId: number, userId: number) {
	const db = getDb();

	const [pr] = await db
		.select()
		.from(personalRecords)
		.where(and(eq(personalRecords.activityId, activityId), eq(personalRecords.userId, userId)));

	if (!pr) return null;

	// Check if this is the current best for the distance
	const [best] = await db
		.select({ id: personalRecords.id })
		.from(personalRecords)
		.where(and(eq(personalRecords.userId, userId), eq(personalRecords.raceDistance, pr.raceDistance)))
		.orderBy(asc(personalRecords.timeSeconds))
		.limit(1);

	return {
		...pr,
		isBest: best?.id === pr.id,
	};
}

export async function getCurrentPRForDistance(userId: number, raceDistance: string) {
	const db = getDb();

	const [best] = await db
		.select({
			id: personalRecords.id,
			timeSeconds: personalRecords.timeSeconds,
			activityId: personalRecords.activityId,
		})
		.from(personalRecords)
		.where(and(eq(personalRecords.userId, userId), eq(personalRecords.raceDistance, raceDistance)))
		.orderBy(asc(personalRecords.timeSeconds))
		.limit(1);

	return best ?? null;
}

export function matchRaceDistance(distanceMeters: number): string | null {
	return RACE_DISTANCE_PRESETS.find((p) => distanceMeters >= p.lo && distanceMeters <= p.hi)?.label ?? null;
}
