import { XMLParser } from 'fast-xml-parser';
import type { ParsedActivity, ParsedLap, ParsedStreams, ParsedSessionSummary } from './parsed-activity.js';

interface TcxTpx {
	'ns3:Speed'?: number;
	'ns3:Watts'?: number;
	Speed?: number;
	Watts?: number;
}

interface TcxLx {
	'ns3:AvgSpeed'?: number;
	'ns3:AvgWatts'?: number;
	'ns3:MaxWatts'?: number;
	AvgSpeed?: number;
	AvgWatts?: number;
	MaxWatts?: number;
}

interface TcxTrackpoint {
	Time?: string;
	Position?: {
		LatitudeDegrees?: number;
		LongitudeDegrees?: number;
	};
	AltitudeMeters?: number;
	DistanceMeters?: number;
	HeartRateBpm?: { Value?: number };
	Cadence?: number;
	Extensions?: {
		'ns3:TPX'?: TcxTpx;
		TPX?: TcxTpx;
	};
}

interface TcxLap {
	'@_StartTime'?: string;
	TotalTimeSeconds?: number;
	DistanceMeters?: number;
	MaximumSpeed?: number;
	Calories?: number;
	AverageHeartRateBpm?: { Value?: number };
	MaximumHeartRateBpm?: { Value?: number };
	Cadence?: number;
	Extensions?: {
		'ns3:LX'?: TcxLx;
		LX?: TcxLx;
	};
	Track?: { Trackpoint?: TcxTrackpoint | TcxTrackpoint[] } | { Trackpoint?: TcxTrackpoint | TcxTrackpoint[] }[];
}

interface TcxActivity {
	'@_Sport'?: string;
	Id?: string;
	Lap?: TcxLap | TcxLap[];
	Creator?: {
		Name?: string;
	};
}

interface TcxRoot {
	TrainingCenterDatabase?: {
		Activities?: {
			Activity?: TcxActivity | TcxActivity[];
		};
	};
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
	if (value == null) return [];
	return Array.isArray(value) ? value : [value];
}

function num(value: unknown): number | null {
	if (value == null) return null;
	const n = Number(value);
	return isFinite(n) ? n : null;
}

function buildStreams(trackpoints: TcxTrackpoint[]): ParsedStreams {
	const time: number[] = [];
	const distance: number[] = [];
	const latlng: [number, number][] = [];
	const altitude: number[] = [];
	const heartrate: number[] = [];
	const cadence: number[] = [];
	const watts: number[] = [];
	const velocity_smooth: number[] = [];

	let hasLatlng = false;
	let hasAltitude = false;
	let hasHeartrate = false;
	let hasCadence = false;
	let hasWatts = false;
	let hasVelocity = false;
	let hasTime = false;
	let hasDistance = false;

	let baseTime: number | null = null;

	for (const tp of trackpoints) {
		const timeStr = tp.Time;
		if (timeStr) {
			const t = new Date(timeStr).getTime();
			if (isFinite(t)) {
				if (baseTime == null) baseTime = t;
				time.push((t - baseTime) / 1000);
				hasTime = true;
			} else {
				time.push(time.length > 0 ? time[time.length - 1] : 0);
			}
		} else {
			time.push(time.length > 0 ? time[time.length - 1] : 0);
		}

		const dist = num(tp.DistanceMeters);
		distance.push(dist ?? (distance.length > 0 ? distance[distance.length - 1] : 0));
		if (dist != null) hasDistance = true;

		const lat = num(tp.Position?.LatitudeDegrees);
		const lng = num(tp.Position?.LongitudeDegrees);
		if (lat != null && lng != null) {
			latlng.push([lat, lng]);
			hasLatlng = true;
		} else {
			latlng.push(latlng.length > 0 ? latlng[latlng.length - 1] : [0, 0]);
		}

		const alt = num(tp.AltitudeMeters);
		altitude.push(alt ?? (altitude.length > 0 ? altitude[altitude.length - 1] : 0));
		if (alt != null) hasAltitude = true;

		const hr = num(tp.HeartRateBpm?.Value);
		heartrate.push(hr ?? (heartrate.length > 0 ? heartrate[heartrate.length - 1] : 0));
		if (hr != null) hasHeartrate = true;

		const cad = num(tp.Cadence);
		cadence.push(cad ?? (cadence.length > 0 ? cadence[cadence.length - 1] : 0));
		if (cad != null) hasCadence = true;

		const ext = tp.Extensions;
		const tpx = ext?.['ns3:TPX'] ?? ext?.TPX;
		const spd = num(tpx?.['ns3:Speed'] ?? tpx?.Speed);
		const pwr = num(tpx?.['ns3:Watts'] ?? tpx?.Watts);

		velocity_smooth.push(spd ?? (velocity_smooth.length > 0 ? velocity_smooth[velocity_smooth.length - 1] : 0));
		if (spd != null) hasVelocity = true;

		watts.push(pwr ?? (watts.length > 0 ? watts[watts.length - 1] : 0));
		if (pwr != null) hasWatts = true;
	}

	return {
		time: hasTime ? time : null,
		distance: hasDistance ? distance : null,
		latlng: hasLatlng ? latlng : null,
		altitude: hasAltitude ? altitude : null,
		heartrate: hasHeartrate ? heartrate : null,
		cadence: hasCadence ? cadence : null,
		watts: hasWatts ? watts : null,
		velocity_smooth: hasVelocity ? velocity_smooth : null,
	};
}

