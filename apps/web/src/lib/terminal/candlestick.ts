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
}

export function candlesFromSegments(
	segments: ActivitySegment[],
	velocityStream: number[] | null,
	distanceStream: number[] | null,
	units: Units,
): CandleData[] {
	const factor = units === 'imperial' ? KM_TO_MI_PACE : 1;

	return segments.filter((s) => s.avgPace != null && s.avgPace > 0).map((seg, i) => {
		const avg = (seg.avgPace ?? 0) * factor;
		let open = avg;
		let close = avg;

		if (velocityStream && distanceStream) {
			const startIdx = findIndexAtDistance(distanceStream, seg.distanceStart);
			const endIdx = findIndexAtDistance(distanceStream, seg.distanceEnd);
			if (startIdx < endIdx) {
				const quarterLen = Math.max(1, Math.floor((endIdx - startIdx) / 4));
				open = avgPaceFromVelocity(velocityStream, startIdx, startIdx + quarterLen) * factor;
				close = avgPaceFromVelocity(velocityStream, endIdx - quarterLen, endIdx) * factor;
			}
		}

		const minPace = seg.minPace != null ? seg.minPace * factor : Math.min(open, close) * 0.95;
		const maxPace = seg.maxPace != null ? seg.maxPace * factor : Math.max(open, close) * 1.05;

		return {
			index: i,
			open,
			close,
			high: minPace,
			low: maxPace,
			label: `${i + 1}`,
		};
	});
}

export function candlesFromLaps(
	laps: ActivityLap[],
	velocityStream: number[] | null,
	distanceStream: number[] | null,
	units: Units,
): CandleData[] {
	const factor = units === 'imperial' ? KM_TO_MI_PACE : 1;
	let cumulativeDist = 0;

	return laps.filter((l) => l.distance != null && l.distance > 0).map((lap, i) => {
		const speed = lap.averageSpeed ?? 0;
		const avg = speed > 0 ? (1000 / speed) * factor : 0;
		let open = avg;
		let close = avg;

		if (velocityStream && distanceStream) {
			const startIdx = findIndexAtDistance(distanceStream, cumulativeDist);
			const endDist = cumulativeDist + (lap.distance ?? 0);
			const endIdx = findIndexAtDistance(distanceStream, endDist);
			if (startIdx < endIdx) {
				const quarterLen = Math.max(1, Math.floor((endIdx - startIdx) / 4));
				open = avgPaceFromVelocity(velocityStream, startIdx, startIdx + quarterLen) * factor;
				close = avgPaceFromVelocity(velocityStream, endIdx - quarterLen, endIdx) * factor;
			}
		}

		cumulativeDist += lap.distance ?? 0;

		const high = Math.min(open, close) * 0.95;
		const low = Math.max(open, close) * 1.05;

		return {
			index: i,
			open,
			close,
			high,
			low,
			label: `${i + 1}`,
		};
	});
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
