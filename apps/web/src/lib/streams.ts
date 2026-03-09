export function findIndexAtDistance(distanceData: number[], targetDist: number): number {
	let lo = 0;
	let hi = distanceData.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (distanceData[mid] < targetDist) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}
