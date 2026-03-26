import { listActivities, getRunningMileageSummaries, RACE_DISTANCE_PRESETS } from '$lib/server/queries/activities';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const userId = locals.user!.id;
	const filters = {
		q:        url.searchParams.get('q')        ?? '',
		sport:    url.searchParams.get('sport')    ?? '',
		workout:  url.searchParams.get('workout')  ?? '',
		range:    url.searchParams.get('range')    ?? '',
		distance: url.searchParams.get('distance') ?? '',
		cursor:   url.searchParams.get('cursor')   ?? '',
	};

	const weekMode = (cookies.get('weekMode') ?? 'last7') as 'last7' | 'thisWeek';

	const [result, mileageSummaries] = await Promise.all([
		listActivities(userId, filters),
		getRunningMileageSummaries(userId),
	]);

	return {
		...result,
		filters,
		distancePresets: RACE_DISTANCE_PRESETS.map((p) => p.label),
		mileageSummaries,
		weekMode,
	};
};

export const actions: Actions = {
	toggleWeekMode: async ({ cookies }) => {
		const current = cookies.get('weekMode') ?? 'last7';
		const next = current === 'last7' ? 'thisWeek' : 'last7';
		cookies.set('weekMode', next, { path: '/', httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
	},
};
