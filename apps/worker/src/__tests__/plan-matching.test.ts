import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handlePlanMatch,
  handlePlanBackfill,
  scoreMatch,
  dayOfWeekInTimezone,
} from '../jobs/plan-matching.js';

// --- Helpers ---

interface MockActivity {
  id: number;
  userId: number;
  startDate: Date;
  distance: number | null;
  sportType: string;
  syncStatus: string;
}

interface MockUser {
  id: number;
  timezone: string;
}

interface MockPlanInstance {
  id: number;
  userId: number;
  sportType: string;
  status: string;
  startDate: Date;
  raceDate: Date;
  name: string;
  effortMap: unknown;
}

interface MockPlanWeek {
  id: number;
  instanceId: number;
  weekNumber: number;
  phase: string;
  startDate: Date;
}

interface MockPlanWorkout {
  id: number;
  weekId: number;
  dayOfWeek: number;
  sortOrder: number;
  category: string;
  name: string;
  targetDistanceMin: number | null;
  targetDistanceMax: number | null;
}

interface MockMatch {
  id: number;
  workoutId: number;
  activityId: number;
  matchType: string;
  confidence: number;
}

interface Store {
  activities: MockActivity[];
  users: MockUser[];
  planInstances: MockPlanInstance[];
  planWeeks: MockPlanWeek[];
  planWorkouts: MockPlanWorkout[];
  planWorkoutMatches: MockMatch[];
}

function camelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function getTableKey(table: unknown): string {
  // Drizzle tables store their name on Symbol.for('drizzle:Name')
  const sym = Symbol.for('drizzle:Name');
  const name = (table as Record<symbol, string>)[sym];
  if (name) return camelCase(name);
  return '';
}

function createMockDb() {
  const store: Store = {
    activities: [],
    users: [],
    planInstances: [],
    planWeeks: [],
    planWorkouts: [],
    planWorkoutMatches: [],
  };

  let nextMatchId = 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    select: (fields?: Record<string, unknown>) => {
      let tableName = '';
      const selectFields = fields ?? null;

      const chain = {
        from: (table: unknown) => {
          tableName = getTableKey(table);
          return chain;
        },
        innerJoin: () => chain,
        where: () => chain,
        then: undefined as unknown,
      };

      chain.then = (resolve: (value: unknown) => void) => {
        const data = (store as unknown as Record<string, unknown[]>)[tableName] ?? [];
        if (selectFields) {
          const projected = data.map((row) => {
            const result: Record<string, unknown> = {};
            for (const alias of Object.keys(selectFields)) {
              result[alias] = (row as Record<string, unknown>)[alias];
            }
            return result;
          });
          resolve(projected);
        } else {
          resolve([...data]);
        }
        return undefined;
      };

      return chain;
    },
    insert: (table: unknown) => {
      const tableName = getTableKey(table);
      return {
        values: (values: Record<string, unknown>) => {
          if (tableName === 'planWorkoutMatches') {
            const match = { id: nextMatchId++, ...values };
            store.planWorkoutMatches.push(match as MockMatch);
          }
          return {
            then: (resolve: (v: unknown) => void) => {
              resolve(undefined);
              return undefined;
            },
          };
        },
      };
    },
  };

  return { db, store };
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createJob(data: Record<string, unknown>): any {
  return { data, id: 'test-job' };
}

// --- Pure function tests ---

describe('scoreMatch', () => {
  it('returns confidence 1.0 for exact distance match', () => {
    const result = scoreMatch(10000, 10000);
    expect(result).toEqual({ confidence: 1, ratio: 1 });
  });

  it('auto-matches when ratio is within 0.80-1.20 range', () => {
    const result = scoreMatch(11000, 10000);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeCloseTo(0.9);
    expect(result!.ratio).toBeCloseTo(1.1);
  });

  it('returns confidence 0.8 at ratio boundary 0.80', () => {
    const result = scoreMatch(8000, 10000);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeCloseTo(0.8);
    expect(result!.ratio).toBeCloseTo(0.8);
  });

  it('returns confidence 0.8 at ratio boundary 1.20', () => {
    const result = scoreMatch(12000, 10000);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeCloseTo(0.8);
    expect(result!.ratio).toBeCloseTo(1.2);
  });

  it('returns lower confidence for suggest range (0.65-0.80)', () => {
    const result = scoreMatch(7000, 10000);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeCloseTo(0.7);
    expect(result!.ratio).toBeCloseTo(0.7);
  });

  it('returns null when ratio is outside 0.65-1.35', () => {
    expect(scoreMatch(6000, 10000)).toBeNull();
    expect(scoreMatch(14000, 10000)).toBeNull();
  });

  it('returns null for zero target distance', () => {
    expect(scoreMatch(10000, 0)).toBeNull();
  });

  it('returns null for negative target distance', () => {
    expect(scoreMatch(10000, -5000)).toBeNull();
  });
});

