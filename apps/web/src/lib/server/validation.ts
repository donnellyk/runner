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
