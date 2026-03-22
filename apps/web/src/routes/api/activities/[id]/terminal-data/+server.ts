import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireApiUser, requireParamId } from '$lib/server/validation';
import { getActivity } from '$lib/server/queries/activities';

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = requireApiUser(locals);
	const id = requireParamId(params.id);

	const result = await getActivity(id, user.id, { skipZones: true });
	if (!result) error(404, 'Activity not found');

	const { activity, streamMap, laps, segments, notes } = result;

	return json({
		activity: {
			id: activity.id,
			name: activity.name,
			sportType: activity.sportType,
			startDate: activity.startDate,
			distance: activity.distance,
			movingTime: activity.movingTime,
			averageSpeed: activity.averageSpeed,
			averageHeartrate: activity.averageHeartrate,
			totalElevationGain: activity.totalElevationGain,
			averageCadence: activity.averageCadence,
			routeGeoJson: activity.routeGeoJson,
		},
		streamMap,
		laps,
		segments,
		notes,
	});
};
