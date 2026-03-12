import type { Units } from '$lib/format';
import { KM_TO_MI_PACE } from '$lib/format';
import { findIndexAtDistance } from '$lib/streams';
import type { ActivitySegment, ActivityLap } from './terminal-state.svelte';


export interface CandleData {
	index: number;
	open: number;
	close: number;
	high: number;
	low: number;
	label: string;
	distanceStart: number;
	distanceEnd: number;
}

function candleFromStream(
	velocityStream: number[],
	distanceStream: number[],
	distanceStart: number,
	distanceEnd: number,
	factor: number,
	wickPercentile: number,
): { open: number; close: number; high: number; low: number } | null {
	const startIdx = findIndexAtDistance(distanceStream, distanceStart);
	const endIdx = findIndexAtDistance(distanceStream, distanceEnd);
	if (startIdx >= endIdx) return null;
	const quarterLen = Math.max(1, Math.floor((endIdx - startIdx) / 4));
	const { min, max } = percentilePaceFromVelocity(velocityStream, startIdx, endIdx, wickPercentile);
	return {
		open: avgPaceFromVelocity(velocityStream, startIdx, startIdx + quarterLen) * factor,
		close: avgPaceFromVelocity(velocityStream, endIdx - quarterLen, endIdx) * factor,
		high: min * factor,
		low: max * factor,
	};
}

export function candlesFromSegments(
	segments: ActivitySegment[],
	velocityStream: number[] | null,
	distanceStream: number[] | null,
	units: Units,
	wickPercentile = 1,
): CandleData[] {
	const factor = units === 'imperial' ? KM_TO_MI_PACE : 1;

	return segments.filter((s) => s.avgPace != null && s.avgPace > 0).map((seg, i) => {
		const avg = (seg.avgPace ?? 0) * factor;
		let open = avg;
		let close = avg;
		let high = (seg.minPace != null ? seg.minPace : Math.min(open, close) * 0.95) * factor;
		let low = (seg.maxPace != null ? seg.maxPace : Math.max(open, close) * 1.05) * factor;

		if (velocityStream && distanceStream) {
			const stream = candleFromStream(velocityStream, distanceStream, seg.distanceStart, seg.distanceEnd, factor, wickPercentile);
			if (stream) ({ open, close, high, low } = stream);
		}

		return {
			index: i,
			open,
			close,
			high,
			low,
			label: `${i + 1}`,
			distanceStart: seg.distanceStart,
			distanceEnd: seg.distanceEnd,
		};
	});
}

export function candlesFromLaps(
	laps: ActivityLap[],
	velocityStream: number[] | null,
	distanceStream: number[] | null,
	units: Units,
	wickPercentile = 1,
): CandleData[] {
	const factor = units === 'imperial' ? KM_TO_MI_PACE : 1;
	let cumulativeDist = 0;

	return laps.filter((l) => l.distance != null && l.distance > 0).map((lap, i) => {
		const speed = lap.averageSpeed ?? 0;
		const avg = speed > 0 ? (1000 / speed) * factor : 0;
		let open = avg;
		let close = avg;
		let high = Math.min(open, close) * 0.95;
		let low = Math.max(open, close) * 1.05;

		const lapStart = cumulativeDist;
		const lapEnd = cumulativeDist + (lap.distance ?? 0);

		if (velocityStream && distanceStream) {
			const stream = candleFromStream(velocityStream, distanceStream, lapStart, lapEnd, factor, wickPercentile);
			if (stream) ({ open, close, high, low } = stream);
		}

		cumulativeDist = lapEnd;

		return {
			index: i,
			open,
			close,
			high,
			low,
			label: `${i + 1}`,
			distanceStart: lapStart,
			distanceEnd: cumulativeDist,
		};
	});
}

function percentilePaceFromVelocity(velocity: number[], start: number, end: number, pct: number): { min: number; max: number } {
	const paces: number[] = [];
	for (let i = start; i <= end && i < velocity.length; i++) {
		if (velocity[i] > 0) paces.push(1000 / velocity[i]);
	}
	if (paces.length === 0) return { min: 0, max: 0 };
	paces.sort((a, b) => a - b);
	const lo = paces[Math.floor(paces.length * (pct / 100))];
	const hi = paces[Math.ceil(paces.length * (1 - pct / 100)) - 1];
	return { min: lo, max: hi };
}

function avgPaceFromVelocity(velocity: number[], start: number, end: number): number {
	let sum = 0;
	let count = 0;
	for (let i = start; i < end && i < velocity.length; i++) {
		if (velocity[i] > 0) {
			sum += 1000 / velocity[i];
			count++;
		}
	}
	return count > 0 ? sum / count : 0;
}
