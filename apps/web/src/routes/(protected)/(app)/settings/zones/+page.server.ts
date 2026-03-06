import { fail } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { userZones } from '@web-runner/db/schema';
import {
	getUserZones,
	findRaceActivities,
} from '$lib/server/queries/activities';
import {
	estimateThresholdPace,
	estimateLTHR,
	zonesFromThresholdPace,
	zonesFromLTHR,
	DEFAULT_ZONES,
	type ZoneDefinition,
} from '@web-runner/shared';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const [zones, raceActivities] = await Promise.all([
		getUserZones(userId),
		findRaceActivities(userId),
	]);
	return { zones, raceActivities };
};

export const actions: Actions = {
	saveZones: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const db = getDb();
		const data = await request.formData();
		const zoneType = data.get('zoneType') as string;

		if (zoneType !== 'pace' && zoneType !== 'heartrate') {
			return fail(400, { error: 'Invalid zone type' });
		}

		const zonesJson = data.get('zones') as string;
		let zones: ZoneDefinition[];
		try {
			zones = JSON.parse(zonesJson);
		} catch {
			return fail(400, { error: 'Invalid zones data' });
		}

		await db
			.insert(userZones)
			.values({ userId, zoneType, zones, updatedAt: new Date() })
			.onConflictDoUpdate({
				target: [userZones.userId, userZones.zoneType],
				set: { zones, updatedAt: new Date() },
			});

		return { success: true };
	},

	calcFromRace: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const db = getDb();
		const data = await request.formData();
		const activityId = parseInt(data.get('activityId') as string);
		const distanceLabel = data.get('distanceLabel') as string;
		const avgPaceSec = parseFloat(data.get('avgPaceSec') as string);
		const avgHR = parseFloat(data.get('avgHR') as string);

		const thresholdPace = estimateThresholdPace(distanceLabel, avgPaceSec);
		const paceZones = zonesFromThresholdPace(thresholdPace, DEFAULT_ZONES);

		await db
			.insert(userZones)
			.values({ userId, zoneType: 'pace', zones: paceZones, updatedAt: new Date() })
			.onConflictDoUpdate({
				target: [userZones.userId, userZones.zoneType],
				set: { zones: paceZones, updatedAt: new Date() },
			});

		if (avgHR && !isNaN(avgHR)) {
			const lthr = estimateLTHR(distanceLabel, avgHR);
			const hrZones = zonesFromLTHR(lthr, DEFAULT_ZONES);
			await db
				.insert(userZones)
				.values({ userId, zoneType: 'heartrate', zones: hrZones, updatedAt: new Date() })
				.onConflictDoUpdate({
					target: [userZones.userId, userZones.zoneType],
					set: { zones: hrZones, updatedAt: new Date() },
				});
		}

		return { success: true, activityId };
	},
};
