import { eq, and } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { oauthAccounts } from '@web-runner/db/schema';
import { strava } from '$lib/server/oauth';
import { logger } from '$lib/server/logger';

const REFRESH_BUFFER_MS = 10 * 60 * 1000;

export async function getValidStravaToken(userId: number): Promise<string | null> {
	const db = getDb();

	const [account] = await db
		.select()
		.from(oauthAccounts)
		.where(and(
			eq(oauthAccounts.userId, userId),
			eq(oauthAccounts.provider, 'strava'),
		));

	if (!account) return null;

	if (account.expiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS) {
		return account.accessToken;
	}

	try {
		const newTokens = await strava.refreshAccessToken(account.refreshToken);

		await db.update(oauthAccounts)
			.set({
				accessToken: newTokens.accessToken(),
				refreshToken: newTokens.refreshToken(),
				expiresAt: newTokens.accessTokenExpiresAt(),
			})
			.where(eq(oauthAccounts.id, account.id));

		return newTokens.accessToken();
	} catch (err) {
		logger.error({ err, userId }, 'Failed to refresh Strava token');
		return null;
	}
}
