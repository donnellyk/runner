export type ZoneType = 'pace' | 'heartrate';

export interface ZoneDefinition {
  index: number;
  name: string;
  color: string;
  paceMin: number | null;
  paceMax: number | null;
  hrMin: number | null;
  hrMax: number | null;
}

export const DEFAULT_ZONES: ZoneDefinition[] = [
  { index: 1, name: 'Easy',              color: '#93c5fd', paceMin: null, paceMax: 360, hrMin: null, hrMax: 138 },
  { index: 2, name: 'General Aerobic',   color: '#34d399', paceMin: 300,  paceMax: 360, hrMin: 138,  hrMax: 152 },
  { index: 3, name: 'Tempo',             color: '#fcd34d', paceMin: 255,  paceMax: 300, hrMin: 152,  hrMax: 162 },
  { index: 4, name: 'Lactate Threshold', color: '#f97316', paceMin: 210,  paceMax: 255, hrMin: 162,  hrMax: 174 },
  { index: 5, name: 'VO2max',            color: '#ef4444', paceMin: null, paceMax: 210, hrMin: 174,  hrMax: null },
];

export const RACE_DISTANCES = [
  { label: '1 Mile',       meters: 1609  },
  { label: '5K',           meters: 5000  },
  { label: '8K',           meters: 8047  },
  { label: '10K',          meters: 10000 },
  { label: '10 Mile',      meters: 16093 },
  { label: 'Half Marathon', meters: 21097 },
  { label: 'Marathon',     meters: 42195 },
] as const;

const DISTANCE_TOLERANCE = 0.10;

export function raceDistanceBounds(meters: number): { lo: number; hi: number } {
  return { lo: meters * (1 - DISTANCE_TOLERANCE), hi: meters * (1 + DISTANCE_TOLERANCE) };
}

// Adjustments in sec/km to get from race pace → threshold pace
const THRESHOLD_ADJUSTMENTS: Record<string, number> = {
  '1 Mile':        25,
  '5K':            15,
  '8K':            12,
  '10K':            8,
  '10 Mile':        2,
  'Half Marathon': -5,
  'Marathon':     -25,
};

export function estimateThresholdPace(distanceLabel: string, avgPaceSecPerKm: number): number {
  const adj = THRESHOLD_ADJUSTMENTS[distanceLabel] ?? 0;
  return avgPaceSecPerKm + adj;
}

export function zonesFromThresholdPace(thresholdPace: number, existingZones: ZoneDefinition[]): ZoneDefinition[] {
  const T = thresholdPace;
  return existingZones.map(z => {
    switch (z.index) {
      case 1: return { ...z, paceMin: T + 75, paceMax: null };
      case 2: return { ...z, paceMin: T + 35, paceMax: T + 75 };
      case 3: return { ...z, paceMin: T + 5,  paceMax: T + 35 };
      case 4: return { ...z, paceMin: T - 15, paceMax: T + 5  };
      case 5: return { ...z, paceMin: null,   paceMax: T - 15 };
      default: return z;
    }
  });
}

export function zonesFromLTHR(lthr: number, existingZones: ZoneDefinition[]): ZoneDefinition[] {
  return existingZones.map(z => {
    switch (z.index) {
      case 1: return { ...z, hrMin: null,              hrMax: Math.round(lthr * 0.85) };
      case 2: return { ...z, hrMin: Math.round(lthr * 0.85), hrMax: Math.round(lthr * 0.93) };
      case 3: return { ...z, hrMin: Math.round(lthr * 0.93), hrMax: Math.round(lthr * 1.00) };
      case 4: return { ...z, hrMin: Math.round(lthr * 1.00), hrMax: Math.round(lthr * 1.06) };
      case 5: return { ...z, hrMin: Math.round(lthr * 1.06), hrMax: null };
      default: return z;
    }
  });
}

// LTHR adjustments from average race HR
const LTHR_HR_ADJUSTMENTS: Record<string, number> = {
  '1 Mile':        -10,
  '5K':             -6,
  '8K':             -4,
  '10K':            -3,
  '10 Mile':        -1,
  'Half Marathon':   0,
  'Marathon':        6,
};

export function estimateLTHR(distanceLabel: string, avgHR: number): number {
  const adj = LTHR_HR_ADJUSTMENTS[distanceLabel] ?? 0;
  return Math.round(avgHR + adj);
}

// Priority order for race selection (most reliable LT estimate first)
export const ZONE_CALC_PRIORITY = ['Half Marathon', '10K', '10 Mile', '5K', 'Marathon', '8K', '1 Mile'];
