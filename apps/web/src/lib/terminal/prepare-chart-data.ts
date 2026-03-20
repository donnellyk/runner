import { formatPaceDisplay, type Units } from '$lib/format';
import { bucketAvgIndices } from '$lib/sampling';

/**
 * Compute downsampling indices using bucket averaging.
 * Returns null if the stream is short enough to display without sampling.
 */
export function prepareSamplingIndices(
	velocity: number[] | null,
	streamLength: number,
	samplePoints: number,
): number[] | null {
	if (streamLength <= samplePoints) return null;
	return bucketAvgIndices(
		velocity ?? Array.from({ length: streamLength }, () => 0),
		samplePoints,
	);
}

/**
 * Sample a stream using precomputed indices.
 * Returns the original stream if indices is null (no downsampling needed).
 */
export function sampleStream<T>(stream: T[] | null, indices: number[] | null): T[] | null {
	if (!stream || !indices) return stream;
	return indices.map((i) => stream[i]);
}

/**
 * Create a boolean mask marking paused data points (velocity below threshold).
 */
export function createPausedMask(
	velocity: number[] | null,
	pauseThreshold: number,
): boolean[] | null {
	return velocity
		? velocity.map((ms) => ms < pauseThreshold)
		: null;
}

/**
 * Extract route coordinates from GeoJSON or a latlng stream.
 * GeoJSON coordinates are [lng, lat]; latlng stream is [lat, lng] so we swap.
 */
export function extractRouteCoordinates(
	routeGeoJson: string | null | undefined,
	latlng: [number, number][] | null,
): [number, number][] | null {
	if (routeGeoJson) {
		try {
			return JSON.parse(routeGeoJson).coordinates;
		} catch {
			return null;
		}
	}
	if (latlng) {
		return latlng.map(([lat, lng]) => [lng, lat]);
	}
	return null;
}

/**
 * Compute formatted crosshair readout values for the sidebar.
 */
export function computeCrosshairValues(
	crosshairIndex: number | null,
	getSampledStream: (source: string) => number[] | null,
	units: Units,
): Record<string, string | null> {
	if (crosshairIndex == null) return {};
	const result: Record<string, string | null> = {};

	const paceData = getSampledStream('pace');
	if (paceData && paceData[crosshairIndex] != null && paceData[crosshairIndex] > 0) {
		result['pace'] = formatPaceDisplay(paceData[crosshairIndex], units);
	}
	const hrData = getSampledStream('heartrate');
	if (hrData && hrData[crosshairIndex] != null) {
		result['heartrate'] = `${Math.round(hrData[crosshairIndex])} bpm`;
	}
	const elevData = getSampledStream('elevation');
	if (elevData && elevData[crosshairIndex] != null) {
		const u = units === 'imperial' ? ' ft' : ' m';
		result['elevation'] = `${Math.round(elevData[crosshairIndex])}${u}`;
	}
	const cadData = getSampledStream('cadence');
	if (cadData && cadData[crosshairIndex] != null) {
		result['cadence'] = `${Math.round(cadData[crosshairIndex])} spm`;
	}
	return result;
}
