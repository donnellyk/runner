import { listActivities, RACE_DISTANCE_PRESETS } from '$lib/server/queries/activities';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = locals.user!.id;
	const filters = {
		sport:    url.searchParams.get('sport')    ?? '',
		workout:  url.searchParams.get('workout')  ?? '',
		range:    url.searchParams.get('range')    ?? '',
		distance: url.searchParams.get('distance') ?? '',
		cursor:   url.searchParams.get('cursor')   ?? '',
	};

	const result = await listActivities(userId, filters);

	return {
		...result,
		filters,
		distancePresets: RACE_DISTANCE_PRESETS.map((p) => p.label),
	};
};