function computeElevationGain(trackpoints: TcxTrackpoint[]): number | null {
	let gain = 0;
	let prev: number | null = null;
	let hasData = false;
	for (const tp of trackpoints) {
		const alt = num(tp.AltitudeMeters);
		if (alt != null) {
			if (prev != null && alt > prev) {
				gain += alt - prev;
			}
			prev = alt;
			hasData = true;
		}
	}
	return hasData ? gain : null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseLaps(rawLaps: TcxLap[], _allTrackpoints: TcxTrackpoint[]): ParsedLap[] {
	return rawLaps.map((lap, index) => {
		const startDate = lap['@_StartTime'] ? new Date(lap['@_StartTime']) : null;
		const elapsedTime = num(lap.TotalTimeSeconds);
		const distance = num(lap.DistanceMeters);
		const maxSpeed = num(lap.MaximumSpeed);
		const avgHr = num(lap.AverageHeartRateBpm?.Value);
		const maxHr = num(lap.MaximumHeartRateBpm?.Value);
		const avgCadence = num(lap.Cadence);

		const lapExt = lap.Extensions;
		const lapLx = lapExt?.['ns3:LX'] ?? lapExt?.LX;
		const avgSpeed = num(lapLx?.['ns3:AvgSpeed'] ?? lapLx?.AvgSpeed) ?? (distance != null && elapsedTime != null && elapsedTime > 0 ? distance / elapsedTime : null);
		const avgWatts = num(lapLx?.['ns3:AvgWatts'] ?? lapLx?.AvgWatts);

		// Collect trackpoints for this lap to compute elevation gain
		const lapTracks = toArray(lap.Track);
		const lapTrackpoints: TcxTrackpoint[] = [];
		for (const track of lapTracks) {
			lapTrackpoints.push(...toArray(track.Trackpoint));
		}
		const elevGain = computeElevationGain(lapTrackpoints);

		return {
			lapIndex: index,
			startDate,
			elapsedTime,
			movingTime: elapsedTime,
			distance,
			totalElevationGain: elevGain,
			averageSpeed: avgSpeed,
			maxSpeed,
			averageHeartrate: avgHr,
			maxHeartrate: maxHr,
			averageCadence: avgCadence,
			averageWatts: avgWatts,
		} satisfies ParsedLap;
	});
}

function computeSummary(laps: ParsedLap[], allTrackpoints: TcxTrackpoint[], activity: TcxActivity): ParsedSessionSummary {
	const startDate = laps.length > 0 ? laps[0].startDate : null;

	const elapsedTime = laps.reduce<number | null>((acc, lap) => {
		if (lap.elapsedTime == null) return acc;
		return (acc ?? 0) + lap.elapsedTime;
	}, null);

	const distance = laps.reduce<number | null>((acc, lap) => {
		if (lap.distance == null) return acc;
		return (acc ?? 0) + lap.distance;
	}, null);

	const totalElevationGain = computeElevationGain(allTrackpoints);

	// Elevation loss
	let elevationLoss: number | null = null;
	let prevAlt: number | null = null;
	let hasAlt = false;
	for (const tp of allTrackpoints) {
		const alt = num(tp.AltitudeMeters);
		if (alt != null) {
			if (prevAlt != null && alt < prevAlt) {
				elevationLoss = (elevationLoss ?? 0) + (prevAlt - alt);
			}
			prevAlt = alt;
			hasAlt = true;
		}
	}
	if (!hasAlt) elevationLoss = null;

	const averageSpeed = distance != null && elapsedTime != null && elapsedTime > 0 ? distance / elapsedTime : null;

	const maxSpeed = laps.reduce<number | null>((acc, lap) => {
		if (lap.maxSpeed == null) return acc;
		return acc == null ? lap.maxSpeed : Math.max(acc, lap.maxSpeed);
	}, null);

	// Weighted average heartrate across laps
	let hrSum = 0;
	let hrWeight = 0;
	let maxHr: number | null = null;
	for (const lap of laps) {
		if (lap.averageHeartrate != null && lap.elapsedTime != null) {
			hrSum += lap.averageHeartrate * lap.elapsedTime;
			hrWeight += lap.elapsedTime;
		}
		if (lap.maxHeartrate != null) {
			maxHr = maxHr == null ? lap.maxHeartrate : Math.max(maxHr, lap.maxHeartrate);
		}
	}
	const averageHeartrate = hrWeight > 0 ? hrSum / hrWeight : null;

	// Weighted average cadence
	let cadSum = 0;
	let cadWeight = 0;
	for (const lap of laps) {
		if (lap.averageCadence != null && lap.elapsedTime != null) {
			cadSum += lap.averageCadence * lap.elapsedTime;
			cadWeight += lap.elapsedTime;
		}
	}
	const averageCadence = cadWeight > 0 ? cadSum / cadWeight : null;

	// Weighted average watts
	let wattSum = 0;
	let wattWeight = 0;
	for (const lap of laps) {
		if (lap.averageWatts != null && lap.elapsedTime != null) {
			wattSum += lap.averageWatts * lap.elapsedTime;
			wattWeight += lap.elapsedTime;
		}
	}
	const averageWatts = wattWeight > 0 ? wattSum / wattWeight : null;

	const deviceName = activity.Creator?.Name ?? null;

	return {
		startDate,
		elapsedTime,
		movingTime: elapsedTime,
		distance,
		totalElevationGain,
		totalElevationLoss: elevationLoss,
		averageSpeed,
		maxSpeed,
		averageHeartrate,
		maxHeartrate: maxHr,
		averageCadence,
		averageWatts,
		deviceName,
	};
}

export function parseTcxFile(xml: string): ParsedActivity {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@_',
		isArray: (_name, _jpath, _isLeafNode, isAttribute) => !isAttribute,
	});

	const root: TcxRoot = parser.parse(xml);
	const activitiesNode = root.TrainingCenterDatabase?.Activities;
	const rawActivities = toArray(activitiesNode?.Activity);
	const activity = rawActivities[0] ?? {};

	const rawLaps = toArray((activity as TcxActivity).Lap);

	// Collect all trackpoints across all laps
	const allTrackpoints: TcxTrackpoint[] = [];
	for (const lap of rawLaps) {
		const tracks = toArray(lap.Track);
		for (const track of tracks) {
			allTrackpoints.push(...toArray(track.Trackpoint));
		}
	}

	const streams = buildStreams(allTrackpoints);
	const laps = parseLaps(rawLaps, allTrackpoints);
	const summary = computeSummary(laps, allTrackpoints, activity as TcxActivity);

	return { streams, laps, summary };
}
