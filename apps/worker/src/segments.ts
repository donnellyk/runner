const SEGMENT_DISTANCE = 500;

interface SegmentData {
  segmentIndex: number;
  distanceStart: number;
  distanceEnd: number;
  duration: number | null;
  avgPace: number | null;
  minPace: number | null;
  maxPace: number | null;
  avgHeartrate: number | null;
  minHeartrate: number | null;
  maxHeartrate: number | null;
  avgCadence: number | null;
  minCadence: number | null;
  maxCadence: number | null;
  avgPower: number | null;
  minPower: number | null;
  maxPower: number | null;
  elevationGain: number | null;
  elevationLoss: number | null;
  routeWkt: string | null;
}

interface StreamData {
  distance?: number[];
  time?: number[];
  latlng?: [number, number][];
  heartrate?: number[];
  cadence?: number[];
  watts?: number[];
  altitude?: number[];
  velocity_smooth?: number[];
}

export function computeSegments(streams: StreamData): SegmentData[] {
  const { distance, time, latlng, heartrate, cadence, watts, altitude, velocity_smooth } = streams;
  if (!distance || distance.length === 0) return [];

  const totalDistance = distance[distance.length - 1];
  if (totalDistance < 1) return [];

  const segments: SegmentData[] = [];
  let segStart = 0;

  for (let segIdx = 0; segStart < distance.length - 1; segIdx++) {
    const distStart = segIdx * SEGMENT_DISTANCE;
    const distEnd = Math.min((segIdx + 1) * SEGMENT_DISTANCE, totalDistance);

    let segEnd = segStart;
    while (segEnd < distance.length - 1 && distance[segEnd] < distEnd) {
      segEnd++;
    }

    if (segEnd <= segStart && segStart < distance.length - 1) {
      segEnd = segStart + 1;
    }

    const indices = Array.from({ length: segEnd - segStart + 1 }, (_, i) => segStart + i);

    let duration: number | null = null;
    if (time) {
      duration = time[segEnd] - time[segStart];
    }

    const segDist = distance[segEnd] - distance[segStart];

    let avgPace: number | null = null;
    let minPace: number | null = null;
    let maxPace: number | null = null;

    if (duration != null && segDist > 0) {
      avgPace = (duration / segDist) * 1000;
    }

    if (velocity_smooth) {
      const paces = indices
        .map((i) => velocity_smooth[i])
        .filter((v) => v > 0)
        .map((v) => 1000 / v);
      if (paces.length > 0) {
        minPace = Math.min(...paces);
        maxPace = Math.max(...paces);
        if (avgPace == null) {
          avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
        }
      }
    }

    const hrStats = computeStats(heartrate, indices);
    const cadStats = computeStats(cadence, indices);
    const powStats = computeStats(watts, indices);

    let elevationGain: number | null = null;
    let elevationLoss: number | null = null;
    if (altitude) {
      elevationGain = 0;
      elevationLoss = 0;
      for (let i = segStart + 1; i <= segEnd && i < altitude.length; i++) {
        const diff = altitude[i] - altitude[i - 1];
        if (diff > 0) elevationGain += diff;
        else elevationLoss += Math.abs(diff);
      }
    }

    let routeWkt: string | null = null;
    if (latlng) {
      const points = indices
        .filter((i) => i < latlng.length)
        .map((i) => latlng[i])
        .filter((p) => p != null);
      if (points.length >= 2) {
        const coords = points.map(([lat, lng]) => `${lng} ${lat}`).join(',');
        routeWkt = `SRID=4326;LINESTRING(${coords})`;
      }
    }

    segments.push({
      segmentIndex: segIdx,
      distanceStart: distStart,
      distanceEnd: distEnd,
      duration,
      avgPace,
      minPace,
      maxPace,
      avgHeartrate: hrStats?.avg ?? null,
      minHeartrate: hrStats?.min ?? null,
      maxHeartrate: hrStats?.max ?? null,
      avgCadence: cadStats?.avg ?? null,
      minCadence: cadStats?.min ?? null,
      maxCadence: cadStats?.max ?? null,
      avgPower: powStats?.avg ?? null,
      minPower: powStats?.min ?? null,
      maxPower: powStats?.max ?? null,
      elevationGain,
      elevationLoss,
      routeWkt,
    });

    segStart = segEnd;
    if (distance[segEnd] >= totalDistance) break;
  }

  return segments;
}

function computeStats(
  data: number[] | undefined,
  indices: number[],
): { avg: number; min: number; max: number } | null {
  if (!data) return null;
  const values = indices.map((i) => data[i]).filter((v) => v != null && v > 0);
  if (values.length === 0) return null;
  return {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function buildRouteWkt(latlng: [number, number][]): string | null {
  if (latlng.length < 2) return null;
  const coords = latlng.map(([lat, lng]) => `${lng} ${lat}`).join(',');
  return `SRID=4326;LINESTRING(${coords})`;
}