describe('dayOfWeekInTimezone', () => {
  it('returns correct day of week for UTC', () => {
    // 2026-03-23 is a Monday
    const monday = new Date('2026-03-23T12:00:00Z');
    expect(dayOfWeekInTimezone(monday, 'UTC')).toBe(1);
  });

  it('handles timezone offset where date changes', () => {
    // Late Sunday night UTC is already Monday morning in Tokyo (+9)
    const lateSunday = new Date('2026-03-22T22:00:00Z');
    expect(dayOfWeekInTimezone(lateSunday, 'UTC')).toBe(7); // Sunday
    expect(dayOfWeekInTimezone(lateSunday, 'Asia/Tokyo')).toBe(1); // Monday
  });
});

// --- Integration tests with mocked DB ---

describe('handlePlanMatch', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockDb = createMockDb();
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  /**
   * The mocked DB returns all rows from the store regardless of where clauses.
   * We set up the store to only contain relevant data so handler logic works.
   */
  function setupStoreForMatch(opts: {
    activityDistance: number;
    targetDistance: number;
    activitySport?: string;
    planSport?: string;
    syncStatus?: string;
    activityDate?: Date;
    weekStartDate?: Date;
  }) {
    const activityDate = opts.activityDate ?? new Date('2026-03-25T10:00:00Z'); // Wednesday
    const weekStart = opts.weekStartDate ?? new Date('2026-03-23T00:00:00Z'); // Monday

    mockDb.store.users.push({ id: 1, timezone: 'UTC' });

    mockDb.store.activities.push({
      id: 100,
      userId: 1,
      startDate: activityDate,
      distance: opts.activityDistance,
      sportType: opts.activitySport ?? 'run',
      syncStatus: opts.syncStatus ?? 'complete',
    });

    mockDb.store.planInstances.push({
      id: 10,
      userId: 1,
      sportType: opts.planSport ?? 'run',
      status: 'active',
      startDate: weekStart,
      raceDate: new Date('2026-06-01T00:00:00Z'),
      name: 'Test Plan',
      effortMap: {},
    });

    mockDb.store.planWeeks.push({
      id: 20,
      instanceId: 10,
      weekNumber: 1,
      phase: 'base',
      startDate: weekStart,
    });

    mockDb.store.planWorkouts.push({
      id: 30,
      weekId: 20,
      dayOfWeek: 3, // Wednesday
      sortOrder: 0,
      category: 'easy',
      name: 'Easy Run',
      targetDistanceMin: opts.targetDistance,
      targetDistanceMax: null,
    });
  }

  it('auto-matches activity within 20% of target distance', async () => {
    setupStoreForMatch({
      activityDistance: 9500, // ratio 0.95 -> confidence 0.95
      targetDistance: 10000,
    });

    const job = createJob({ type: 'plan-match', userId: 1, activityId: 100 });
    await handlePlanMatch(job, { db: mockDb.db, logger });

    expect(mockDb.store.planWorkoutMatches).toHaveLength(1);
    expect(mockDb.store.planWorkoutMatches[0]).toMatchObject({
      workoutId: 30,
      activityId: 100,
      matchType: 'auto',
    });
    expect(mockDb.store.planWorkoutMatches[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('does not match activity outside 35% of target distance', async () => {
    setupStoreForMatch({
      activityDistance: 5000, // ratio 0.50 -> outside 0.65-1.35
      targetDistance: 10000,
    });

    const job = createJob({ type: 'plan-match', userId: 1, activityId: 100 });
    await handlePlanMatch(job, { db: mockDb.db, logger });

    expect(mockDb.store.planWorkoutMatches).toHaveLength(0);
  });

  it('does not match when no active plan instance exists', async () => {
    mockDb.store.users.push({ id: 1, timezone: 'UTC' });
    mockDb.store.activities.push({
      id: 100,
      userId: 1,
      startDate: new Date('2026-03-25T10:00:00Z'),
      distance: 10000,
      sportType: 'run',
      syncStatus: 'complete',
    });
    // No plan instances

    const job = createJob({ type: 'plan-match', userId: 1, activityId: 100 });
    await handlePlanMatch(job, { db: mockDb.db, logger });

    expect(mockDb.store.planWorkoutMatches).toHaveLength(0);
  });

  it('does not match activity on a non-workout day', async () => {
    // Activity is on Wednesday but no workouts exist for that day.
    // The real DB would filter by dayOfWeek; our mock returns all rows,
    // so we simulate "no workouts on this day" by having an empty workout list.
    const activityDate = new Date('2026-03-25T10:00:00Z'); // Wednesday
    const weekStart = new Date('2026-03-23T00:00:00Z');

    mockDb.store.users.push({ id: 1, timezone: 'UTC' });
    mockDb.store.activities.push({
      id: 100,
      userId: 1,
      startDate: activityDate,
      distance: 10000,
      sportType: 'run',
      syncStatus: 'complete',
    });

    mockDb.store.planInstances.push({
      id: 10,
      userId: 1,
      sportType: 'run',
      status: 'active',
      startDate: weekStart,
      raceDate: new Date('2026-06-01T00:00:00Z'),
      name: 'Test Plan',
      effortMap: {},
    });

    mockDb.store.planWeeks.push({
      id: 20,
      instanceId: 10,
      weekNumber: 1,
      phase: 'base',
      startDate: weekStart,
    });

    // No workouts at all -- simulates what the DB returns when there's
    // no workout scheduled for Wednesday (the handler queries with dayOfWeek filter)

    const job = createJob({ type: 'plan-match', userId: 1, activityId: 100 });
    await handlePlanMatch(job, { db: mockDb.db, logger });

    expect(mockDb.store.planWorkoutMatches).toHaveLength(0);
  });

  it('creates suggested match when ratio is 0.65-0.80', async () => {
    setupStoreForMatch({
      activityDistance: 7000, // ratio 0.70 -> confidence 0.70
      targetDistance: 10000,
    });

    const job = createJob({ type: 'plan-match', userId: 1, activityId: 100 });
    await handlePlanMatch(job, { db: mockDb.db, logger });

    expect(mockDb.store.planWorkoutMatches).toHaveLength(1);
    expect(mockDb.store.planWorkoutMatches[0]).toMatchObject({
      workoutId: 30,
      activityId: 100,
      matchType: 'suggested',
    });
    expect(mockDb.store.planWorkoutMatches[0].confidence).toBeLessThan(0.8);
  });

  it('does not match when activity sync status is not complete', async () => {
    setupStoreForMatch({
      activityDistance: 10000,
      targetDistance: 10000,
      syncStatus: 'pending',
    });

    const job = createJob({ type: 'plan-match', userId: 1, activityId: 100 });
    await handlePlanMatch(job, { db: mockDb.db, logger });

    expect(mockDb.store.planWorkoutMatches).toHaveLength(0);
  });

  it('does not match when sport type differs', async () => {
    setupStoreForMatch({
      activityDistance: 10000,
      targetDistance: 10000,
      activitySport: 'ride',
      planSport: 'run',
    });

    const job = createJob({ type: 'plan-match', userId: 1, activityId: 100 });
    await handlePlanMatch(job, { db: mockDb.db, logger });

    expect(mockDb.store.planWorkoutMatches).toHaveLength(0);
  });
});

describe('handlePlanBackfill', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockDb = createMockDb();
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  it('backfills matches for past weeks', async () => {
    const weekStart = new Date('2026-03-16T00:00:00Z'); // Past Monday

    mockDb.store.users.push({ id: 1, timezone: 'UTC' });

    mockDb.store.planInstances.push({
      id: 10,
      userId: 1,
      sportType: 'run',
      status: 'active',
      startDate: weekStart,
      raceDate: new Date('2026-06-01T00:00:00Z'),
      name: 'Test Plan',
      effortMap: {},
    });

    mockDb.store.planWeeks.push({
      id: 20,
      instanceId: 10,
      weekNumber: 1,
      phase: 'base',
      startDate: weekStart,
    });

    mockDb.store.planWorkouts.push({
      id: 30,
      weekId: 20,
      dayOfWeek: 3, // Wednesday
      sortOrder: 0,
      category: 'easy',
      name: 'Easy Run',
      targetDistanceMin: 10000,
      targetDistanceMax: null,
    });

    mockDb.store.activities.push({
      id: 100,
      userId: 1,
      startDate: new Date('2026-03-18T10:00:00Z'), // Wednesday
      distance: 10500, // ratio 1.05 -> confidence 0.95
      sportType: 'run',
      syncStatus: 'complete',
    });

    const job = createJob({ type: 'plan-backfill', userId: 1, instanceId: 10 });
    await handlePlanBackfill(job, { db: mockDb.db, logger });

    expect(mockDb.store.planWorkoutMatches).toHaveLength(1);
    expect(mockDb.store.planWorkoutMatches[0]).toMatchObject({
      workoutId: 30,
      activityId: 100,
      matchType: 'auto',
    });
  });

  it('picks closest activity when multiple exist on same day', async () => {
    const weekStart = new Date('2026-03-16T00:00:00Z');

    mockDb.store.users.push({ id: 1, timezone: 'UTC' });

    mockDb.store.planInstances.push({
      id: 10,
      userId: 1,
      sportType: 'run',
      status: 'active',
      startDate: weekStart,
      raceDate: new Date('2026-06-01T00:00:00Z'),
      name: 'Test Plan',
      effortMap: {},
    });

    mockDb.store.planWeeks.push({
      id: 20,
      instanceId: 10,
      weekNumber: 1,
      phase: 'base',
      startDate: weekStart,
    });

    mockDb.store.planWorkouts.push({
      id: 30,
      weekId: 20,
      dayOfWeek: 3,
      sortOrder: 0,
      category: 'tempo',
      name: 'Tempo Run',
      targetDistanceMin: 10000,
      targetDistanceMax: null,
    });

    mockDb.store.activities.push(
      {
        id: 100,
        userId: 1,
        startDate: new Date('2026-03-18T08:00:00Z'),
        distance: 8000, // ratio 0.80 -> confidence 0.80
        sportType: 'run',
        syncStatus: 'complete',
      },
      {
        id: 101,
        userId: 1,
        startDate: new Date('2026-03-18T16:00:00Z'),
        distance: 9800, // ratio 0.98 -> confidence 0.98
        sportType: 'run',
        syncStatus: 'complete',
      },
    );

    const job = createJob({ type: 'plan-backfill', userId: 1, instanceId: 10 });
    await handlePlanBackfill(job, { db: mockDb.db, logger });

    expect(mockDb.store.planWorkoutMatches).toHaveLength(1);
    expect(mockDb.store.planWorkoutMatches[0].activityId).toBe(101);
  });

  it('skips future weeks during backfill', async () => {
    const futureWeekStart = new Date('2026-04-20T00:00:00Z');

    mockDb.store.users.push({ id: 1, timezone: 'UTC' });

    mockDb.store.planInstances.push({
      id: 10,
      userId: 1,
      sportType: 'run',
      status: 'active',
      startDate: futureWeekStart,
      raceDate: new Date('2026-06-01T00:00:00Z'),
      name: 'Test Plan',
      effortMap: {},
    });

    mockDb.store.planWeeks.push({
      id: 20,
      instanceId: 10,
      weekNumber: 1,
      phase: 'base',
      startDate: futureWeekStart,
    });

    mockDb.store.planWorkouts.push({
      id: 30,
      weekId: 20,
      dayOfWeek: 3,
      sortOrder: 0,
      category: 'easy',
      name: 'Easy Run',
      targetDistanceMin: 10000,
      targetDistanceMax: null,
    });

    mockDb.store.activities.push({
      id: 100,
      userId: 1,
      startDate: new Date('2026-04-22T10:00:00Z'),
      distance: 10000,
      sportType: 'run',
      syncStatus: 'complete',
    });

    const job = createJob({ type: 'plan-backfill', userId: 1, instanceId: 10 });
    await handlePlanBackfill(job, { db: mockDb.db, logger });

    expect(mockDb.store.planWorkoutMatches).toHaveLength(0);
  });
});
