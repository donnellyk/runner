import { describe, expect, test } from 'vitest';
import { parsePlanYaml, parseDistance, parseDuration, parseDay } from './plan-import';

// ---------------------------------------------------------------------------
// parseDistance
// ---------------------------------------------------------------------------

describe('parseDistance', () => {
	test('parses km', () => {
		expect(parseDistance('8km')).toEqual({ min: 8000, max: 8000 });
		expect(parseDistance('5.5km')).toEqual({ min: 5500, max: 5500 });
	});

	test('parses mi', () => {
		const result = parseDistance('5mi');
		expect(result).toEqual({ min: 5 * 1609.34, max: 5 * 1609.34 });
	});

	test('parses meters', () => {
		expect(parseDistance('800m')).toEqual({ min: 800, max: 800 });
		expect(parseDistance('400m')).toEqual({ min: 400, max: 400 });
	});

	test('parses named distances', () => {
		expect(parseDistance('marathon')).toEqual({ min: 42195, max: 42195 });
		expect(parseDistance('half_marathon')).toEqual({ min: 21097, max: 21097 });
		expect(parseDistance('10k')).toEqual({ min: 10000, max: 10000 });
		expect(parseDistance('5k')).toEqual({ min: 5000, max: 5000 });
	});

	test('parses ranges', () => {
		const result = parseDistance('8-9mi');
		expect(result).toEqual({ min: 8 * 1609.34, max: 9 * 1609.34 });
	});

	test('parses km ranges', () => {
		expect(parseDistance('10-12km')).toEqual({ min: 10000, max: 12000 });
	});

	test('parses meter ranges', () => {
		expect(parseDistance('400-800m')).toEqual({ min: 400, max: 800 });
	});

	test('rejects bare numbers', () => {
		const result = parseDistance('8');
		expect(typeof result).toBe('string');
		expect(result).toContain('unit suffix');
	});

	test('rejects unrecognized format', () => {
		const result = parseDistance('eight miles');
		expect(typeof result).toBe('string');
		expect(result).toContain('Unrecognized');
	});

	test('is case insensitive', () => {
		expect(parseDistance('Marathon')).toEqual({ min: 42195, max: 42195 });
		expect(parseDistance('5KM')).toEqual({ min: 5000, max: 5000 });
	});
});

// ---------------------------------------------------------------------------
// parseDuration
// ---------------------------------------------------------------------------

describe('parseDuration', () => {
	test('parses minutes', () => {
		expect(parseDuration('15min')).toEqual({ min: 900, max: 900 });
		expect(parseDuration('1.5min')).toEqual({ min: 90, max: 90 });
	});

	test('parses seconds', () => {
		expect(parseDuration('90sec')).toEqual({ min: 90, max: 90 });
	});

	test('parses ranges', () => {
		expect(parseDuration('20-30min')).toEqual({ min: 1200, max: 1800 });
	});

	test('parses second ranges', () => {
		expect(parseDuration('60-90sec')).toEqual({ min: 60, max: 90 });
	});

	test('rejects bare numbers', () => {
		const result = parseDuration('15');
		expect(typeof result).toBe('string');
		expect(result).toContain('unit suffix');
	});

	test('rejects unrecognized format', () => {
		const result = parseDuration('fifteen minutes');
		expect(typeof result).toBe('string');
		expect(result).toContain('Unrecognized');
	});
});

// ---------------------------------------------------------------------------
// parseDay
// ---------------------------------------------------------------------------

