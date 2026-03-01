import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashToken } from '../auth';
import { parseStravaTimezone } from '../strava-utils';

describe('generateSessionToken', () => {
	it('returns a 40-char hex string', () => {
		const token = generateSessionToken();
		expect(token).toMatch(/^[0-9a-f]{40}$/);
	});

	it('returns unique values', () => {
		const a = generateSessionToken();
		const b = generateSessionToken();
		expect(a).not.toBe(b);
	});
});

describe('hashToken', () => {
	it('returns a consistent SHA-256 hex digest', () => {
		const hash = hashToken('test-token');
		expect(hash).toBe(hashToken('test-token'));
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('returns different hashes for different tokens', () => {
		expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
	});
});

describe('parseStravaTimezone', () => {
	it('extracts IANA timezone from Strava format', () => {
		expect(parseStravaTimezone('(GMT-08:00) America/Los_Angeles')).toBe('America/Los_Angeles');
	});

	it('handles positive UTC offset', () => {
		expect(parseStravaTimezone('(GMT+05:30) Asia/Kolkata')).toBe('Asia/Kolkata');
	});

	it('returns UTC for undefined', () => {
		expect(parseStravaTimezone(undefined)).toBe('UTC');
	});

	it('returns UTC for empty string', () => {
		expect(parseStravaTimezone('')).toBe('UTC');
	});

	it('returns UTC for malformed input', () => {
		expect(parseStravaTimezone('garbage')).toBe('UTC');
	});
});
