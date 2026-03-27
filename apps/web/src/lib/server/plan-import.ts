import { parse as parseYaml } from 'yaml';
import {
	WORKOUT_CATEGORIES,
	PLAN_PHASES,
	DISTANCE_ALIASES,
	type TargetStep,
	type WorkoutCategory,
	type PlanPhase,
	type SupplementaryWorkout,
} from '@web-runner/shared';

export interface ParsedPlan {
	name: string;
	sportType: string;
	raceDistance: number | null;
	weeks: ParsedWeek[];
	effortSlugs: string[];
}

export interface ParsedWeek {
	weekNumber: number;
	phase: string;
	description?: string;
	supplementary: SupplementaryWorkout[];
	workouts: ParsedWorkout[];
}

export interface ParsedWorkout {
	dayOfWeek: number; // ISO 8601: 1=Mon, 7=Sun
	category: string;
	name: string;
	description?: string;
	targetDistanceMin: number | null;
	targetDistanceMax: number | null;
	targetDurationMin: number | null;
	targetDurationMax: number | null;
	effort: string | null;
	targets: TargetStep[] | null;
}

const MI_TO_M = 1609.34;
const KM_TO_M = 1000;

const DAY_NAMES: Record<string, number> = {
	mon: 1,
	tue: 2,
	wed: 3,
	thu: 4,
	fri: 5,
	sat: 6,
	sun: 7,
};

/**
 * Parse a distance string into meters. Returns [min, max] for ranges.
 * Accepts: `8km`, `5mi`, `800m`, `marathon`, `half_marathon`, `10k`, `5k`, `8-9mi`
 */
export function parseDistance(str: string): { min: number; max: number } | string {
	const s = String(str).trim().toLowerCase();

	// Named distances
	if (s in DISTANCE_ALIASES) {
		const meters = DISTANCE_ALIASES[s];
		return { min: meters, max: meters };
	}

	// Range: 8-9mi, 5-6km, 400-800m
	const rangeMatch = s.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(mi|km|m)$/);
	if (rangeMatch) {
		const lo = parseFloat(rangeMatch[1]);
		const hi = parseFloat(rangeMatch[2]);
		const unit = rangeMatch[3];
		const factor = unit === 'mi' ? MI_TO_M : unit === 'km' ? KM_TO_M : 1;
		if (lo <= 0 || hi <= 0) return `Distance values must be positive: "${str}"`;
		return { min: lo * factor, max: hi * factor };
	}

	// Single value: 8km, 5mi, 800m
	const singleMatch = s.match(/^(\d+(?:\.\d+)?)\s*(mi|km|m)$/);
	if (singleMatch) {
		const val = parseFloat(singleMatch[1]);
		const unit = singleMatch[2];
		const factor = unit === 'mi' ? MI_TO_M : unit === 'km' ? KM_TO_M : 1;
		if (val <= 0) return `Distance must be positive: "${str}"`;
		return { min: val * factor, max: val * factor };
	}

	// Bare number — reject
	if (/^\d+(\.\d+)?$/.test(s)) {
		return `Distance must include a unit suffix (km, mi, m) or be a named distance: "${str}"`;
	}

	return `Unrecognized distance format: "${str}"`;
}

/**
 * Parse a duration string into seconds. Returns [min, max] for ranges.
 * Accepts: `15min`, `90sec`, `20-30min`
 */
export function parseDuration(str: string): { min: number; max: number } | string {
	const s = String(str).trim().toLowerCase();

	// Range: 20-30min, 60-90sec
	const rangeMatch = s.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(min|sec)$/);
	if (rangeMatch) {
		const lo = parseFloat(rangeMatch[1]);
		const hi = parseFloat(rangeMatch[2]);
		const unit = rangeMatch[3];
		const factor = unit === 'min' ? 60 : 1;
		if (lo <= 0 || hi <= 0) return `Duration values must be positive: "${str}"`;
		return { min: lo * factor, max: hi * factor };
	}

	// Single value: 15min, 90sec
	const singleMatch = s.match(/^(\d+(?:\.\d+)?)\s*(min|sec)$/);
	if (singleMatch) {
		const val = parseFloat(singleMatch[1]);
		const unit = singleMatch[2];
		const factor = unit === 'min' ? 60 : 1;
		if (val <= 0) return `Duration must be positive: "${str}"`;
		return { min: val * factor, max: val * factor };
	}

	// Bare number — reject
	if (/^\d+(\.\d+)?$/.test(s)) {
		return `Duration must include a unit suffix (min, sec): "${str}"`;
	}

	return `Unrecognized duration format: "${str}"`;
}

/**
 * Parse a day value to 0-6 (0=Mon, 6=Sun).
 * Accepts: names (mon-sun) or ISO numbers (1-7).
 */
