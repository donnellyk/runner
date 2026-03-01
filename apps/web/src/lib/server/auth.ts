import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import { sessions, users } from '@web-runner/db/schema';
import type { RequestEvent } from '@sveltejs/kit';

const SESSION_COOKIE_NAME = 'session';
const SESSION_EXPIRY_DAYS = 30;
const SESSION_REFRESH_THRESHOLD_DAYS = 15;

export type SessionUser = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

export interface SessionValidationResult {
  session: Session | null;
  user: SessionUser | null;
}

export function generateSessionToken(): string {
  return randomBytes(20).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(token: string, userId: number): Promise<Session> {
  const db = getDb();
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const [session] = await db.insert(sessions).values({
    id,
    userId,
    expiresAt,
  }).returning();

  return session;
}

export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
  const db = getDb();
  const id = hashToken(token);

  const result = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id));

  if (result.length === 0) {
    return { session: null, user: null };
  }

  const { session, user } = result[0];

  if (Date.now() >= session.expiresAt.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return { session: null, user: null };
  }

  const refreshThreshold = SESSION_REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  if (session.expiresAt.getTime() - Date.now() < refreshThreshold) {
    const newExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await db.update(sessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(sessions.id, id));
    session.expiresAt = newExpiresAt;
  }

  return { session, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date): void {
  event.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function deleteSessionTokenCookie(event: RequestEvent): void {
  event.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}
