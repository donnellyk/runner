<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteMap } from 'svelte/reactivity';
	import WorkoutCard from '$lib/components/WorkoutCard.svelte';
	import WorkoutDetail from '$lib/components/WorkoutDetail.svelte';
	import type { TargetStep } from '@web-runner/shared';
	import { formatDistance, type Units } from '$lib/format.js';

	interface MatchedActivity {
		name: string;
		distance: number;
		movingTime: number;
		averageSpeed: number;
		startDate: string;
	}

	interface WorkoutMatch {
		id: number;
		activityId: number;
		matchType: string;
		confidence: number;
		activity: MatchedActivity | null;
	}

	interface Workout {
		id: number;
		weekId: number;
		dayOfWeek: number;
		name: string;
		category: string;
		description: string | null;
		targetDistanceMin: number | null;
		targetDistanceMax: number | null;
		targetDurationMin: number | null;
		targetDurationMax: number | null;
		effort: string | null;
		targets: unknown;
		matchStatus: string | null;
		match: WorkoutMatch | null;
	}

	interface SupplementaryEntry {
		name: string;
		timesPerWeek: number;
	}

	interface Props {
		workouts: Workout[];
		weekNumber: number;
		weekId: number;
		phase: string;
		instanceId: number;
		effortMap: Record<string, { paceMin: number | null; paceMax: number | null }>;
		supplementary?: SupplementaryEntry[];
		completions?: Array<{ id: number; name: string }>;
		units: Units;
	}

	let { workouts, weekNumber, weekId, phase, instanceId, effortMap, supplementary = [], completions = [], units }: Props = $props();

	const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	const today = new Date();
	// ISO 8601 day of week: Mon=1 … Sun=7
	const todayDow = today.getDay() === 0 ? 7 : today.getDay();

	// Group workouts by dayOfWeek (1–7)
	const workoutsByDay = $derived.by(() => {
		const map = new SvelteMap<number, Workout[]>();
		for (const w of workouts) {
			const list = map.get(w.dayOfWeek) ?? [];
			list.push(w);
			map.set(w.dayOfWeek, list);
		}
		return map;
	});

	let selectedWorkoutId = $state<number | null>(null);

	const selectedWorkout = $derived.by(() => {
		if (selectedWorkoutId === null) return null;
		return workouts.find((w) => w.id === selectedWorkoutId) ?? null;
	});

	const plannedMin = $derived(workouts.reduce((sum, w) => sum + (w.targetDistanceMin ?? 0), 0));
	const plannedMax = $derived(workouts.reduce((sum, w) => sum + (w.targetDistanceMax ?? w.targetDistanceMin ?? 0), 0));
	const hasRange = $derived(plannedMax > plannedMin);

	function handleWorkoutClick(id: number) {
		selectedWorkoutId = selectedWorkoutId === id ? null : id;
	}
</script>

<div class="rounded-lg border border-zinc-200 bg-white px-4 py-3">
	<!-- Header row -->
	<div class="flex items-center justify-between mb-3">
		<div class="flex items-center gap-2">
			<span class="text-xs font-semibold uppercase tracking-widest text-zinc-400">Training Plan</span>
			<span class="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
				Week {weekNumber}
			</span>
			{#if phase}
				<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
					{phase}
				</span>
			{/if}
			{#if plannedMin > 0}
				<span class="text-[10px] text-zinc-400 font-mono">
					{formatDistance(plannedMin, units)}{hasRange ? `–${formatDistance(plannedMax, units)}` : ''}
				</span>
			{/if}
		</div>
		<a
			href={resolve(`/plans/${instanceId}`)}
			class="text-xs text-zinc-400 hover:text-zinc-700 transition-colors font-medium"
		>
			View plan →
		</a>
	</div>

	<!-- 7-column day grid -->
	<div class="grid grid-cols-7 gap-1">
		{#each DAY_NAMES as dayName, i (dayName)}
			{@const dow = i + 1}
			{@const isToday = dow === todayDow}
			{@const dayWorkouts = workoutsByDay.get(dow) ?? []}
			<div class="flex flex-col gap-1 min-w-0">
				<!-- Day label -->
				<div
					class="text-center text-[10px] font-semibold uppercase tracking-wide mb-0.5
						{isToday ? 'text-blue-600' : 'text-zinc-400'}"
				>
					{dayName}
				</div>
				<!-- Workouts or empty slot -->
				{#if dayWorkouts.length > 0}
					<div class="flex flex-col gap-0.5">
						{#each dayWorkouts as workout (workout.id)}
							<WorkoutCard
								name={workout.name}
								category={workout.category}
								targetDistanceMin={workout.targetDistanceMin}
								targetDistanceMax={workout.targetDistanceMax}
								effort={null}
								matchStatus={workout.matchStatus as 'matched' | 'auto' | 'manual' | 'suggested' | 'close' | 'off' | 'upcoming' | 'skipped' | null}
								{units}
								onclick={() => handleWorkoutClick(workout.id)}
							/>
						{/each}
					</div>
				{:else}
					<div
						class="flex-1 rounded border border-dashed border-zinc-100 py-1
							{isToday ? 'border-blue-100' : ''}"
					></div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Supplementary footer -->
	{#if supplementary.length > 0}
		<div class="flex items-center gap-4 mt-2 pt-2 border-t border-zinc-100">
			{#each supplementary as supp (supp.name)}
				{@const completedCount = completions.filter((c) => c.name === supp.name).length}
				{@const completionIds = completions.filter((c) => c.name === supp.name).map((c) => c.id)}
				<div class="flex items-center gap-1">
					<span class="text-[10px] text-zinc-400">{supp.name}</span>
					<div class="flex gap-0.5">
						{#each Array.from({length: supp.timesPerWeek}, (__, idx) => idx) as i (i)}
							{#if i < completedCount}
								<form method="POST" action="?/removeCompletion" use:enhance={() => () => invalidateAll()}>
									<input type="hidden" name="completionId" value={completionIds[i]} />
									<button
										type="submit"
										class="w-4 h-4 rounded bg-zinc-700 text-white flex items-center justify-center text-[8px] transition-colors hover:bg-zinc-500"
										title="Undo"
									>&#x2713;</button>
								</form>
							{:else}
								<form method="POST" action="?/addCompletion" use:enhance={() => () => invalidateAll()}>
									<input type="hidden" name="weekId" value={weekId} />
									<input type="hidden" name="name" value={supp.name} />
									<button
										type="submit"
										class="w-4 h-4 rounded border border-dashed border-zinc-200 flex items-center justify-center transition-colors hover:border-zinc-400"
										title="Mark done"
									></button>
								</form>
							{/if}
						{/each}
					</div>
					<span class="text-[9px] text-zinc-300 font-mono">{completedCount}/{supp.timesPerWeek}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if selectedWorkout}
	<div class="mb-4">
		<WorkoutDetail
			workout={{ ...selectedWorkout, targets: selectedWorkout.targets as TargetStep[] | null }}
			{effortMap}
			{units}
			onclose={() => (selectedWorkoutId = null)}
		/>
	</div>
{/if}
