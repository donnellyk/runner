import { isLatLngArray, isNumberArray } from './types';
import type {
	StreamData,
	ActivityNote,
	ActivityLap,
	ActivitySegment,
} from './terminal-state.svelte';

export function prepareStreams(streamMap: Record<string, unknown>): StreamData {
	function getStream(type: string): number[] | null {
		const s = streamMap[type];
		return isNumberArray(s) && s.length > 0 ? s : null;
	}

	return {
		velocity: getStream('velocity_smooth'),
		heartrate: getStream('heartrate'),
		altitude: getStream('altitude'),
		cadence: getStream('cadence'),
		power: getStream('watts'),
		grade: getStream('grade_smooth'),
		distance: getStream('distance'),
		time: getStream('time'),
		latlng: (() => {
			const s = streamMap['latlng'];
			return isLatLngArray(s) ? s : null;
		})(),
	};
}

export function prepareNotes(
	notes: Array<{
		id: number;
		distanceStart: number;
		distanceEnd: number | null;
		content: string;
	}>,
): ActivityNote[] {
	return notes.map((n) => ({
		id: n.id,
		distanceStart: n.distanceStart,
		distanceEnd: n.distanceEnd,
		content: n.content,
	}));
}

export function prepareLaps(
	laps: Array<{
		id: number;
		lapIndex: number;
		distance: number | null;
		movingTime: number | null;
		averageSpeed: number | null;
		averageHeartrate: number | null;
		averageCadence: number | null;
	}>,
): ActivityLap[] {
	return laps.map((l) => ({
		id: l.id,
		lapIndex: l.lapIndex,
		distance: l.distance,
		movingTime: l.movingTime,
		averageSpeed: l.averageSpeed,
		averageHeartrate: l.averageHeartrate,
		averageCadence: l.averageCadence,
	}));
}

export function prepareSegments(
	segments: Array<{
		id: number;
		segmentIndex: number;
		distanceStart: number;
		distanceEnd: number;
		avgPace: number | null;
		minPace: number | null;
		maxPace: number | null;
		avgHeartrate: number | null;
		avgCadence: number | null;
		avgPower: number | null;
		elevationGain: number | null;
		elevationLoss: number | null;
	}>,
): ActivitySegment[] {
	return segments.map((s) => ({
		id: s.id,
		segmentIndex: s.segmentIndex,
		distanceStart: s.distanceStart,
		distanceEnd: s.distanceEnd,
		avgPace: s.avgPace,
		minPace: s.minPace,
		maxPace: s.maxPace,
		avgHeartrate: s.avgHeartrate,
		avgCadence: s.avgCadence,
		avgPower: s.avgPower,
		elevationGain: s.elevationGain,
		elevationLoss: s.elevationLoss,
	}));
}
