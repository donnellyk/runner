import { error } from '@sveltejs/kit';
import { getActivity } from '$lib/server/queries/activities';
import { requireParamId } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = locals.user!.id;
	const id = requireParamId(params.id);

	const result = await getActivity(id, userId);
	if (!result) error(404, 'Activity not found');

	return result;
};
