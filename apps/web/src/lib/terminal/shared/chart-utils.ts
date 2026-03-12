export const TERM_PAD = { top: 6, bottom: 20, left: 4, right: 42 } as const;

export function findClosestIndex(mouseX: number, xPositions: number[]): number | null {
	if (xPositions.length === 0) return null;
	let closest = 0;
	let minDist = Infinity;
	for (let i = 0; i < xPositions.length; i++) {
		const d = Math.abs(xPositions[i] - mouseX);
		if (d < minDist) { minDist = d; closest = i; }
	}
	return closest;
}
