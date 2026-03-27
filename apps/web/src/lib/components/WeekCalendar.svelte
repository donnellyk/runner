<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { formatDistance, type Units } from '$lib/format.js';
	import { SvelteMap } from 'svelte/reactivity';
	import WorkoutCard from './WorkoutCard.svelte';

	interface WorkoutEntry {
		id: number;
		dayOfWeek: number;
		name: string;
		category: string;
		targetDistanceMin: number | null;
		targetDistanceMax: number | null;
		effort: string | null;
		matchStatus: string | null;
	}

	interface SupplementaryEntry {
		name: string;
		timesPerWeek: number;
	}

	interface Props {
		weekNumber: number;
		phase: string;
		startDate: string | Date;
		workouts: WorkoutEntry[];
		units: Units;
		compact?: boolean;
		isCurrent?: boolean;
		plannedDistanceMin?: number;
		plannedDistanceMax?: number;
		completedDistance?: number;
		supplementary?: SupplementaryEntry[];
		completions?: Array<{ id: number; name: string }>;
		weekId?: number;
		onworkoutclick?: (workoutId: number) => void;
	}

	let {
		weekNumber,
		phase,
		startDate,
		workouts,
		units,
		compact = false,
		isCurrent = false,
		plannedDistanceMin = 0,
		plannedDistanceMax = 0,
		completedDistance = 0,
		supplementary = [],
		completions = [],
		weekId,
		onworkoutclick,
	}: Props = $props();

	const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	// ISO 8601 dayOfWeek: 1=Mon … 7=Sun
	const DAY_INDICES = [1, 2, 3, 4, 5, 6, 7];

	const phaseColors: Record<string, string> = {
		base: 'bg-blue-100 text-blue-700',
		build: 'bg-orange-100 text-orange-700',
		peak: 'bg-red-100 text-red-700',
		taper: 'bg-teal-100 text-teal-700',
		race: 'bg-purple-100 text-purple-700',
	};

	const phaseBadge = $derived(phaseColors[phase] ?? 'bg-zinc-100 text-zinc-600');

	const workoutByDay = $derived.by(() => {
		const map = new SvelteMap<number, WorkoutEntry>();
		for (const w of workouts) {
			map.set(w.dayOfWeek, w);
		}
		return map;
	});

	const dateLabels = $derived.by(() => {
		const baseMs = startDate instanceof Date ? startDate.getTime() : new Date(startDate).getTime();
		const DAY_MS = 24 * 60 * 60 * 1000;
		return DAY_INDICES.map((_, i) => new Date(baseMs + i * DAY_MS).getDate());
	});

	function validMatchStatus(
		s: string | null,
	): 'matched' | 'auto' | 'manual' | 'suggested' | 'close' | 'off' | 'upcoming' | 'skipped' | null {
		if (
			s === 'matched' ||
			s === 'auto' ||
			s === 'manual' ||
			s === 'suggested' ||
			s === 'close' ||
			s === 'off' ||
			s === 'upcoming' ||
			s === 'skipped'
		) {
			return s;
		}
		return null;
	}

	// Only show compliance for current or past weeks
	const weekStartMs = $derived(startDate instanceof Date ? startDate.getTime() : new Date(startDate).getTime());
	const isStarted = $derived(weekStartMs <= Date.now());

	const hasRange = $derived(plannedDistanceMax > plannedDistanceMin);
	// Use midpoint for compliance when there's a range
	const plannedMid = $derived(hasRange ? (plannedDistanceMin + plannedDistanceMax) / 2 : plannedDistanceMin);
	const complianceRatio = $derived(plannedMid > 0 && isStarted ? completedDistance / plannedMid : null);
	const complianceColor = $derived.by(() => {
		if (complianceRatio == null) return null;
		if (complianceRatio >= 0.9) return 'text-green-600';
		if (complianceRatio >= 0.5) return 'text-yellow-600';
		return 'text-red-500';
	});

	// Drag and drop state
	let dragWorkoutId = $state<number | null>(null);
	let dragOverDay = $state<number | null>(null);

	function handleDragStart(e: DragEvent, workoutId: number) {
		if (!e.dataTransfer) return;
		dragWorkoutId = workoutId;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', String(workoutId));
	}

	function handleDragOver(e: DragEvent, dayNum: number) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverDay = dayNum;
	}

	function handleDragLeave() {
		dragOverDay = null;
	}

	function submitForm(action: string, fields: Record<string, string>) {
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = action;
		form.style.display = 'none';
		for (const [name, value] of Object.entries(fields)) {
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = name;
			input.value = value;
			form.appendChild(input);
		}
		document.body.appendChild(form);
		form.requestSubmit();
		document.body.removeChild(form);
	}

	function handleDrop(e: DragEvent, dayNum: number) {
		e.preventDefault();
		dragOverDay = null;
		if (dragWorkoutId == null) return;

		const sourceWorkout = workouts.find((w) => w.id === dragWorkoutId);
		if (!sourceWorkout || sourceWorkout.dayOfWeek === dayNum) {
			dragWorkoutId = null;
			return;
		}

		const targetWorkout = workoutByDay.get(dayNum);

		if (targetWorkout) {
			// Swap the two workouts
			submitForm('?/swapWorkouts', {
				workoutIdA: String(dragWorkoutId),
				workoutIdB: String(targetWorkout.id),
			});
		} else {
			// Move to empty day
			submitForm('?/moveWorkout', {
				workoutId: String(dragWorkoutId),
				newDayOfWeek: String(dayNum),
			});
		}

		dragWorkoutId = null;
	}

	function handleDragEnd() {
		dragWorkoutId = null;
		dragOverDay = null;
	}
