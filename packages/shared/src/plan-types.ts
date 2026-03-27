import { RACE_DISTANCES } from './zones.js';

export const WORKOUT_CATEGORIES = [
	'easy',
	'long_run',
	'tempo',
	'intervals',
	'recovery',
	'hills',
	'fartlek',
	'progression',
	'race_pace',
	'cross_training',
	'rest',
	'race',
] as const;

export type WorkoutCategory = (typeof WORKOUT_CATEGORIES)[number];

export const PLAN_PHASES = ['base', 'build', 'peak', 'taper', 'race'] as const;

export type PlanPhase = (typeof PLAN_PHASES)[number];

// Keyed by label from RACE_DISTANCES for reference — meters sourced from zones.ts
const _marathonEntry = RACE_DISTANCES.find((d) => d.label === 'Marathon')!;
const _halfEntry = RACE_DISTANCES.find((d) => d.label === 'Half Marathon')!;
const _10kEntry = RACE_DISTANCES.find((d) => d.label === '10K')!;
const _5kEntry = RACE_DISTANCES.find((d) => d.label === '5K')!;
const _1miEntry = RACE_DISTANCES.find((d) => d.label === '1 Mile')!;

export const DISTANCE_ALIASES: Record<string, number> = {
	marathon: _marathonEntry.meters,
	half_marathon: _halfEntry.meters,
	'10k': _10kEntry.meters,
	'5k': _5kEntry.meters,
	'1mi': _1miEntry.meters,
};

export interface EffortMapEntry {
	paceMin: number | null;
	paceMax: number | null;
	hrMin?: number | null;
	hrMax?: number | null;
}

export type EffortMap = Record<string, EffortMapEntry>;

export interface SupplementaryWorkout {
	name: string;
	timesPerWeek: number;
	description?: string;
}

export interface TargetStep {
	type?: 'warmup' | 'cooldown' | 'interval';
	repeat?: number;
	distanceMin?: number;
	distanceMax?: number;
	durationMin?: number;
	durationMax?: number;
	effort?: string;
	description?: string;
	recoveryDistance?: number;
	recoveryDuration?: number;
}
