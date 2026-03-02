export interface SummaryActivity {
  id: number;
  name: string;
  sport_type: string;
  workout_type: number | null;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_latlng: [number, number] | null;
  end_latlng: [number, number] | null;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  has_heartrate: boolean;
  device_name?: string;
  gear_id?: string;
}

export interface DetailedActivity extends SummaryActivity {
  description: string;
  calories: number;
  laps: Lap[];
  device_watts?: boolean;
}

export interface Lap {
  id: number;
  activity: { id: number };
  name: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  start_date: string;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  lap_index: number;
}

export const STREAM_KEYS = [
  'time',
  'distance',
  'latlng',
  'altitude',
  'heartrate',
  'cadence',
  'watts',
  'temp',
  'moving',
  'grade_smooth',
  'velocity_smooth',
] as const;

export type StreamKey = (typeof STREAM_KEYS)[number];

export interface Stream {
  type: StreamKey;
  data: unknown[];
  series_type: string;
  original_size: number;
  resolution: string;
}

export type StreamSet = Stream[];

export interface WebhookEvent {
  object_type: 'activity' | 'athlete';
  aspect_type: 'create' | 'update' | 'delete';
  object_id: number;
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates: Record<string, unknown>;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
