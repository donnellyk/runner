import { describe, it, expect } from 'vitest';
import { matchRaceDistance } from './pr-queries';

describe('matchRaceDistance', () => {
	it('matches exact 5K distance', () => {
		expect(matchRaceDistance(5000)).toBe('5K');
	});

	it('matches 5K within 10% tolerance', () => {
		expect(matchRaceDistance(5023)).toBe('5K');
		expect(matchRaceDistance(4510)).toBe('5K');
		expect(matchRaceDistance(5490)).toBe('5K');
	});

	it('matches exact marathon distance', () => {
		expect(matchRaceDistance(42195)).toBe('Marathon');
	});

	it('matches half marathon within tolerance', () => {
		expect(matchRaceDistance(21100)).toBe('Half Marathon');
		expect(matchRaceDistance(21000)).toBe('Half Marathon');
	});

	it('matches 1 mile', () => {
		expect(matchRaceDistance(1609)).toBe('1 Mile');
		expect(matchRaceDistance(1620)).toBe('1 Mile');
	});

	it('matches 10K', () => {
		expect(matchRaceDistance(10000)).toBe('10K');
		expect(matchRaceDistance(10050)).toBe('10K');
	});

	it('matches 8K', () => {
		expect(matchRaceDistance(8047)).toBe('8K');
	});

	it('matches 10 Mile', () => {
		expect(matchRaceDistance(16093)).toBe('10 Mile');
	});

	it('returns null for distance not matching any race', () => {
		expect(matchRaceDistance(3000)).toBeNull();
		expect(matchRaceDistance(7000)).toBeNull();
		expect(matchRaceDistance(13000)).toBeNull();
	});

	it('returns null for very short distances', () => {
		expect(matchRaceDistance(100)).toBeNull();
		expect(matchRaceDistance(0)).toBeNull();
	});

	it('returns null for distances far outside tolerance', () => {
		expect(matchRaceDistance(6000)).toBeNull(); // too far from 5K
		expect(matchRaceDistance(4000)).toBeNull(); // too far from 5K
	});
});