describe('parseDay', () => {
	test('parses day names to ISO 1-7', () => {
		expect(parseDay('mon')).toBe(1);
		expect(parseDay('tue')).toBe(2);
		expect(parseDay('wed')).toBe(3);
		expect(parseDay('thu')).toBe(4);
		expect(parseDay('fri')).toBe(5);
		expect(parseDay('sat')).toBe(6);
		expect(parseDay('sun')).toBe(7);
	});

	test('parses ISO numbers (1-7) as-is', () => {
		expect(parseDay(1)).toBe(1); // Mon
		expect(parseDay(2)).toBe(2); // Tue
		expect(parseDay(7)).toBe(7); // Sun
	});

	test('rejects invalid numbers', () => {
		expect(typeof parseDay(0)).toBe('string');
		expect(typeof parseDay(8)).toBe('string');
		expect(typeof parseDay(1.5)).toBe('string');
	});

	test('rejects invalid names', () => {
		expect(typeof parseDay('monday')).toBe('string');
		expect(typeof parseDay('foo')).toBe('string');
	});

	test('is case insensitive', () => {
		expect(parseDay('Mon')).toBe(1);
		expect(parseDay('THU')).toBe(4);
	});
});

// ---------------------------------------------------------------------------
// parsePlanYaml — full plan
// ---------------------------------------------------------------------------

const PFITZ_YAML = `
name: "Pfitz 18/55"
race_distance: marathon
sport_type: run

weeks:
  - week: 17
    phase: base
    workouts:
      - day: 1
        name: "Recovery"
        distance: 5mi
        effort: easy
      - day: 3
        name: "LT Run"
        distance: 9mi
        targets:
          - duration: 20min
            effort: lt
      - day: 6
        name: "Long Run"
        distance: 14mi
        effort: ga

  - week: 10
    phase: build
    workouts:
      - day: 2
        name: "VO2max Intervals"
        distance: 8mi
        targets:
          - type: warmup
            duration: 15min
            effort: easy
          - type: interval
            repeat: 6
            distance: 800m
            effort: vo2max
            recovery_distance: 400m
          - type: cooldown
            duration: 10min
            effort: easy
      - day: 4
        name: "Race Pace"
        distance: 14mi
        effort: marathon
      - day: 6
        name: "Long Run"
        distance: 20mi

  - week: 2
    phase: taper
    workouts:
      - day: 2
        name: "Easy"
        distance: 6mi
        effort: easy
      - day: 4
        name: "Easy"
        distance: 5mi
        effort: easy
      - day: 6
        name: "Shakeout"
        distance: 4mi
        effort: easy

  - week: 0
    phase: race
    workouts:
      - day: 7
        name: "Race Day"
        category: race
        distance: marathon
`;

describe('parsePlanYaml — full plan', () => {
	test('parses Pfitz example successfully', () => {
		const result = parsePlanYaml(PFITZ_YAML);
		expect('errors' in result).toBe(false);
		if ('errors' in result) return;

		expect(result.name).toBe('Pfitz 18/55');
		expect(result.sportType).toBe('run');
		expect(result.raceDistance).toBe(42195);
		expect(result.weeks).toHaveLength(4);
	});

	test('extracts correct week numbers and phases', () => {
		const result = parsePlanYaml(PFITZ_YAML);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		expect(result.weeks.map((w) => w.weekNumber)).toEqual([17, 10, 2, 0]);
		expect(result.weeks.map((w) => w.phase)).toEqual(['base', 'build', 'taper', 'race']);
	});

	test('parses workout distances to meters', () => {
		const result = parsePlanYaml(PFITZ_YAML);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		const recovery = result.weeks[0].workouts[0];
		expect(recovery.targetDistanceMin).toBeCloseTo(5 * 1609.34, 1);
		expect(recovery.targetDistanceMax).toBeCloseTo(5 * 1609.34, 1);
	});

	test('parses target steps with intervals', () => {
		const result = parsePlanYaml(PFITZ_YAML);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		const vo2 = result.weeks[1].workouts[0];
		expect(vo2.targets).toHaveLength(3);
		expect(vo2.targets![0].type).toBe('warmup');
		expect(vo2.targets![0].durationMin).toBe(900); // 15min
		expect(vo2.targets![1].type).toBe('interval');
		expect(vo2.targets![1].repeat).toBe(6);
		expect(vo2.targets![1].distanceMin).toBe(800);
		expect(vo2.targets![1].recoveryDistance).toBe(400);
		expect(vo2.targets![2].type).toBe('cooldown');
	});

	test('defaults category to easy when effort is present', () => {
		const result = parsePlanYaml(PFITZ_YAML);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		const recovery = result.weeks[0].workouts[0];
		expect(recovery.category).toBe('easy');
		expect(recovery.effort).toBe('easy');
	});

	test('defaults category to rest when no effort and no category', () => {
		const result = parsePlanYaml(PFITZ_YAML);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		// Long Run in build week has no effort and no category
		const longRun = result.weeks[1].workouts[2];
		expect(longRun.category).toBe('rest');
		expect(longRun.effort).toBeNull();
	});

	test('preserves explicit category', () => {
		const result = parsePlanYaml(PFITZ_YAML);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		const raceDay = result.weeks[3].workouts[0];
		expect(raceDay.category).toBe('race');
	});

	test('parses race distance for named distance workout', () => {
		const result = parsePlanYaml(PFITZ_YAML);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		const raceDay = result.weeks[3].workouts[0];
		expect(raceDay.targetDistanceMin).toBe(42195);
		expect(raceDay.targetDistanceMax).toBe(42195);
	});
});

