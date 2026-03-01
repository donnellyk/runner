import { generateState } from 'arctic';
import { strava } from '$lib/server/oauth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const state = generateState();
	const scopes = ['read', 'activity:read_all'];
	const url = strava.createAuthorizationURL(state, scopes);

	event.cookies.set('strava_oauth_state', state, {
		path: '/',
		httpOnly: true,
		maxAge: 60 * 10,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
	});

	return new Response(null, {
		status: 302,
		headers: { Location: url.toString() },
	});
};
