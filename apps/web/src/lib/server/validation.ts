import { error } from '@sveltejs/kit';

/**
 * Parse an unknown value as a positive integer. Returns null if invalid.
 */
export function parseId(raw: unknown): number | null {
	const num = Number(raw);
	if (!Number.isFinite(num) || num !== Math.floor(num) || num <= 0) return null;
	return num;
}

/**
 * Parse a route param as a positive integer, or throw a 404 error.
 */
export function requireParamId(raw: string | undefined): number {
	const id = parseId(raw);
	if (id == null) error(404, 'Not found');
	return id;
}

/**
 * Require an authenticated user in an API route handler.
 * Throws a 401 HttpError if not logged in, which SvelteKit
 * serializes as a JSON error response for API routes.
 */
export function requireApiUser(locals: App.Locals): NonNullable<App.Locals['user']> {
	if (!locals.user) error(401, 'Unauthorized');
	return locals.user;
}
