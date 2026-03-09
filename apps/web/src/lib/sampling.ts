/**
 * Bucket averaging downsampling.
 *
 * Divides the stream into `target` equal buckets, then returns the index of
 * the point in each bucket whose value is closest to the bucket mean.
 *
 * Compared to stride sampling (pick every Nth point), bucket averaging dilutes
 * spikes: a single outlier pulls the bucket mean only slightly, so the selected
 * point tends to be a representative value rather than the spike itself. This
 * produces a cleaner chart without a separate smoothing pass.
 */
export function bucketAvgIndices(ys: number[], target: number): number[] {
	const n = ys.length;
	if (n <= target) return Array.from({ length: n }, (_, i) => i);
	const indices: number[] = [];
	for (let b = 0; b < target; b++) {
		const start = Math.floor((b / target) * n);
		const end = Math.floor(((b + 1) / target) * n);
		let sum = 0;
		for (let i = start; i < end; i++) sum += ys[i];
		const mean = sum / (end - start);
		let bestIdx = start;
		let bestDist = Infinity;
		for (let i = start; i < end; i++) {
			const d = Math.abs(ys[i] - mean);
			if (d < bestDist) { bestDist = d; bestIdx = i; }
		}
		indices.push(bestIdx);
	}
	return indices;
}
