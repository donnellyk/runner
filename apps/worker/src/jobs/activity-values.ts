import { mapStravaSportType, mapStravaWorkoutType } from '@web-runner/strava';

interface StravaActivityBase {
  id: number;
  name: string;
  sport_type: string;
  workout_type: number | null;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_latlng?: [number, number] | null;
  end_latlng?: [number, number] | null;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  average_watts?: number | null;
  has_heartrate: boolean;
  device_watts?: boolean;
  device_name?: string | null;
  gear_id?: string | null;
}

export function buildActivityValues(userId: number, act: StravaActivityBase) {
  return {
    externalId: String(act.id),
    source: 'strava' as const,
    userId,
    name: act.name,
    sportType: mapStravaSportType(act.sport_type),
    workoutType: mapStravaWorkoutType(act.workout_type),
    distance: act.distance,
    movingTime: act.moving_time,
    elapsedTime: act.elapsed_time,
    totalElevationGain: act.total_elevation_gain,
    startDate: new Date(act.start_date),
    startLatlng: act.start_latlng ?? null,
    endLatlng: act.end_latlng ?? null,
    averageSpeed: act.average_speed,
    maxSpeed: act.max_speed,
    averageHeartrate: act.average_heartrate ?? null,
    maxHeartrate: act.max_heartrate ?? null,
    averageCadence: act.average_cadence ?? null,
    averageWatts: act.average_watts ?? null,
    hasHeartrate: act.has_heartrate,
    hasPower: act.device_watts ?? ((act.average_watts ?? 0) > 0),
    deviceName: act.device_name ?? null,
    gearId: act.gear_id ?? null,
  };
}

export function buildActivityUpdateSet(userId: number, act: StravaActivityBase) {
  const vals = buildActivityValues(userId, act);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { externalId, source, userId: uid, ...updateFields } = vals;
  return { ...updateFields, updatedAt: new Date() };
}
