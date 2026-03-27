import { eq, and, desc, inArray, gte, lt } from 'drizzle-orm';
import { getDb } from '@web-runner/db/client';
import {
	planTemplates,
	planInstances,
	planWeeks,
	planWorkouts,
	planWorkoutMatches,
	planSupplementaryCompletions,
	activities,
} from '@web-runner/db/schema';
import type { ParsedWeek } from '$lib/server/plan-import';

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listTemplates(userId: number) {
	const db = getDb();
	return db
		.select()
		.from(planTemplates)
		.where(eq(planTemplates.userId, userId))
		.orderBy(desc(planTemplates.createdAt));
}

export async function getTemplate(templateId: number, userId: number) {
	const db = getDb();
	const [row] = await db
		.select()
		.from(planTemplates)
		.where(and(eq(planTemplates.id, templateId), eq(planTemplates.userId, userId)));
	return row ?? null;
}

export async function createTemplate(
	userId: number,
	data: {
		name: string;
		sportType: string;
		raceDistance: number | null;
		weekCount: number;
		sourceYaml: string;
		color?: string;
	},
) {
	const db = getDb();
	const [row] = await db
		.insert(planTemplates)
		.values({
			userId,
			name: data.name,
			sportType: data.sportType,
			raceDistance: data.raceDistance ?? undefined,
			weekCount: data.weekCount,
			sourceYaml: data.sourceYaml,
			color: data.color ?? '#3b82f6',
		})
		.returning({ id: planTemplates.id });
	return row.id;
}

