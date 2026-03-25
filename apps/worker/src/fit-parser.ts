import FitParser from 'fit-file-parser';
import type {
  ParsedActivity,
  ParsedStreams,
  ParsedLap,
  ParsedSessionSummary,
} from './parsed-activity.js';

function nullIfEmpty<T>(arr: T[]): T[] | null {
  return arr.length > 0 ? arr : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStreams(records: any[]): ParsedStreams {
  if (records.length === 0) {
    return {
      time: null, distance: null, latlng: null, altitude: null,
      heartrate: null, cadence: null, watts: null, velocity_smooth: null,
    };
  }

  // Find the first record with a valid timestamp to use as the epoch.
  const firstValidTs = new Date(records.find((r) => r.timestamp != null)?.timestamp).getTime();
  if (isNaN(firstValidTs)) {
    return {
      time: null, distance: null, latlng: null, altitude: null,
      heartrate: null, cadence: null, watts: null, velocity_smooth: null,
    };
  }

  const time: number[] = [];
  const distance: number[] = [];
  const latlng: [number, number][] = [];
  const altitude: number[] = [];
  const heartrate: number[] = [];
  const cadence: number[] = [];
  const watts: number[] = [];
  const velocity_smooth: number[] = [];

  // Track whether each stream has seen at least one real value.
  let hasDistance = false, hasLatlng = false, hasAltitude = false;
  let hasHeartrate = false, hasCadence = false, hasWatts = false, hasVelocity = false;

  // Last-known values for forward-fill.
  let lastDistance = 0;
  let lastLatlng: [number, number] | null = null;
  let lastAltitude = 0;
  let lastHeartrate = 0;
  let lastCadence = 0;
  let lastWatts = 0;
  let lastVelocity = 0;

  for (const r of records) {
    // Skip records without a valid timestamp — they cannot be placed on the time axis.
    if (r.timestamp == null) continue;
    const ts = new Date(r.timestamp).getTime();
    if (isNaN(ts)) continue;

    time.push(Math.round((ts - firstValidTs) / 1000));

    if (r.distance != null) { hasDistance = true; lastDistance = r.distance; }
    distance.push(lastDistance);

    if (r.position_lat != null && r.position_long != null) {
      hasLatlng = true;
      lastLatlng = [r.position_lat, r.position_long];
    }
    // Only start pushing latlng once we have a real coordinate.
    // This keeps latlng aligned with other streams from the first GPS fix onward,
    // but avoids [0,0] entries from records before the fix.
    if (lastLatlng) latlng.push(lastLatlng);

    const alt = r.altitude ?? r.enhanced_altitude;
    if (alt != null) { hasAltitude = true; lastAltitude = alt; }
    altitude.push(lastAltitude);

    if (r.heart_rate != null) { hasHeartrate = true; lastHeartrate = r.heart_rate; }
    heartrate.push(lastHeartrate);

    if (r.cadence != null) { hasCadence = true; lastCadence = r.cadence; }
    cadence.push(lastCadence);

    if (r.power != null) { hasWatts = true; lastWatts = r.power; }
    watts.push(lastWatts);

    const spd = r.speed ?? r.enhanced_speed;
    if (spd != null) { hasVelocity = true; lastVelocity = spd; }
    velocity_smooth.push(lastVelocity);
  }

  return {
    time: nullIfEmpty(time),
    distance: hasDistance ? distance : null,
    latlng: hasLatlng ? latlng : null,
    altitude: hasAltitude ? altitude : null,
    heartrate: hasHeartrate ? heartrate : null,
    cadence: hasCadence ? cadence : null,
    watts: hasWatts ? watts : null,
    velocity_smooth: hasVelocity ? velocity_smooth : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLaps(fitLaps: any[]): ParsedLap[] {
  return fitLaps.map((lap, index) => ({
    lapIndex: index,
    startDate: lap.start_time ? new Date(lap.start_time) : null,
    elapsedTime: lap.total_elapsed_time != null ? Math.round(lap.total_elapsed_time) : null,
    movingTime: lap.total_timer_time != null ? Math.round(lap.total_timer_time) : null,
    distance: lap.total_distance ?? null,
    totalElevationGain: lap.total_ascent ?? null,
    averageSpeed: lap.avg_speed ?? null,
    maxSpeed: lap.max_speed ?? null,
    averageHeartrate: lap.avg_heart_rate ?? null,
    maxHeartrate: lap.max_heart_rate ?? null,
    averageCadence: lap.avg_cadence ?? null,
    averageWatts: lap.avg_power ?? null,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSession(sessions: any[], deviceInfos: any[]): ParsedSessionSummary {
  let deviceName: string | null = null;
  if (deviceInfos && deviceInfos.length > 0) {
    const primary = deviceInfos.find((d: { product_name?: string }) => d.product_name) ?? deviceInfos[0];
    if (primary.product_name) deviceName = primary.product_name;
  }

  const session = sessions?.[0];
  if (!session) {
    return {
      startDate: null, elapsedTime: null, movingTime: null, distance: null,
      totalElevationGain: null, totalElevationLoss: null, averageSpeed: null,
      maxSpeed: null, averageHeartrate: null, maxHeartrate: null,
      averageCadence: null, averageWatts: null, deviceName,
    };
  }

  return {
    startDate: session.start_time ? new Date(session.start_time) : null,
    elapsedTime: session.total_elapsed_time != null ? Math.round(session.total_elapsed_time) : null,
    movingTime: session.total_timer_time != null ? Math.round(session.total_timer_time) : null,
    distance: session.total_distance ?? null,
    totalElevationGain: session.total_ascent ?? null,
    totalElevationLoss: session.total_descent ?? null,
    averageSpeed: session.avg_speed ?? null,
    maxSpeed: session.max_speed ?? null,
    averageHeartrate: session.avg_heart_rate ?? null,
    maxHeartrate: session.max_heart_rate ?? null,
    averageCadence: session.avg_cadence ?? null,
    averageWatts: session.avg_power ?? null,
    deviceName,
  };
}

export async function parseFitFile(buffer: Buffer): Promise<ParsedActivity> {
  const parser = new FitParser({ force: true, speedUnit: 'm/s', lengthUnit: 'm' });
  const data = await parser.parseAsync(buffer.buffer as ArrayBuffer);

  const streams = extractStreams(data.records ?? []);
  const laps = extractLaps(data.laps ?? []);
  const summary = extractSession(data.sessions ?? [], data.device_infos ?? []);

  return { streams, laps, summary };
}
