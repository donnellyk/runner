import { isFeatureEnabled } from '$lib/server/feature-flags';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const trainingPlansEnabled = await isFeatureEnabled('training_plans');
	return {
		darkMap: cookies.get('darkMap') === 'true',
		trainingPlansEnabled,
	};
};
