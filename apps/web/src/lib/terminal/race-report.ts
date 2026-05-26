/**
 * Race Report markdown generator.
 *
 * Produces a writeup template seeded with real split data computed the same way
 * the Terminal sidebar does (see {@link computeRaceSplits}): a Goals table, a
 * first/second-half splits table, and a per-10km "Plan" with split and elapsed
 * times. Times are wall-clock durations, so the output is unit-independent and
 * the distance labels are always in kilometres.
 */

import { formatDurationClock } from '$lib/format';
import { computeRaceSplits, MARATHON_METERS, type RaceSplit } from './marathon-splits';

export interface RaceReportArgs {
	distanceStream: number[] | null;
	timeStream: number[] | null;
	/** Known official race distance (m). Defaults to a full marathon. */
	officialTotal?: number;
	/** Actual recorded GPS distance (m). */
	gpsTotal: number;
}

const GOAL_ROWS = ['A', 'B', 'C'];
const HALF_LABELS = ['First Half', 'Second Half'];
/** Plan headers step every 10km, regardless of the split distance used elsewhere. */
const PLAN_SPLIT_METERS = 10000;

/** Header label for a 10km plan segment, e.g. "Start - 10km", "40km - Finish". */
function planLabel(split: RaceSplit, prevNominal: number, isFirst: boolean): string {
	const startKm = Math.round(prevNominal / 1000);
	const endKm = Math.round(split.nominalEnd / 1000);
	if (isFirst) return `Start - ${endKm}km`;
	if (split.label === 'Finish') return `${startKm}km - Finish`;
	return `${startKm}km - ${endKm}km`;
}

export function generateRaceReport({
	distanceStream,
	timeStream,
	officialTotal = MARATHON_METERS,
	gpsTotal,
}: RaceReportArgs): string {
	const halfSplits = computeRaceSplits({
		distanceStream,
		timeStream,
		splitMeters: officialTotal / 2,
		choice: 'half',
		officialTotal,
		gpsTotal,
	});
	const planSplits = computeRaceSplits({
		distanceStream,
		timeStream,
		splitMeters: PLAN_SPLIT_METERS,
		choice: '10k',
		officialTotal,
		gpsTotal,
	});

	const lines: string[] = [];

	lines.push('## Race Writeup', '');

	lines.push('### Goals', '');
	lines.push('| Goal | Description | Completed |');
	lines.push('| --- | --- | --- |');
	for (const goal of GOAL_ROWS) {
		lines.push(`| ${goal} |  |  |`);
	}
	lines.push('');

	lines.push('### Splits', '');
	lines.push('| Split | Time | Total |');
	lines.push('| --- | --- | --- |');
	halfSplits.forEach((split, i) => {
		const label = HALF_LABELS[i] ?? split.label;
		// Only the second half carries a total — the full elapsed race time.
		const total = i === halfSplits.length - 1 ? formatDurationClock(split.cumulative) : '';
		lines.push(`| ${label} | ${formatDurationClock(split.elapsed)} | ${total} |`);
	});
	lines.push('');

	lines.push('## Race Report', '');
	lines.push('### Training', '');
	lines.push('### Final Week', '');
	lines.push('### Race Day', '');
	lines.push('#### Morning', '');
	lines.push('#### Plan', '');

	let prevNominal = 0;
	planSplits.forEach((split, i) => {
		const label = planLabel(split, prevNominal, i === 0);
		const splitTime = formatDurationClock(split.elapsed);
		const elapsed = formatDurationClock(split.cumulative);
		lines.push(`#### ${label}, ${splitTime} (${elapsed})`, '');
		prevNominal = split.nominalEnd;
	});

	return lines.join('\n').trimEnd() + '\n';
}
