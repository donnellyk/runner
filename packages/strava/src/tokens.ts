import { eq, and } from 'drizzle-orm';
import type { Database } from '@web-runner/db/client';
import { oauthAccounts } from '@web-runner/db/schema';
import type { TokenResponse } from './types.js';

const REFRESH_BUFFER_MS = 10 * 60 * 1000;

export async function getValidToken(db: Database, userId: number): Promise<string | null> {
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

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are required');
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
    }),
  });

  if (!res.ok) {
    return null;
  }

  const tokens = (await res.json()) as TokenResponse;

  await db.update(oauthAccounts)
    .set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expires_at * 1000),
    })
    .where(eq(oauthAccounts.id, account.id));

  return tokens.access_token;
}
