import { error } from '@sveltejs/kit';
import { getActivity } from '$lib/server/queries/activities';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = locals.user!.id;
	const id = Number(params.id);
	if (isNaN(id)) error(404, 'Activity not found');

	const result = await getActivity(id, userId);
	if (!result) error(404, 'Activity not found');

	return result;
};