</script>

<div
	class="rounded-lg border bg-white overflow-hidden
		{isCurrent ? 'border-blue-400 ring-1 ring-blue-300' : 'border-zinc-200'}"
>
	<!-- Header bar -->
	<div
		class="flex items-center gap-2 px-3 py-1.5 border-b
			{isCurrent ? 'border-blue-200 bg-blue-50' : 'border-zinc-100 bg-zinc-50'}"
	>
		<span class="text-[11px] font-semibold text-zinc-500">Week {weekNumber}</span>
		<span class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide {phaseBadge}">
			{phase}
		</span>
		{#if plannedDistanceMin > 0 && isStarted}
			<span class="text-[10px] text-zinc-400 font-mono">
				{formatDistance(completedDistance, units)} / {formatDistance(plannedDistanceMin, units)}{hasRange ? `–${formatDistance(plannedDistanceMax, units)}` : ''}
			</span>
			{#if complianceColor}
				<span class="text-[10px] font-semibold {complianceColor}">
					{Math.round((complianceRatio ?? 0) * 100)}%
				</span>
			{/if}
		{:else if plannedDistanceMin > 0}
			<span class="text-[10px] text-zinc-400 font-mono">
				{formatDistance(plannedDistanceMin, units)}{hasRange ? `–${formatDistance(plannedDistanceMax, units)}` : ''}
			</span>
		{/if}
		{#if isCurrent}
			<span class="ml-auto text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Current</span>
		{/if}
	</div>

	<!-- Day columns -->
	<div class="grid grid-cols-7">
		<!-- Day name headers -->
		{#each DAYS as day, i (day)}
			<div
				class="border-b border-r last:border-r-0 px-1 py-1 text-center
					{isCurrent ? 'border-blue-100' : 'border-zinc-100'}"
			>
				<div class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{day}</div>
				<div class="text-[10px] text-zinc-300">{dateLabels[i]}</div>
			</div>
		{/each}

		<!-- Workout cells -->
		{#each DAY_INDICES as dayNum (dayNum)}
			{@const workout = workoutByDay.get(dayNum)}
			<div
				class="border-r last:border-r-0 p-1 transition-colors
					{compact ? 'min-h-[48px]' : 'min-h-[72px]'}
					{isCurrent ? 'border-blue-100' : 'border-zinc-100'}
					{dragOverDay === dayNum ? 'bg-blue-50' : ''}"
				ondragover={(e) => handleDragOver(e, dayNum)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, dayNum)}
				role="gridcell"
			>
				{#if workout}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						draggable="true"
						ondragstart={(e) => handleDragStart(e, workout.id)}
						ondragend={handleDragEnd}
						class={dragWorkoutId === workout.id ? 'opacity-40' : ''}
					>
						<WorkoutCard
							name={workout.name}
							category={workout.category}
							targetDistanceMin={workout.targetDistanceMin}
							targetDistanceMax={workout.targetDistanceMax}
							effort={workout.effort}
							matchStatus={validMatchStatus(workout.matchStatus)}
							{units}
							{compact}
							onclick={onworkoutclick ? () => onworkoutclick(workout.id) : undefined}
						/>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Supplementary footer -->
	{#if supplementary.length > 0}
		<div class="flex items-center gap-4 px-3 py-1 border-t {isCurrent ? 'border-blue-100' : 'border-zinc-100'}">
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
							{:else if weekId}
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
