import { XMLParser } from 'fast-xml-parser';
import type { ParsedActivity, ParsedStreams, ParsedSessionSummary } from './parsed-activity.js';

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

function haversineDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

interface RawTrkpt {
	'@_lat'?: string | number;
	'@_lon'?: string | number;
	ele?: number | string;
	time?: string;
	extensions?: {
		'gpxtpx:TrackPointExtension'?: {
			'gpxtpx:hr'?: number | string;
			'gpxtpx:cad'?: number | string;
		};
	};
}

function toNum(val: number | string | undefined): number | null {
	if (val === undefined || val === null) return null;
	const n = Number(val);
	return isFinite(n) ? n : null;
}

function computeSummary(streams: ParsedStreams): ParsedSessionSummary {
	const { time, distance, altitude, heartrate, cadence, velocity_smooth } = streams;

	const startDate = streams.time && streams.time.length > 0
		? null // we derive from the raw time strings below; pass via caller if needed
		: null;

	const elapsedTime =
		time && time.length >= 2 ? time[time.length - 1] - time[0] : null;

	const totalDistance =
		distance && distance.length > 0 ? distance[distance.length - 1] : null;

	// Elevation gain / loss
	let totalElevationGain: number | null = null;
	let totalElevationLoss: number | null = null;
	if (altitude && altitude.length >= 2) {
		let gain = 0;
		let loss = 0;
		for (let i = 1; i < altitude.length; i++) {
			const delta = altitude[i] - altitude[i - 1];
			if (delta > 0) gain += delta;
			else loss += Math.abs(delta);
		}
		totalElevationGain = gain;
		totalElevationLoss = loss;
	}

	// Averages
	const avg = (arr: number[] | null): number | null => {
		if (!arr || arr.length === 0) return null;
		return arr.reduce((s, v) => s + v, 0) / arr.length;
	};
	const max = (arr: number[] | null): number | null => {
		if (!arr || arr.length === 0) return null;
		let m = arr[0];
		for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
		return m;
	};

	const averageSpeed = avg(velocity_smooth);
	const maxSpeed = max(velocity_smooth);
	const averageHeartrate = avg(heartrate);
	const maxHeartrate = max(heartrate);
	const averageCadence = avg(cadence);

	return {
		startDate,
		elapsedTime,
		movingTime: elapsedTime,
		distance: totalDistance,
		totalElevationGain,
		totalElevationLoss,
		averageSpeed,
		maxSpeed,
		averageHeartrate,
		maxHeartrate,
		averageCadence,
		averageWatts: null,
		deviceName: null,
	};
}

export function parseGpxFile(xml: string): ParsedActivity {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@_',
	});
	const parsed = parser.parse(xml);

	const gpx = parsed?.gpx;

	// trk may be a single object or an array (multiple tracks)
	const trkRaw = gpx?.trk;
	const trkArray: { trkseg?: unknown }[] = !trkRaw
		? []
		: Array.isArray(trkRaw)
			? trkRaw
			: [trkRaw];

	// Flatten all trksegs from all tracks; each trkseg may itself be an array
	let rawPoints: RawTrkpt[] = [];
	for (const trk of trkArray) {
		const trksegRaw = trk?.trkseg;
		if (!trksegRaw) continue;
		const trksegArray = Array.isArray(trksegRaw) ? trksegRaw : [trksegRaw];
		for (const seg of trksegArray) {
			const trkpt = (seg as { trkpt?: unknown }).trkpt;
			if (!trkpt) continue;
			const pts: RawTrkpt[] = Array.isArray(trkpt) ? trkpt : [trkpt];
			rawPoints = rawPoints.concat(pts);
		}
	}

	if (rawPoints.length === 0) {
		const empty: ParsedStreams = {
			time: null,
			distance: null,
			latlng: null,
			altitude: null,
			heartrate: null,
			cadence: null,
			watts: null,
			velocity_smooth: null,
		};
		return {
			streams: empty,
			laps: [],
			summary: computeSummary(empty),
		};
	}

	// Parse timestamps into epoch seconds (relative to first point)
	const epochMs: (number | null)[] = rawPoints.map((pt) =>
		pt.time ? new Date(pt.time).getTime() : null,
	);

	const firstEpoch = epochMs.find((t) => t !== null) ?? null;
	const startDate = firstEpoch !== null ? new Date(firstEpoch) : null;

	const timeStream: number[] | null = epochMs.every((t) => t !== null)
		? (epochMs as number[]).map((t) => (t - firstEpoch!) / 1000)
		: null;

	// latlng stream
	const latlngStream: [number, number][] | null = (() => {
		const pairs: [number, number][] = [];
		for (const pt of rawPoints) {
			const lat = toNum(pt['@_lat']);
			const lon = toNum(pt['@_lon']);
			if (lat === null || lon === null) return null;
			pairs.push([lat, lon]);
		}
		return pairs;
	})();

	// altitude stream
	const altitudeStream: number[] | null = (() => {
		const vals: number[] = [];
		for (const pt of rawPoints) {
			const v = toNum(pt.ele);
			if (v === null) return null;
			vals.push(v);
		}
		return vals;
	})();

	// heartrate stream (optional — return null if none present)
	const heartrateStream: number[] | null = (() => {
		const vals: number[] = [];
		let hasAny = false;
		for (const pt of rawPoints) {
			const hr = toNum(
				pt.extensions?.['gpxtpx:TrackPointExtension']?.['gpxtpx:hr'],
			);
			if (hr !== null) {
				hasAny = true;
				vals.push(hr);
			} else {
				vals.push(0); // placeholder, replaced below if hasAny
			}
		}
		return hasAny ? vals : null;
	})();

	// cadence stream (optional)
	const cadenceStream: number[] | null = (() => {
		const vals: number[] = [];
		let hasAny = false;
		for (const pt of rawPoints) {
			const cad = toNum(
				pt.extensions?.['gpxtpx:TrackPointExtension']?.['gpxtpx:cad'],
			);
			if (cad !== null) {
				hasAny = true;
				vals.push(cad);
			} else {
				vals.push(0);
			}
		}
		return hasAny ? vals : null;
	})();

	// distance stream via haversine
	const distanceStream: number[] | null = latlngStream
		? (() => {
				const d: number[] = [0];
				for (let i = 1; i < latlngStream.length; i++) {
					const [lat1, lon1] = latlngStream[i - 1];
					const [lat2, lon2] = latlngStream[i];
					d.push(d[i - 1] + haversineDistance(lat1, lon1, lat2, lon2));
				}
				return d;
			})()
		: null;

	// velocity_smooth: distance delta / time delta (m/s)
	const velocityStream: number[] | null =
		distanceStream && timeStream
			? (() => {
					const v: number[] = [0];
					for (let i = 1; i < distanceStream.length; i++) {
						const dt = timeStream[i] - timeStream[i - 1];
						const dd = distanceStream[i] - distanceStream[i - 1];
						v.push(dt > 0 ? dd / dt : 0);
					}
					return v;
				})()
			: null;

	const streams: ParsedStreams = {
		time: timeStream,
		distance: distanceStream,
		latlng: latlngStream,
		altitude: altitudeStream,
		heartrate: heartrateStream,
		cadence: cadenceStream,
		watts: null,
		velocity_smooth: velocityStream,
	};

	const summary = computeSummary(streams);
	// Patch startDate from parsed timestamps
	summary.startDate = startDate;

	return { streams, laps: [], summary };
}
