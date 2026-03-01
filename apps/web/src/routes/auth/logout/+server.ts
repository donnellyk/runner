import { invalidateSession, deleteSessionTokenCookie } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	if (!event.locals.session) {
		return new Response(null, { status: 401 });
	}

	await invalidateSession(event.locals.session.id);
	deleteSessionTokenCookie(event);

	return new Response(null, {
		status: 302,
		headers: { Location: '/auth/login' },
	});
};
