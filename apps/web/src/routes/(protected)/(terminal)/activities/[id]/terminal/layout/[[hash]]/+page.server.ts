import { error } from '@sveltejs/kit';
import { getActivity } from '$lib/server/queries/activities';
import { requireParamId } from '$lib/server/validation';
import { isFeatureEnabled } from '$lib/server/feature-flags';
import { getPlanEffortMapForActivity } from '$lib/server/queries/plan-queries';
import { getDb, terminalLayouts } from '@web-runner/db';
import { eq, asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = locals.user!.id;
	const id = requireParamId(params.id);

	const [result, layouts, chartZoomEnabled, planEffort] = await Promise.all([
		getActivity(id, userId),
		getDb()
			.select()
			.from(terminalLayouts)
			.where(eq(terminalLayouts.userId, userId))
			.orderBy(asc(terminalLayouts.updatedAt)),
		isFeatureEnabled('chart_zoom'),
		getPlanEffortMapForActivity(id, userId),
	]);

	if (!result) error(404, 'Activity not found');

	return { ...result, layouts, chartZoomEnabled, planEffort };
};
