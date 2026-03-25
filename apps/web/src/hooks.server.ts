import type { Handle } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import {
	validateSessionToken,
	setSessionTokenCookie,
	deleteSessionTokenCookie,
} from '$lib/server/auth';

const DEFAULT_BODY_LIMIT = 512 * 1024; // 512KB — matches SvelteKit's original default
const UPLOAD_ROUTES = ['/api/import/upload'];

export const handle: Handle = async ({ event, resolve }) => {
	// Enforce body size limit on all routes except explicit upload endpoints
	const contentLength = Number(event.request.headers.get('content-length') || 0);
	if (contentLength > DEFAULT_BODY_LIMIT && !UPLOAD_ROUTES.some((r) => event.url.pathname.startsWith(r))) {
		error(413, 'Request body too large');
	}
	const token = event.cookies.get('session') ?? null;

	if (!token) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	const { session, user } = await validateSessionToken(token);

	if (session) {
		setSessionTokenCookie(event, token, session.expiresAt);
	} else {
		deleteSessionTokenCookie(event);
	}

	event.locals.session = session;
	event.locals.user = user;

	return resolve(event);
};
