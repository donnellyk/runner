import { Strava } from 'arctic';
import {
	STRAVA_CLIENT_ID,
	STRAVA_CLIENT_SECRET,
	STRAVA_REDIRECT_URI,
} from '$env/static/private';

export const strava = new Strava(STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI);
