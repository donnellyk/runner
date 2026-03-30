import { describe, it, expect } from 'vitest';

// Test the confetti module exports exist and are callable
describe('confetti module', () => {
	it('exports fireConfetti as a function', async () => {
		const mod = await import('./confetti');
		expect(typeof mod.fireConfetti).toBe('function');
	});
});
