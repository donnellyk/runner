/**
 * Trend computations for the terminal charts.
 *
 * - `linearFit`: least-squares regression, for an overall drift/fade line.
 * - `computeDecoupling`: aerobic decoupling (Pa:HR / cardiac drift), the % drop
 *   in efficiency (speed per heartbeat) from the first half to the second half.
 */

export interface LinearFit {
	slope: number;
	intercept: number;
}

/**
 * Least-squares fit of y = slope·x + intercept over the points, skipping paused
 * samples and non-positive y values (gaps). Returns null if under-determined.
 */
export function linearFit(
	xData: number[],
	yData: number[],
	pausedMask?: boolean[] | null,
): LinearFit | null {
	const len = Math.min(xData.length, yData.length);
	let n = 0;
	let sx = 0;
	let sy = 0;
	let sxx = 0;
	let sxy = 0;
	for (let i = 0; i < len; i++) {
		if (pausedMask?.[i]) continue;
		const y = yData[i];
		if (!(y > 0)) continue;
		const x = xData[i];
		n++;
		sx += x;
		sy += y;
		sxx += x * x;
		sxy += x * y;
	}
	if (n < 2) return null;
	const denom = n * sxx - sx * sx;
	if (denom === 0) return null;
	const slope = (n * sxy - sx * sy) / denom;
	const intercept = (sy - slope * sx) / n;
	return { slope, intercept };
}

/**
 * Aerobic decoupling (cardiac drift) as a percentage. Efficiency factor per half
 * = mean speed / mean HR over its moving samples; decoupling is the % the second
 * half's efficiency dropped vs the first. Positive = HR drifted up relative to
 * pace. Scale-invariant in velocity, so distance normalization doesn't affect it.
 */
export function computeDecoupling(
	velocity: number[] | null | undefined,
	heartrate: number[] | null | undefined,
): number | null {
	if (!velocity?.length || !heartrate?.length) return null;
	const len = Math.min(velocity.length, heartrate.length);
	const v: number[] = [];
	const h: number[] = [];
	for (let i = 0; i < len; i++) {
		if (velocity[i] > 0 && heartrate[i] > 0) {
			v.push(velocity[i]);
			h.push(heartrate[i]);
		}
	}
	if (v.length < 20) return null;

	const mid = Math.floor(v.length / 2);
	const ef = (lo: number, hi: number): number => {
		let sv = 0;
		let sh = 0;
		for (let i = lo; i < hi; i++) {
			sv += v[i];
			sh += h[i];
		}
		const count = hi - lo;
		const avgH = sh / count;
		return avgH > 0 ? sv / count / avgH : 0;
	};

	const ef1 = ef(0, mid);
	const ef2 = ef(mid, v.length);
	if (ef1 <= 0) return null;
	return ((ef1 - ef2) / ef1) * 100;
}
