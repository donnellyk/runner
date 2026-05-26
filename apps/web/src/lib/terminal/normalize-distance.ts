import type { StreamData } from './terminal-state.svelte';
import type { ActivityData } from './types';

/**
 * Distance normalization: trust a known total distance (e.g. a race's official
 * distance) and elapsed time, rescaling the distance dimension to match.
 *
 * The scale factor maps the recorded GPS distance onto the target. Applying it
 * to the distance and velocity streams rescales distance and pace while leaving
 * time, heart rate, cadence, etc. untouched. Geometry (latlng) is never scaled.
 */

export function distanceNormFactor(
	target: number | null | undefined,
	gpsTotal: number | null | undefined,
): number {
	if (!target || target <= 0) return 1;
	const gps = gpsTotal ?? 0;
	return gps > 0 ? target / gps : 1;
}

export function normalizeStreams(streams: StreamData, factor: number): StreamData {
	if (factor === 1) return streams;
	return {
		...streams,
		distance: streams.distance ? streams.distance.map((d) => d * factor) : streams.distance,
		velocity: streams.velocity ? streams.velocity.map((v) => v * factor) : streams.velocity,
	};
}

export function normalizeActivity(activity: ActivityData, factor: number): ActivityData {
	if (factor === 1) return activity;
	return {
		...activity,
		distance: activity.distance != null ? activity.distance * factor : activity.distance,
		averageSpeed: activity.averageSpeed != null ? activity.averageSpeed * factor : activity.averageSpeed,
	};
}

/** Last recorded cumulative distance for a stream set, used as the GPS total. */
export function streamGpsTotal(streams: StreamData): number {
	const d = streams.distance;
	return d && d.length > 0 ? d[d.length - 1] : 0;
}
