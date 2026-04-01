import { fail } from '@sveltejs/kit';
import { listActivities, getRunningMileageSummaries, RACE_DISTANCE_PRESETS } from '$lib/server/queries/activities';
import { isFeatureEnabled } from '$lib/server/feature-flags';
import { getActiveInstanceCurrentWeek, addSupplementaryCompletion, removeSupplementaryCompletion } from '$lib/server/queries/plan-queries';
import { getPRActivityIds } from '$lib/server/queries/pr-queries';
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

	const trainingPlansEnabled = await isFeatureEnabled('training_plans');

	const [result, mileageSummaries, currentWeek, prActivityIds] = await Promise.all([
		listActivities(userId, filters),
		getRunningMileageSummaries(userId),
		trainingPlansEnabled ? getActiveInstanceCurrentWeek(userId) : Promise.resolve(null),
		getPRActivityIds(userId),
	]);

	return {
		...result,
		filters,
		distancePresets: RACE_DISTANCE_PRESETS.map((p) => p.label),
		mileageSummaries,
		weekMode,
		currentWeek,
		prActivityIds: [...prActivityIds],
	};
};

export const actions: Actions = {
	toggleWeekMode: async ({ cookies }) => {
		const current = cookies.get('weekMode') ?? 'last7';
		const next = current === 'last7' ? 'thisWeek' : 'last7';
		cookies.set('weekMode', next, { path: '/', httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
	},

	addCompletion: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const data = await request.formData();
		const weekId = parseInt(data.get('weekId') as string);
		const name = data.get('name') as string;
		if (!weekId || !name) return fail(400, { error: 'Missing weekId or name' });

		const added = await addSupplementaryCompletion(weekId, userId, name);
		if (!added) return fail(404, { error: 'Week not found' });
	},

	removeCompletion: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const data = await request.formData();
		const completionId = parseInt(data.get('completionId') as string);
		if (!completionId) return fail(400, { error: 'Missing completionId' });

		const removed = await removeSupplementaryCompletion(completionId, userId);
		if (!removed) return fail(404, { error: 'Completion not found' });
	},
};
