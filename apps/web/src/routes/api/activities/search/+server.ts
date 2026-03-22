import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireApiUser } from '$lib/server/validation';
import { searchActivities } from '$lib/server/queries/activities';

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = requireApiUser(locals);

	const sport = url.searchParams.get('sport');
	if (!sport) {
		return json({ error: 'Missing sport parameter' }, { status: 400 });
	}

	const q = url.searchParams.get('q') || undefined;
	const exclude = url.searchParams.get('exclude');
	const limit = url.searchParams.get('limit');
	const workout = url.searchParams.get('workout') || undefined;
	const range = url.searchParams.get('range') || undefined;
	const distance = url.searchParams.get('distance') || undefined;

	const excludeNum = exclude ? Number(exclude) : undefined;
	const limitNum = limit ? Number(limit) : undefined;

	const activities = await searchActivities(user.id, {
		q,
		sport,
		exclude: excludeNum && !Number.isNaN(excludeNum) ? excludeNum : undefined,
		limit: limitNum && !Number.isNaN(limitNum) ? Math.min(limitNum, 50) : 20,
		workout,
		range,
		distance,
	});

	return json({ activities });
};