// ---------------------------------------------------------------------------
// parsePlanYaml — effort slug extraction
// ---------------------------------------------------------------------------

describe('parsePlanYaml — effort slugs', () => {
	test('collects unique effort slugs from workouts and targets', () => {
		const result = parsePlanYaml(PFITZ_YAML);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		expect(result.effortSlugs).toEqual(['easy', 'ga', 'lt', 'marathon', 'vo2max']);
	});

	test('returns sorted unique slugs', () => {
		const yaml = `
name: "Test"
race_distance: 5k
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "W1"
        distance: 5km
        effort: z_effort
      - day: 2
        name: "W2"
        distance: 5km
        effort: a_effort
      - day: 3
        name: "W3"
        distance: 5km
        effort: z_effort
`;
		const result = parsePlanYaml(yaml);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		expect(result.effortSlugs).toEqual(['a_effort', 'z_effort']);
	});
});

// ---------------------------------------------------------------------------
// parsePlanYaml — day names
// ---------------------------------------------------------------------------

describe('parsePlanYaml — day name parsing', () => {
	test('accepts day names in workouts', () => {
		const yaml = `
name: "Day Name Plan"
race_distance: 5k
weeks:
  - week: 0
    phase: race
    workouts:
      - day: thu
        name: "Thursday Run"
        distance: 5km
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		expect(result.weeks[0].workouts[0].dayOfWeek).toBe(4); // thu = 4 (ISO 8601)
	});
});

// ---------------------------------------------------------------------------
// parsePlanYaml — validation errors
// ---------------------------------------------------------------------------

describe('parsePlanYaml — validation errors', () => {
	test('missing week 0', () => {
		const yaml = `
name: "No Race Week"
weeks:
  - week: 1
    phase: base
    workouts:
      - day: 1
        name: "Run"
        distance: 5km
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('week 0'))).toBe(true);
	});

	test('empty weeks array', () => {
		const yaml = `
name: "Empty"
weeks: []
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('at least one week'))).toBe(true);
	});

	test('week with no workouts', () => {
		const yaml = `
name: "No Workouts"
weeks:
  - week: 0
    phase: race
    workouts: []
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('at least one workout'))).toBe(true);
	});

	test('invalid category', () => {
		const yaml = `
name: "Bad Category"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Run"
        category: sprinting
        distance: 5km
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('invalid category'))).toBe(true);
	});

	test('invalid phase', () => {
		const yaml = `
name: "Bad Phase"
weeks:
  - week: 0
    phase: warmup
    workouts:
      - day: 1
        name: "Run"
        distance: 5km
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('invalid phase'))).toBe(true);
	});

	test('bare number distance rejected', () => {
		const yaml = `
name: "Bare Number"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Run"
        distance: 5
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('unit suffix'))).toBe(true);
	});

	test('missing name field', () => {
		const yaml = `
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Run"
        distance: 5km
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('Missing required field: name'))).toBe(true);
	});

	test('invalid YAML syntax', () => {
		const result = parsePlanYaml('name: [\ninvalid:');
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('YAML parse error'))).toBe(true);
	});

	test('duplicate week numbers', () => {
		const yaml = `
name: "Dupes"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Run"
        distance: 5km
        effort: easy
  - week: 0
    phase: race
    workouts:
      - day: 2
        name: "Run 2"
        distance: 5km
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('Duplicate week number'))).toBe(true);
	});

	test('invalid day value', () => {
		const yaml = `
name: "Bad Day"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 9
        name: "Run"
        distance: 5km
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('Invalid day number'))).toBe(true);
	});

	test('invalid target type', () => {
		const yaml = `
name: "Bad Target"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Run"
        distance: 5km
        targets:
          - type: sprint
            duration: 10min
            effort: easy
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(true);
		if (!('errors' in result)) return;
		expect(result.errors.some((e) => e.includes('invalid target type'))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// parsePlanYaml — edge cases
// ---------------------------------------------------------------------------

describe('parsePlanYaml — edge cases', () => {
	test('single week, single workout', () => {
		const yaml = `
name: "Minimal"
race_distance: 5k
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 7
        name: "Race"
        category: race
        distance: 5k
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(false);
		if ('errors' in result) return;

		expect(result.weeks).toHaveLength(1);
		expect(result.weeks[0].workouts).toHaveLength(1);
		expect(result.raceDistance).toBe(5000);
	});

	test('no race_distance is allowed', () => {
		const yaml = `
name: "No Race"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Run"
        distance: 5km
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		expect('errors' in result).toBe(false);
		if ('errors' in result) return;

		expect(result.raceDistance).toBeNull();
	});

	test('sport_type defaults to run', () => {
		const yaml = `
name: "Default Sport"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Run"
        distance: 5km
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		expect(result.sportType).toBe('run');
	});

	test('workout with duration instead of distance', () => {
		const yaml = `
name: "Duration Plan"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Easy Jog"
        duration: 30min
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		const wo = result.weeks[0].workouts[0];
		expect(wo.targetDurationMin).toBe(1800);
		expect(wo.targetDurationMax).toBe(1800);
		expect(wo.targetDistanceMin).toBeNull();
	});

	test('workout with duration range', () => {
		const yaml = `
name: "Duration Range"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Easy Jog"
        duration: 30-45min
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		const wo = result.weeks[0].workouts[0];
		expect(wo.targetDurationMin).toBe(1800);
		expect(wo.targetDurationMax).toBe(2700);
	});

	test('week description is captured', () => {
		const yaml = `
name: "Described"
weeks:
  - week: 0
    phase: race
    description: "Race week!"
    workouts:
      - day: 7
        name: "Race"
        category: race
        distance: marathon
`;
		const result = parsePlanYaml(yaml);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		expect(result.weeks[0].description).toBe('Race week!');
	});

	test('workout description is captured', () => {
		const yaml = `
name: "Workout Desc"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Easy"
        description: "Keep it relaxed"
        distance: 5km
        effort: easy
`;
		const result = parsePlanYaml(yaml);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		expect(result.weeks[0].workouts[0].description).toBe('Keep it relaxed');
	});

	test('distance range stores min and max separately', () => {
		const yaml = `
name: "Range Test"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "LT"
        distance: 8-9mi
        effort: lt
`;
		const result = parsePlanYaml(yaml);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		const wo = result.weeks[0].workouts[0];
		expect(wo.targetDistanceMin).toBeCloseTo(8 * 1609.34, 1);
		expect(wo.targetDistanceMax).toBeCloseTo(9 * 1609.34, 1);
	});

	test('targets with recovery_duration', () => {
		const yaml = `
name: "Recovery Duration"
weeks:
  - week: 0
    phase: race
    workouts:
      - day: 1
        name: "Intervals"
        distance: 8km
        targets:
          - type: interval
            repeat: 4
            distance: 1km
            effort: lt
            recovery_duration: 90sec
`;
		const result = parsePlanYaml(yaml);
		if ('errors' in result) throw new Error(result.errors.join(', '));

		const target = result.weeks[0].workouts[0].targets![0];
		expect(target.recoveryDuration).toBe(90);
	});
});