export async function deleteTemplate(templateId: number, userId: number) {
	const db = getDb();
	const result = await db
		.delete(planTemplates)
		.where(and(eq(planTemplates.id, templateId), eq(planTemplates.userId, userId)));
	return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Instances — list / get
// ---------------------------------------------------------------------------

export async function listInstances(userId: number) {
	const db = getDb();
	return db
		.select({
			id: planInstances.id,
			userId: planInstances.userId,
			templateId: planInstances.templateId,
			name: planInstances.name,
			sportType: planInstances.sportType,
			raceDistance: planInstances.raceDistance,
			raceDate: planInstances.raceDate,
			startDate: planInstances.startDate,
			status: planInstances.status,
			color: planInstances.color,
			createdAt: planInstances.createdAt,
			updatedAt: planInstances.updatedAt,
		})
		.from(planInstances)
		.where(eq(planInstances.userId, userId))
		.orderBy(desc(planInstances.createdAt));
}

export async function getInstance(instanceId: number, userId: number) {
	const db = getDb();

	const [instance] = await db
		.select()
		.from(planInstances)
		.where(and(eq(planInstances.id, instanceId), eq(planInstances.userId, userId)));

	if (!instance) return null;

	const weeks = await db
		.select()
		.from(planWeeks)
		.where(eq(planWeeks.instanceId, instanceId))
		.orderBy(planWeeks.weekNumber);

	const weekIds = weeks.map((w) => w.id);

	if (weekIds.length === 0) {
		return { instance, weeks: [] };
	}

	const workoutRows = await db
		.select({
			workout: planWorkouts,
			match: planWorkoutMatches,
			activityDistance: activities.distance,
			activityMovingTime: activities.movingTime,
			activityAverageSpeed: activities.averageSpeed,
			activityName: activities.name,
			activityStartDate: activities.startDate,
		})
		.from(planWorkouts)
		.leftJoin(planWorkoutMatches, eq(planWorkoutMatches.workoutId, planWorkouts.id))
		.leftJoin(activities, eq(activities.id, planWorkoutMatches.activityId))
		.where(inArray(planWorkouts.weekId, weekIds))
		.orderBy(planWorkouts.weekId, planWorkouts.dayOfWeek, planWorkouts.sortOrder);

	const workoutsByWeek = new Map<number, typeof workoutRows>();
	for (const row of workoutRows) {
		const list = workoutsByWeek.get(row.workout.weekId) ?? [];
		list.push(row);
		workoutsByWeek.set(row.workout.weekId, list);
	}

	const weeksWithWorkouts = weeks.map((week) => ({
		...week,
		workouts: workoutsByWeek.get(week.id) ?? [],
	}));

	return { instance, weeks: weeksWithWorkouts };
}

// ---------------------------------------------------------------------------
// Instances — create
// ---------------------------------------------------------------------------

export async function createInstance(
	userId: number,
	data: {
		templateId: number | null;
		name: string;
		sportType: string;
		raceDistance: number | null;
		raceDate: Date;
		startDate: Date;
		effortMap: Record<string, unknown>;
		weeks: ParsedWeek[];
	},
) {
	const db = getDb();

	return db.transaction(async (tx) => {
		const [instanceRow] = await tx
			.insert(planInstances)
			.values({
				userId,
				templateId: data.templateId ?? undefined,
				name: data.name,
				sportType: data.sportType,
				raceDistance: data.raceDistance ?? undefined,
				raceDate: data.raceDate,
				startDate: data.startDate,
				status: 'active',
				effortMap: data.effortMap,
			})
			.returning({ id: planInstances.id });

		const instanceId = instanceRow.id;

		// Compute week start dates relative to the instance start date
		// Weeks are stored in descending order in the YAML (week N = N weeks before race).
		// startDate is the Monday of the first training week (the highest week number).
		// Sort weeks descending by weekNumber so week N maps to offset 0, N-1 to offset 1, etc.
		const sortedWeeks = [...data.weeks].sort((a, b) => b.weekNumber - a.weekNumber);

		for (let i = 0; i < sortedWeeks.length; i++) {
			const parsedWeek = sortedWeeks[i];
			const weekStartDate = new Date(data.startDate);
			weekStartDate.setDate(weekStartDate.getDate() + i * 7);

			const [weekRow] = await tx
				.insert(planWeeks)
				.values({
					instanceId,
					weekNumber: parsedWeek.weekNumber,
					phase: parsedWeek.phase,
					description: parsedWeek.description ?? undefined,
					startDate: weekStartDate,
					supplementary: parsedWeek.supplementary.length > 0 ? parsedWeek.supplementary : undefined,
				})
				.returning({ id: planWeeks.id });

			const weekId = weekRow.id;

			if (parsedWeek.workouts.length > 0) {
				await tx.insert(planWorkouts).values(
					parsedWeek.workouts.map((wo, idx) => ({
						weekId,
						dayOfWeek: wo.dayOfWeek,
						sortOrder: idx,
						category: wo.category,
						name: wo.name,
						description: wo.description ?? undefined,
						targetDistanceMin: wo.targetDistanceMin ?? undefined,
						targetDistanceMax: wo.targetDistanceMax ?? undefined,
						targetDurationMin: wo.targetDurationMin ?? undefined,
						targetDurationMax: wo.targetDurationMax ?? undefined,
						effort: wo.effort ?? undefined,
						targets: wo.targets ?? undefined,
					})),
				);
			}
		}

		return instanceId;
	});
}

// ---------------------------------------------------------------------------
// Instances — update / delete
// ---------------------------------------------------------------------------

export async function updateInstanceStatus(instanceId: number, userId: number, status: string) {
	const db = getDb();

	return db.transaction(async (tx) => {
		// Verify ownership before modifying
		const [existing] = await tx
			.select({ id: planInstances.id })
			.from(planInstances)
			.where(and(eq(planInstances.id, instanceId), eq(planInstances.userId, userId)));

		if (!existing) return false;

		// When activating, archive any currently active plan for this user
		if (status === 'active') {
			await tx
				.update(planInstances)
				.set({ status: 'archived', updatedAt: new Date() })
				.where(
					and(
						eq(planInstances.userId, userId),
						eq(planInstances.status, 'active'),
					),
				);
		}

		await tx
			.update(planInstances)
			.set({ status, updatedAt: new Date() })
			.where(eq(planInstances.id, instanceId));

		return true;
	});
}

export async function deleteInstance(instanceId: number, userId: number) {
	const db = getDb();
	const result = await db
		.delete(planInstances)
		.where(and(eq(planInstances.id, instanceId), eq(planInstances.userId, userId)));
	return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Current week strip — for the activities page
// ---------------------------------------------------------------------------

export async function getActiveInstanceCurrentWeek(userId: number) {
	const db = getDb();

	// Find the user's single active plan instance
	const [instance] = await db
		.select({
			id: planInstances.id,
			startDate: planInstances.startDate,
			effortMap: planInstances.effortMap,
		})
		.from(planInstances)
		.where(and(eq(planInstances.userId, userId), eq(planInstances.status, 'active')))
		.limit(1);

	if (!instance) return null;

	// Find the week that contains today
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const allWeeks = await db
		.select()
		.from(planWeeks)
		.where(eq(planWeeks.instanceId, instance.id))
		.orderBy(planWeeks.weekNumber);

	let currentWeek: (typeof allWeeks)[number] | null = null;
	for (const week of allWeeks) {
		const weekStart = new Date(week.startDate);
		weekStart.setHours(0, 0, 0, 0);
		const weekEnd = new Date(weekStart);
		weekEnd.setDate(weekStart.getDate() + 7);
		if (today >= weekStart && today < weekEnd) {
			currentWeek = week;
			break;
		}
	}

	if (!currentWeek) return null;

	// Load workouts for that week with match + activity data
	const workoutRows = await db
		.select({
			workout: planWorkouts,
			match: planWorkoutMatches,
			activityDistance: activities.distance,
			activityMovingTime: activities.movingTime,
			activityAverageSpeed: activities.averageSpeed,
			activityName: activities.name,
			activityStartDate: activities.startDate,
		})
		.from(planWorkouts)
		.leftJoin(planWorkoutMatches, eq(planWorkoutMatches.workoutId, planWorkouts.id))
		.leftJoin(activities, eq(activities.id, planWorkoutMatches.activityId))
		.where(eq(planWorkouts.weekId, currentWeek.id))
		.orderBy(planWorkouts.dayOfWeek, planWorkouts.sortOrder);

	const workouts = workoutRows.map((row) => ({
		id: row.workout.id,
		weekId: row.workout.weekId,
		dayOfWeek: row.workout.dayOfWeek,
		name: row.workout.name,
		category: row.workout.category,
		description: row.workout.description,
		targetDistanceMin: row.workout.targetDistanceMin,
		targetDistanceMax: row.workout.targetDistanceMax,
		targetDurationMin: row.workout.targetDurationMin,
		targetDurationMax: row.workout.targetDurationMax,
		effort: row.workout.effort,
		targets: row.workout.targets,
		matchStatus: row.match?.matchType ?? null,
		match: row.match
			? {
					id: row.match.id,
					activityId: row.match.activityId,
					matchType: row.match.matchType,
					confidence: row.match.confidence,
					activity: row.activityDistance != null
						? {
								name: row.activityName as string,
								distance: row.activityDistance as number,
								movingTime: row.activityMovingTime as number,
								averageSpeed: row.activityAverageSpeed as number,
								startDate: (row.activityStartDate as Date).toISOString(),
							}
						: null,
				}
			: null,
	}));

	// Load supplementary completions for this week
	const completionRows = await db
		.select()
		.from(planSupplementaryCompletions)
		.where(eq(planSupplementaryCompletions.weekId, currentWeek.id));

	const supplementary = (currentWeek.supplementary ?? []) as Array<{ name: string; timesPerWeek: number }>;
	const completions = completionRows.map((c) => ({
		id: c.id,
		name: c.name,
	}));

	return {
		instanceId: instance.id,
		effortMap: instance.effortMap as Record<string, { paceMin: number | null; paceMax: number | null }>,
		weekNumber: currentWeek.weekNumber,
		weekId: currentWeek.id,
		phase: currentWeek.phase,
		startDate: currentWeek.startDate.toISOString(),
		supplementary,
		completions,
		workouts,
	};
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export async function swapWorkouts(workoutIdA: number, workoutIdB: number, userId: number) {
	const db = getDb();

	return db.transaction(async (tx) => {
		// Load both workouts, verify same week and ownership
		const rows = await tx
			.select({
				id: planWorkouts.id,
				weekId: planWorkouts.weekId,
				dayOfWeek: planWorkouts.dayOfWeek,
				sortOrder: planWorkouts.sortOrder,
			})
			.from(planWorkouts)
			.innerJoin(planWeeks, eq(planWeeks.id, planWorkouts.weekId))
			.innerJoin(planInstances, eq(planInstances.id, planWeeks.instanceId))
			.where(
				and(
					inArray(planWorkouts.id, [workoutIdA, workoutIdB]),
					eq(planInstances.userId, userId),
				),
			);

		if (rows.length !== 2) return false;
		const [a, b] = rows[0].id === workoutIdA ? [rows[0], rows[1]] : [rows[1], rows[0]];
		if (a.weekId !== b.weekId) return false;

		// Swap dayOfWeek and sortOrder
		await tx
			.update(planWorkouts)
			.set({ dayOfWeek: b.dayOfWeek, sortOrder: b.sortOrder, updatedAt: new Date() })
			.where(eq(planWorkouts.id, a.id));
		await tx
			.update(planWorkouts)
			.set({ dayOfWeek: a.dayOfWeek, sortOrder: a.sortOrder, updatedAt: new Date() })
			.where(eq(planWorkouts.id, b.id));

		return true;
	});
}

export async function moveWorkout(workoutId: number, userId: number, newDayOfWeek: number) {
	const db = getDb();

	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({
				workoutId: planWorkouts.id,
				weekId: planWorkouts.weekId,
			})
			.from(planWorkouts)
			.innerJoin(planWeeks, eq(planWeeks.id, planWorkouts.weekId))
			.innerJoin(planInstances, eq(planInstances.id, planWeeks.instanceId))
			.where(
				and(eq(planWorkouts.id, workoutId), eq(planInstances.userId, userId)),
			);

		if (!row) return false;

		await tx
			.update(planWorkouts)
			.set({ dayOfWeek: newDayOfWeek, sortOrder: 0, updatedAt: new Date() })
			.where(eq(planWorkouts.id, workoutId));

		return true;
	});
}

// ---------------------------------------------------------------------------
// Supplementary completions
// ---------------------------------------------------------------------------

export async function getSupplementaryCompletions(weekId: number) {
	const db = getDb();
	return db
		.select()
		.from(planSupplementaryCompletions)
		.where(eq(planSupplementaryCompletions.weekId, weekId))
		.orderBy(planSupplementaryCompletions.completedAt);
}

export async function addSupplementaryCompletion(weekId: number, userId: number, name: string) {
	const db = getDb();

	// Verify ownership
	const [week] = await db
		.select({ instanceId: planWeeks.instanceId })
		.from(planWeeks)
		.innerJoin(planInstances, eq(planInstances.id, planWeeks.instanceId))
		.where(and(eq(planWeeks.id, weekId), eq(planInstances.userId, userId)));

	if (!week) return false;

	await db.insert(planSupplementaryCompletions).values({ weekId, name });
	return true;
}

export async function removeSupplementaryCompletion(completionId: number, userId: number) {
	const db = getDb();

	// Verify ownership
	const [row] = await db
		.select({ id: planSupplementaryCompletions.id })
		.from(planSupplementaryCompletions)
		.innerJoin(planWeeks, eq(planWeeks.id, planSupplementaryCompletions.weekId))
		.innerJoin(planInstances, eq(planInstances.id, planWeeks.instanceId))
		.where(and(eq(planSupplementaryCompletions.id, completionId), eq(planInstances.userId, userId)));

	if (!row) return false;

	await db.delete(planSupplementaryCompletions).where(eq(planSupplementaryCompletions.id, completionId));
	return true;
}

// ---------------------------------------------------------------------------
// Matched workout summary for activity detail page
// ---------------------------------------------------------------------------

export async function getMatchedWorkoutForActivity(activityId: number, userId: number) {
	const db = getDb();

	const [row] = await db
		.select({
			workoutName: planWorkouts.name,
			category: planWorkouts.category,
			effort: planWorkouts.effort,
			targetDistanceMin: planWorkouts.targetDistanceMin,
			targetDistanceMax: planWorkouts.targetDistanceMax,
			description: planWorkouts.description,
			matchType: planWorkoutMatches.matchType,
			confidence: planWorkoutMatches.confidence,
			planName: planInstances.name,
			instanceId: planInstances.id,
			weekNumber: planWeeks.weekNumber,
			phase: planWeeks.phase,
		})
		.from(planWorkoutMatches)
		.innerJoin(planWorkouts, eq(planWorkouts.id, planWorkoutMatches.workoutId))
		.innerJoin(planWeeks, eq(planWeeks.id, planWorkouts.weekId))
		.innerJoin(planInstances, eq(planInstances.id, planWeeks.instanceId))
		.where(and(eq(planWorkoutMatches.activityId, activityId), eq(planInstances.userId, userId)))
		.limit(1);

	return row ?? null;
}

// ---------------------------------------------------------------------------
// Plan zones for terminal
// ---------------------------------------------------------------------------

export async function getPlanEffortMapForActivity(activityId: number, userId: number) {
	const db = getDb();

	const [row] = await db
		.select({
			effortMap: planInstances.effortMap,
			workoutEffort: planWorkouts.effort,
			workoutName: planWorkouts.name,
		})
		.from(planWorkoutMatches)
		.innerJoin(planWorkouts, eq(planWorkouts.id, planWorkoutMatches.workoutId))
		.innerJoin(planWeeks, eq(planWeeks.id, planWorkouts.weekId))
		.innerJoin(planInstances, eq(planInstances.id, planWeeks.instanceId))
		.where(and(eq(planWorkoutMatches.activityId, activityId), eq(planInstances.userId, userId)))
		.limit(1);

	if (!row) return null;

	return {
		effortMap: row.effortMap as Record<string, { paceMin: number | null; paceMax: number | null }>,
		workoutEffort: row.workoutEffort,
		workoutName: row.workoutName,
	};
}

// ---------------------------------------------------------------------------
// Match management
// ---------------------------------------------------------------------------

export async function unmatchWorkout(workoutId: number, userId: number) {
	const db = getDb();

	// Verify ownership
	const [row] = await db
		.select({ matchId: planWorkoutMatches.id })
		.from(planWorkoutMatches)
		.innerJoin(planWorkouts, eq(planWorkouts.id, planWorkoutMatches.workoutId))
		.innerJoin(planWeeks, eq(planWeeks.id, planWorkouts.weekId))
		.innerJoin(planInstances, eq(planInstances.id, planWeeks.instanceId))
		.where(and(eq(planWorkoutMatches.workoutId, workoutId), eq(planInstances.userId, userId)));

	if (!row) return false;

	await db.delete(planWorkoutMatches).where(eq(planWorkoutMatches.id, row.matchId));
	return true;
}

export async function manualMatchWorkout(workoutId: number, activityId: number, userId: number) {
	const db = getDb();

	// Verify workout ownership
	const [workout] = await db
		.select({ id: planWorkouts.id })
		.from(planWorkouts)
		.innerJoin(planWeeks, eq(planWeeks.id, planWorkouts.weekId))
		.innerJoin(planInstances, eq(planInstances.id, planWeeks.instanceId))
		.where(and(eq(planWorkouts.id, workoutId), eq(planInstances.userId, userId)));

	if (!workout) return false;

	// Verify activity ownership
	const [activity] = await db
		.select({ id: activities.id })
		.from(activities)
		.where(and(eq(activities.id, activityId), eq(activities.userId, userId)));

	if (!activity) return false;

	// Upsert: replace existing match or create new
	await db
		.insert(planWorkoutMatches)
		.values({ workoutId, activityId, matchType: 'manual', confidence: 1.0 })
		.onConflictDoUpdate({
			target: planWorkoutMatches.workoutId,
			set: { activityId, matchType: 'manual', confidence: 1.0, createdAt: new Date() },
		});

	return true;
}

export async function getCandidateActivities(weekId: number, userId: number) {
	const db = getDb();

	// Get the week's date range and instance sport type
	const [week] = await db
		.select({
			startDate: planWeeks.startDate,
			sportType: planInstances.sportType,
		})
		.from(planWeeks)
		.innerJoin(planInstances, eq(planInstances.id, planWeeks.instanceId))
		.where(and(eq(planWeeks.id, weekId), eq(planInstances.userId, userId)));

	if (!week) return [];

	// Widen window by 12h each side to handle timezone edge cases
	const weekStart = new Date(week.startDate.getTime() - 12 * 60 * 60 * 1000);
	const weekEnd = new Date(week.startDate.getTime() + 8 * 24 * 60 * 60 * 1000);

	const conditions = [
		eq(activities.userId, userId),
		gte(activities.startDate, weekStart),
		lt(activities.startDate, weekEnd),
	];

	if (week.sportType) {
		conditions.push(eq(activities.sportType, week.sportType));
	}

	const rows = await db
		.select({
			id: activities.id,
			name: activities.name,
			distance: activities.distance,
			movingTime: activities.movingTime,
			averageSpeed: activities.averageSpeed,
			startDate: activities.startDate,
			matchedWorkoutName: planWorkouts.name,
		})
		.from(activities)
		.leftJoin(planWorkoutMatches, eq(planWorkoutMatches.activityId, activities.id))
		.leftJoin(planWorkouts, eq(planWorkouts.id, planWorkoutMatches.workoutId))
		.where(and(...conditions))
		.orderBy(activities.startDate);

	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		distance: r.distance,
		movingTime: r.movingTime,
		averageSpeed: r.averageSpeed,
		startDate: r.startDate,
		linkedTo: r.matchedWorkoutName ?? null,
	}));
}
