import { eq } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { users, oauthAccounts } from '@web-runner/db/schema';
import { strava } from '$lib/server/oauth';
import {
	generateSessionToken,
	createSession,
	setSessionTokenCookie,
} from '$lib/server/auth';
import { logger } from '$lib/server/logger';
import { parseStravaTimezone } from '$lib/server/strava-utils';
import type { RequestHandler } from './$types';

interface StravaAthlete {
	id: number;
	firstname: string;
	lastname: string;
	city: string;
	state: string;
	country: string;
	profile: string;
	timezone: string;
}

export const GET: RequestHandler = async (event) => {
	const code = event.url.searchParams.get('code');
	const state = event.url.searchParams.get('state');
	const storedState = event.cookies.get('strava_oauth_state') ?? null;

	if (!code || !state || !storedState || state !== storedState) {
		return new Response('Invalid OAuth state', { status: 400 });
	}

	let tokens;
	try {
		tokens = await strava.validateAuthorizationCode(code);
	} catch (err) {
		logger.error({ err }, 'Failed to validate Strava authorization code');
		return new Response('OAuth validation failed', { status: 400 });
	}

	const athleteResponse = await fetch('https://www.strava.com/api/v3/athlete', {
		headers: { Authorization: `Bearer ${tokens.accessToken()}` },
	});

	if (!athleteResponse.ok) {
		logger.error({ status: athleteResponse.status }, 'Failed to fetch Strava athlete');
		return new Response('Failed to fetch athlete profile', { status: 500 });
	}

	const athlete: StravaAthlete = await athleteResponse.json();
	const stravaAthleteId = String(athlete.id);

	const db = getDb();

	let [user] = await db
		.select()
		.from(users)
		.where(eq(users.stravaAthleteId, stravaAthleteId));

	if (!user) {
		const timezone = parseStravaTimezone(athlete.timezone);

		[user] = await db.insert(users).values({
			stravaAthleteId,
			firstName: athlete.firstname,
			lastName: athlete.lastname,
			profilePicUrl: athlete.profile,
			city: athlete.city,
			state: athlete.state,
			country: athlete.country,
			timezone,
		}).returning();
	} else {
		[user] = await db.update(users)
			.set({
				firstName: athlete.firstname,
				lastName: athlete.lastname,
				profilePicUrl: athlete.profile,
				city: athlete.city,
				state: athlete.state,
				country: athlete.country,
				updatedAt: new Date(),
			})
			.where(eq(users.id, user.id))
			.returning();
	}

	const [existingAccount] = await db
		.select()
		.from(oauthAccounts)
		.where(eq(oauthAccounts.providerUserId, stravaAthleteId));

	if (existingAccount) {
		await db.update(oauthAccounts)
			.set({
				accessToken: tokens.accessToken(),
				refreshToken: tokens.refreshToken(),
				expiresAt: tokens.accessTokenExpiresAt(),
			})
			.where(eq(oauthAccounts.id, existingAccount.id));
	} else {
		await db.insert(oauthAccounts).values({
			userId: user.id,
			provider: 'strava',
			providerUserId: stravaAthleteId,
			accessToken: tokens.accessToken(),
			refreshToken: tokens.refreshToken(),
			expiresAt: tokens.accessTokenExpiresAt(),
		});
	}

	const sessionToken = generateSessionToken();
	const session = await createSession(sessionToken, user.id);
	setSessionTokenCookie(event, sessionToken, session.expiresAt);

	return new Response(null, {
		status: 302,
		headers: { Location: '/' },
	});
};
