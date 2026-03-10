import { MI_TO_M, type Units } from '$lib/format';

export interface AxisBounds {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
	yRange: number;
}

export function computeYBounds(
	smoothData: number[],
	pausedMask: boolean[] | null,
): { yMin: number; yMax: number } {
	if (pausedMask) {
		const vals = smoothData.filter((v, i) => v > 0 && !pausedMask[i]);
		if (vals.length === 0) return { yMin: 0, yMax: 1 };
		const lo = Math.min(...vals);
		const hi = Math.max(...vals);
		const pad = Math.max((hi - lo) * 0.05, 5);
		return { yMin: Math.max(0, lo - pad), yMax: hi + pad };
	}
	const vals = smoothData.filter((v) => v > 0);
	if (vals.length === 0) return { yMin: 0, yMax: 1 };
	return { yMin: Math.min(...vals), yMax: Math.max(...vals) };
}

export function smoothStream(
	data: number[],
	window: number,
	pausedMask: boolean[] | null,
): number[] {
	if (window === 0) return data.slice();
	return data.map((_, i) => {
		const lo = Math.max(0, i - window);
		const hi = Math.min(data.length - 1, i + window);
		let sum = 0, count = 0;
		for (let j = lo; j <= hi; j++) {
			if (!pausedMask || !pausedMask[j]) {
				sum += data[j];
				count++;
			}
		}
		return count > 0 ? sum / count : data[i];
	});
}

export function trimLeadingZeros(data: number[]): number {
	return data.findIndex((v) => v !== 0);
}

export function formatXLabel(value: number, xAxis: 'distance' | 'time', units: Units): string {
	if (xAxis === 'distance') {
		return units === 'imperial'
			? `${(value / MI_TO_M).toFixed(2)} mi`
			: `${(value / 1000).toFixed(2)} km`;
	}
	return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

export function formatXLabelShort(value: number, xAxis: 'distance' | 'time', units: Units): string {
	if (xAxis === 'distance') {
		return units === 'imperial'
			? `${(value / MI_TO_M).toFixed(1)} mi`
			: `${(value / 1000).toFixed(1)} km`;
	}
	return `${Math.floor(value / 60)}m`;
}

export function computePauseSegments(
	pausedMask: boolean[],
): { segs: { startIdx: number; endIdx: number }[]; } {
	const segs: { startIdx: number; endIdx: number }[] = [];
	let start = -1;
	for (let i = 0; i <= pausedMask.length; i++) {
		const paused = i >= pausedMask.length || pausedMask[i];
		if (!paused && start === -1) start = i;
		if (paused && start !== -1) {
			segs.push({ startIdx: start, endIdx: i - 1 });
			start = -1;
		}
	}
	return { segs: segs.filter((seg) => seg.startIdx <= seg.endIdx) };
}
