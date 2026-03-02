import { eq, and } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { oauthAccounts } from '@web-runner/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();

	const [account] = await db
		.select({
			provider: oauthAccounts.provider,
			providerUserId: oauthAccounts.providerUserId,
			expiresAt: oauthAccounts.expiresAt,
		})
		.from(oauthAccounts)
		.where(and(
			eq(oauthAccounts.userId, locals.user!.id),
			eq(oauthAccounts.provider, 'strava'),
		));

	return {
		stravaAccount: account ?? null,
	};
};
