/**
 * Race split computation for marathon-distance activities.
 *
 * GPS commonly over-measures a certified course (e.g. a 26.2 mi marathon
 * records as 26.4 mi). Rather than leaving a ragged leftover at the end, we
 * distribute that surplus evenly across every split: each nominal split
 * boundary is scaled by `gpsTotal / officialTotal` before being looked up
 * against the recorded distance stream. The split times therefore line up with
 * where the runner actually crossed each course marker.
 */

export const MARATHON_METERS = 42195;
export const HALF_MARATHON_METERS = MARATHON_METERS / 2; // 21097.5

export type SplitChoice = '5k' | '10k' | 'half';

export const SPLIT_CHOICES: { value: SplitChoice; label: string; meters: number }[] = [
	{ value: '5k', label: '5K', meters: 5000 },
	{ value: '10k', label: '10K', meters: 10000 },
	{ value: 'half', label: 'Half', meters: HALF_MARATHON_METERS },
];

export interface RaceSplit {
	index: number; // 1-based
	label: string; // marker reached, e.g. "5K", "10K", "Finish", "1st Half"
	nominalEnd: number; // official cumulative distance at split end (m)
	startDistance: number; // GPS distance at split start (m)
	endDistance: number; // GPS distance at split end (m)
	elapsed: number; // seconds spent within this split
	cumulative: number; // seconds elapsed from the start to the split end
	delta: number | null; // elapsed change vs the previous split (s); null for the first
}

/** Linear-interpolate the elapsed time (s) at a cumulative GPS distance (m). */
export function timeAtDistance(
	distanceStream: number[] | null,
	timeStream: number[] | null,
	target: number,
): number | null {
	if (!distanceStream?.length || !timeStream?.length) return null;
	const n = Math.min(distanceStream.length, timeStream.length);
	if (target <= distanceStream[0]) return timeStream[0];
	if (target >= distanceStream[n - 1]) return timeStream[n - 1];

	for (let i = 1; i < n; i++) {
		if (distanceStream[i] >= target) {
			const d0 = distanceStream[i - 1];
			const d1 = distanceStream[i];
			const t0 = timeStream[i - 1];
			const t1 = timeStream[i];
			if (d1 === d0) return t1;
			const f = (target - d0) / (d1 - d0);
			return t0 + f * (t1 - t0);
		}
	}
	return timeStream[n - 1];
}

function splitLabel(choice: SplitChoice, nominalEnd: number, officialTotal: number, index: number): string {
	if (choice === 'half') return index === 1 ? '1st Half' : '2nd Half';
	if (nominalEnd >= officialTotal - 1e-6) return 'Finish';
	return `${Math.round(nominalEnd / 1000)}K`;
}

export interface ComputeSplitsArgs {
	distanceStream: number[] | null;
	timeStream: number[] | null;
	splitMeters: number;
	choice: SplitChoice;
	officialTotal?: number; // defaults to a full marathon
	gpsTotal: number; // actual recorded distance (m)
}

export function computeRaceSplits({
	distanceStream,
	timeStream,
	splitMeters,
	choice,
	officialTotal = MARATHON_METERS,
	gpsTotal,
}: ComputeSplitsArgs): RaceSplit[] {
	if (!distanceStream?.length || !timeStream?.length) return [];
	if (gpsTotal <= 0 || officialTotal <= 0 || splitMeters <= 0) return [];

	const scale = gpsTotal / officialTotal;
	// Boundary times are interpolated, so round to whole seconds; this keeps
	// each split's elapsed time and the running total mutually consistent.
	const baseTime = Math.round(timeAtDistance(distanceStream, timeStream, 0) ?? timeStream[0]);

	const splits: RaceSplit[] = [];
	let prevNominal = 0;
	let prevGps = 0;
	let prevTime = baseTime;
	let index = 1;

	while (prevNominal < officialTotal - 1e-6) {
		const nominalEnd = Math.min(prevNominal + splitMeters, officialTotal);
		const gpsEnd = nominalEnd * scale;
		const endTime = Math.round(timeAtDistance(distanceStream, timeStream, gpsEnd) ?? prevTime);
		const elapsed = Math.max(0, endTime - prevTime);
		const prev = splits[splits.length - 1];

		splits.push({
			index,
			label: splitLabel(choice, nominalEnd, officialTotal, index),
			nominalEnd,
			startDistance: prevGps,
			endDistance: gpsEnd,
			elapsed,
			cumulative: Math.max(0, endTime - baseTime),
			delta: prev ? elapsed - prev.elapsed : null,
		});

		prevNominal = nominalEnd;
		prevGps = gpsEnd;
		prevTime = endTime;
		index++;
	}

	return splits;
}
