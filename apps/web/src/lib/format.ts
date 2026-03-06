export type Units = 'metric' | 'imperial';

const KM_TO_MI = 0.621371;
const M_TO_FT = 3.28084;
const KM_TO_MI_PACE = 1.60934; // multiply sec/km by this to get sec/mi

export function formatDistance(meters: number | null, units: Units): string {
	if (!meters) return '-';
	if (units === 'imperial') {
		return (meters / 1000 * KM_TO_MI).toFixed(1) + ' mi';
	}
	return (meters / 1000).toFixed(1) + ' km';
}

export function formatDistancePrecise(meters: number | null, units: Units): string {
	if (!meters) return '-';
	if (units === 'imperial') {
		return (meters / 1000 * KM_TO_MI).toFixed(2) + ' mi';
	}
	return (meters / 1000).toFixed(2) + ' km';
}

export function formatElevation(meters: number | null, units: Units): string {
	if (meters == null) return '-';
	if (units === 'imperial') {
		return (meters * M_TO_FT).toFixed(0) + ' ft';
	}
	return meters.toFixed(0) + ' m';
}

/** Convert average speed (m/s) to a pace string like "5:30 min/km" or "8:51 min/mi" */
export function formatPace(averageSpeed: number | null, units: Units): string {
	if (!averageSpeed) return '-';
	// sec/km
	let secPerUnit = 1000 / averageSpeed;
	let label = 'min/km';
	if (units === 'imperial') {
		secPerUnit *= KM_TO_MI_PACE;
		label = 'min/mi';
	}
	const mins = Math.floor(secPerUnit / 60);
	const secs = Math.round(secPerUnit % 60);
	return `${mins}:${String(secs).padStart(2, '0')} ${label}`;
}

/** Format a pace value in sec/km (e.g. from segments) to "5:30 /km" or converted to "/mi" */
export function formatPaceValue(secPerKm: number | null, units: Units): string {
	if (secPerKm == null) return '-';
	let secPerUnit = secPerKm;
	let label = '/km';
	if (units === 'imperial') {
		secPerUnit *= KM_TO_MI_PACE;
		label = '/mi';
	}
	const mins = Math.floor(secPerUnit / 60);
	const secs = Math.round(secPerUnit % 60);
	return `${mins}:${String(secs).padStart(2, '0')} ${label}`;
}

/** Format segment distance (meters) as a rounded number string */
export function formatSegmentDistance(meters: number | null, units: Units): string {
	if (meters == null) return '-';
	if (units === 'imperial') {
		return (meters * M_TO_FT).toFixed(0);
	}
	return meters.toFixed(0);
}

/** Unit label for segment distance columns */
export function segmentDistanceLabel(units: Units): string {
	return units === 'imperial' ? 'ft' : 'm';
}

/** Format seconds (moving time) as "1h 12m" or "38m" */
export function formatDuration(seconds: number | null): string {
	if (!seconds) return '-';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
	return `${s}s`;
}

/** Format seconds as "H:MM:SS" or "M:SS" */
export function formatDurationClock(seconds: number | null): string {
	if (!seconds) return '-';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const mm = String(m).padStart(2, '0');
	const ss = String(s).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Parse a "M:SS" pace input string into sec/km. Returns null on invalid input. */
export function parsePaceInput(input: string): number | null {
	const match = input.match(/^(\d+):(\d{2})$/);
	if (!match) return null;
	const secs = parseInt(match[2]);
	if (secs >= 60) return null;
	return parseInt(match[1]) * 60 + secs;
}

/** Format sec/km as "M:SS" string for pace input fields */
export function formatPaceForInput(secPerKm: number | null): string {
	if (secPerKm == null) return '';
	const m = Math.floor(secPerKm / 60);
	const s = Math.round(secPerKm % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}
