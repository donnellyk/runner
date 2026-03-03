import { Strava } from 'arctic';
import { env } from '$env/dynamic/private';

export const strava = new Strava(
	env.STRAVA_CLIENT_ID!,
	env.STRAVA_CLIENT_SECRET!,
	env.STRAVA_REDIRECT_URI!,
);