export function parseDay(val: unknown): number | string {
	if (typeof val === 'number') {
		if (val >= 1 && val <= 7 && Number.isInteger(val)) {
			return val; // ISO 8601: 1=Mon, 7=Sun
		}
		return `Invalid day number: ${val} (must be 1-7)`;
	}
	if (typeof val === 'string') {
		const lower = val.trim().toLowerCase();
		if (lower in DAY_NAMES) {
			return DAY_NAMES[lower];
		}
		return `Unrecognized day name: "${val}" (expected mon-sun)`;
	}
	return `Invalid day value: ${String(val)}`;
}

function isValidCategory(cat: string): cat is WorkoutCategory {
	return (WORKOUT_CATEGORIES as readonly string[]).includes(cat);
}

function isValidPhase(phase: string): phase is PlanPhase {
	return (PLAN_PHASES as readonly string[]).includes(phase);
}

function parseTargetStep(
	raw: Record<string, unknown>,
	errors: string[],
	weekNum: number,
	effortSlugs: Set<string>,
): TargetStep | null {
	const step: TargetStep = {};

	if (raw.type != null) {
		const t = String(raw.type);
		if (t !== 'warmup' && t !== 'cooldown' && t !== 'interval') {
			errors.push(`Week ${weekNum}: invalid target type "${t}" (expected warmup, cooldown, interval)`);
			return null;
		}
		step.type = t;
	}

	if (raw.repeat != null) {
		const r = Number(raw.repeat);
		if (!Number.isInteger(r) || r <= 0) {
			errors.push(`Week ${weekNum}: repeat must be a positive integer`);
			return null;
		}
		step.repeat = r;
	}

	if (raw.distance != null) {
		const d = parseDistance(String(raw.distance));
		if (typeof d === 'string') {
			errors.push(`Week ${weekNum} target: ${d}`);
			return null;
		}
		step.distanceMin = d.min;
		step.distanceMax = d.max;
	}

	if (raw.duration != null) {
		const d = parseDuration(String(raw.duration));
		if (typeof d === 'string') {
			errors.push(`Week ${weekNum} target: ${d}`);
			return null;
		}
		step.durationMin = d.min;
		step.durationMax = d.max;
	}

	if (raw.effort != null) {
		step.effort = String(raw.effort);
		effortSlugs.add(step.effort);
	}

	if (raw.description != null) {
		step.description = String(raw.description);
	}

	if (raw.recovery_distance != null) {
		const d = parseDistance(String(raw.recovery_distance));
		if (typeof d === 'string') {
			errors.push(`Week ${weekNum} target: ${d}`);
			return null;
		}
		step.recoveryDistance = d.min;
	}

	if (raw.recovery_duration != null) {
		const d = parseDuration(String(raw.recovery_duration));
		if (typeof d === 'string') {
			errors.push(`Week ${weekNum} target: ${d}`);
			return null;
		}
		step.recoveryDuration = d.min;
	}

	return step;
}

export function parsePlanYaml(yamlStr: string): ParsedPlan | { errors: string[] } {
	let doc: unknown;
	try {
		doc = parseYaml(yamlStr);
	} catch (e) {
		return { errors: [`YAML parse error: ${(e as Error).message}`] };
	}

	if (doc == null || typeof doc !== 'object') {
		return { errors: ['YAML must be a mapping at the top level'] };
	}

	const raw = doc as Record<string, unknown>;
	const errors: string[] = [];

	// Top-level fields
	if (!raw.name || typeof raw.name !== 'string') {
		errors.push('Missing required field: name');
	}

	const sportType = raw.sport_type ? String(raw.sport_type) : 'run';

	let raceDistance: number | null = null;
	if (raw.race_distance != null) {
		const d = parseDistance(String(raw.race_distance));
		if (typeof d === 'string') {
			errors.push(`race_distance: ${d}`);
		} else {
			raceDistance = d.min;
		}
	}

	// Weeks
	if (!Array.isArray(raw.weeks) || raw.weeks.length === 0) {
		errors.push('Plan must have at least one week');
		return { errors };
	}

	const effortSlugs = new Set<string>();
	const weeks: ParsedWeek[] = [];
	const seenWeekNumbers = new Set<number>();

	for (const rawWeek of raw.weeks) {
		if (rawWeek == null || typeof rawWeek !== 'object') {
			errors.push('Each week must be a mapping');
			continue;
		}

		const w = rawWeek as Record<string, unknown>;

		if (w.week == null || typeof w.week !== 'number' || !Number.isInteger(w.week) || w.week < 0) {
			errors.push(`Invalid or missing week number: ${String(w.week)} (must be a non-negative integer)`);
			continue;
		}

		const weekNumber = w.week as number;

		if (seenWeekNumbers.has(weekNumber)) {
			errors.push(`Duplicate week number: ${weekNumber}`);
			continue;
		}
		seenWeekNumbers.add(weekNumber);

		if (!w.phase || typeof w.phase !== 'string') {
			errors.push(`Week ${weekNumber}: missing phase`);
			continue;
		}

		if (!isValidPhase(w.phase)) {
			errors.push(
				`Week ${weekNumber}: invalid phase "${w.phase}" (expected ${PLAN_PHASES.join(', ')})`,
			);
			continue;
		}

		if (!Array.isArray(w.workouts) || w.workouts.length === 0) {
			errors.push(`Week ${weekNumber}: must have at least one workout`);
			continue;
		}

		const workouts: ParsedWorkout[] = [];

		for (const rawWorkout of w.workouts) {
			if (rawWorkout == null || typeof rawWorkout !== 'object') {
				errors.push(`Week ${weekNumber}: each workout must be a mapping`);
				continue;
			}

			const wo = rawWorkout as Record<string, unknown>;

			// Day
			if (wo.day == null) {
				errors.push(`Week ${weekNumber}: workout missing day`);
				continue;
			}
			const dayResult = parseDay(wo.day);
			if (typeof dayResult === 'string') {
				errors.push(`Week ${weekNumber}: ${dayResult}`);
				continue;
			}

			// Name
			if (!wo.name || typeof wo.name !== 'string') {
				errors.push(`Week ${weekNumber}: workout missing name`);
				continue;
			}

			// Effort
			const effort = wo.effort != null ? String(wo.effort) : null;
			if (effort) {
				effortSlugs.add(effort);
			}

			// Category — default based on context
			let category: string;
			if (wo.category != null) {
				category = String(wo.category);
			} else if (effort) {
				category = 'easy';
			} else {
				category = 'rest';
			}

			if (!isValidCategory(category)) {
				errors.push(
					`Week ${weekNumber}: invalid category "${category}" (expected ${WORKOUT_CATEGORIES.join(', ')})`,
				);
				continue;
			}

			// Distance
			let targetDistanceMin: number | null = null;
			let targetDistanceMax: number | null = null;
			if (wo.distance != null) {
				const d = parseDistance(String(wo.distance));
				if (typeof d === 'string') {
					errors.push(`Week ${weekNumber}, "${wo.name}": ${d}`);
					continue;
				}
				targetDistanceMin = d.min;
				targetDistanceMax = d.max;
			}

			// Duration
			let targetDurationMin: number | null = null;
			let targetDurationMax: number | null = null;
			if (wo.duration != null) {
				const d = parseDuration(String(wo.duration));
				if (typeof d === 'string') {
					errors.push(`Week ${weekNumber}, "${wo.name}": ${d}`);
					continue;
				}
				targetDurationMin = d.min;
				targetDurationMax = d.max;
			}

			// Targets
			let targets: TargetStep[] | null = null;
			if (wo.targets != null) {
				if (!Array.isArray(wo.targets)) {
					errors.push(`Week ${weekNumber}, "${wo.name}": targets must be an array`);
					continue;
				}
				targets = [];
				let targetFailed = false;
				for (const rawTarget of wo.targets) {
					if (rawTarget == null || typeof rawTarget !== 'object') {
						errors.push(`Week ${weekNumber}, "${wo.name}": each target must be a mapping`);
						targetFailed = true;
						break;
					}
					const step = parseTargetStep(
						rawTarget as Record<string, unknown>,
						errors,
						weekNumber,
						effortSlugs,
					);
					if (step == null) {
						targetFailed = true;
						break;
					}
					targets.push(step);
				}
				if (targetFailed) continue;
			}

			workouts.push({
				dayOfWeek: dayResult,
				category,
				name: wo.name,
				description: wo.description != null ? String(wo.description) : undefined,
				targetDistanceMin,
				targetDistanceMax,
				targetDurationMin,
				targetDurationMax,
				effort,
				targets,
			});
		}

		// Parse supplementary workouts
		const supplementary: SupplementaryWorkout[] = [];
		if (Array.isArray(w.supplementary)) {
			for (const rawSupp of w.supplementary) {
				if (rawSupp == null || typeof rawSupp !== 'object') continue;
				const s = rawSupp as Record<string, unknown>;
				if (!s.name || typeof s.name !== 'string') {
					errors.push(`Week ${weekNumber}: supplementary workout missing name`);
					continue;
				}
				const times = Number(s.times);
				if (!Number.isFinite(times) || times < 1) {
					errors.push(`Week ${weekNumber}: supplementary "${s.name}" must have times >= 1`);
					continue;
				}
				supplementary.push({
					name: s.name,
					timesPerWeek: Math.round(times),
					description: s.description != null ? String(s.description) : undefined,
				});
			}
		}

		weeks.push({
			weekNumber,
			phase: w.phase,
			description: w.description != null ? String(w.description) : undefined,
			supplementary,
			workouts,
		});
	}

	// Week 0 must exist
	if (!seenWeekNumbers.has(0)) {
		errors.push('Plan must include week 0 (race week)');
	}

	if (errors.length > 0) {
		return { errors };
	}

	return {
		name: raw.name as string,
		sportType,
		raceDistance,
		weeks,
		effortSlugs: [...effortSlugs].sort(),
	};
}
