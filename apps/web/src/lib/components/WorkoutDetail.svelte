<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		formatDistance,
		formatDuration,
		formatPace,
		formatPaceValue,
		type Units,
	} from '$lib/format.js';
	import type { TargetStep } from '@web-runner/shared';

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

	interface CandidateActivity {
		id: number;
		name: string;
		distance: number;
		movingTime: number;
		averageSpeed: number;
		startDate: string;
		linkedTo: string | null;
	}

	interface Workout {
		id: number;
		weekId: number;
		name: string;
		category: string;
		description: string | null;
		targetDistanceMin: number | null;
		targetDistanceMax: number | null;
		targetDurationMin: number | null;
		targetDurationMax: number | null;
		effort: string | null;
		targets: TargetStep[] | null;
		match: WorkoutMatch | null;
	}

	interface Props {
		workout: Workout;
		effortMap: Record<string, { paceMin: number | null; paceMax: number | null }>;
		units: Units;
		onclose: () => void;
	}

	let { workout, effortMap, units, onclose }: Props = $props();

	const categoryLabels: Record<string, string> = {
		easy: 'Easy',
		long_run: 'Long Run',
		tempo: 'Tempo',
		intervals: 'Intervals',
		recovery: 'Recovery',
		hills: 'Hills',
		fartlek: 'Fartlek',
		progression: 'Progression',
		race_pace: 'Race Pace',
		cross_training: 'Cross Training',
		rest: 'Rest',
		race: 'Race',
	};

	const categoryColors: Record<string, string> = {
		easy: 'bg-blue-100 text-blue-700',
		long_run: 'bg-green-100 text-green-700',
		tempo: 'bg-orange-100 text-orange-700',
		intervals: 'bg-red-100 text-red-700',
		recovery: 'bg-sky-100 text-sky-700',
		hills: 'bg-amber-100 text-amber-700',
		fartlek: 'bg-yellow-100 text-yellow-700',
		progression: 'bg-teal-100 text-teal-700',
		race_pace: 'bg-violet-100 text-violet-700',
		cross_training: 'bg-pink-100 text-pink-700',
		rest: 'bg-zinc-100 text-zinc-600',
		race: 'bg-purple-100 text-purple-700',
	};

	const categoryBadge = $derived(categoryColors[workout.category] ?? 'bg-zinc-100 text-zinc-600');
	const categoryLabel = $derived(categoryLabels[workout.category] ?? workout.category);

	const distanceText = $derived.by(() => {
		const { targetDistanceMin: min, targetDistanceMax: max } = workout;
		if (!min && !max) return null;
		if (min && max && min !== max) {
			return `${formatDistance(min, units)} – ${formatDistance(max, units)}`;
		}
		return formatDistance(min ?? max, units);
	});

	const durationText = $derived.by(() => {
		const { targetDurationMin: min, targetDurationMax: max } = workout;
		if (!min && !max) return null;
		if (min && max && min !== max) {
			return `${formatDuration(min)} – ${formatDuration(max)}`;
		}
		return formatDuration(min ?? max);
	});

	const effortPace = $derived.by(() => {
		if (!workout.effort) return null;
		const entry = effortMap[workout.effort];
		if (!entry) return null;
		const { paceMin, paceMax } = entry;
		if (paceMin && paceMax && paceMin !== paceMax) {
			return `${formatPaceValue(paceMin, units)} – ${formatPaceValue(paceMax, units)}`;
		}
		return formatPaceValue(paceMin ?? paceMax, units);
	});

	function stepLabel(step: TargetStep): string {
		const parts: string[] = [];

		if (step.type) {
			parts.push(step.type.charAt(0).toUpperCase() + step.type.slice(1));
		}
		if (step.repeat && step.repeat > 1) {
			parts.push(`×${step.repeat}`);
		}

		const distMin = step.distanceMin;
		const distMax = step.distanceMax;
		if (distMin || distMax) {
			if (distMin && distMax && distMin !== distMax) {
				parts.push(`${formatDistance(distMin, units)}–${formatDistance(distMax, units)}`);
			} else {
				parts.push(formatDistance(distMin ?? distMax ?? null, units));
			}
		}

		const durMin = step.durationMin;
		const durMax = step.durationMax;
		if (durMin || durMax) {
			if (durMin && durMax && durMin !== durMax) {
				parts.push(`${formatDuration(durMin)}–${formatDuration(durMax)}`);
			} else {
				parts.push(formatDuration(durMin ?? durMax ?? null));
			}
		}

		if (step.effort) parts.push(`@ ${step.effort}`);
		if (step.description) parts.push(`(${step.description})`);

		return parts.join(' ');
	}

	function confidenceLabel(c: number): string {
		if (c >= 0.9) return 'Strong';
		if (c >= 0.7) return 'Good';
		if (c >= 0.5) return 'Fair';
		return 'Weak';
	}

	// Manual match state
	let showCandidates = $state(false);
	let candidates = $state<CandidateActivity[]>([]);
	let loadingCandidates = $state(false);

	async function loadCandidates() {
		if (showCandidates) {
			showCandidates = false;
			return;
		}
		loadingCandidates = true;
		const body = new FormData();
		body.set('weekId', String(workout.weekId));
		const res = await fetch('?/getCandidates', { method: 'POST', body });
		const result = deserialize(await res.text());
		const data = result.type === 'success' ? (result.data as { candidates?: CandidateActivity[] }) : null;
		candidates = data?.candidates ?? [];
		loadingCandidates = false;
		showCandidates = true;
	}

	function formatShortDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}
</script>

<div class="rounded-lg border border-blue-200 bg-blue-50/50 shadow-sm">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3 px-4 py-3 border-b border-zinc-100">
		<div class="flex items-center gap-2 flex-wrap min-w-0">
			<span class="font-semibold text-zinc-900 text-sm">{workout.name}</span>
			<span class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide {categoryBadge}">
				{categoryLabel}
			</span>
		</div>
		<button
			type="button"
			onclick={onclose}
			class="shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors text-lg leading-none"
			aria-label="Close"
		>
			&times;
		</button>
	</div>

	<div class="px-4 py-3 space-y-3">
		<!-- Description -->
		{#if workout.description}
			<p class="text-sm text-zinc-600">{workout.description}</p>
		{/if}

		<!-- Target distance / duration / effort -->
		<div class="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
			{#if distanceText}
				<div>
					<span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Distance</span>
					<div class="text-zinc-800 font-medium">{distanceText}</div>
				</div>
			{/if}
			{#if durationText}
				<div>
					<span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Duration</span>
					<div class="text-zinc-800 font-medium">{durationText}</div>
				</div>
			{/if}
			{#if workout.effort}
				<div>
					<span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Effort</span>
					<div class="text-zinc-800 font-medium">
						{workout.effort}
						{#if effortPace}
							<span class="text-zinc-400 font-normal text-xs ml-1">({effortPace})</span>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Targets / intervals -->
		{#if workout.targets && workout.targets.length > 0}
			<div>
				<div class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Structure</div>
				<ul class="space-y-0.5">
					{#each workout.targets as step, i (i)}
						<li class="text-xs text-zinc-700 flex items-start gap-1.5">
							<span class="shrink-0 text-zinc-300 select-none">&bull;</span>
							<span>{stepLabel(step)}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Match info -->
		{#if workout.match}
			<div class="rounded border border-green-200 bg-green-50 px-3 py-2.5">
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-1.5">
						<span class="size-2 rounded-full bg-green-500 shrink-0"></span>
						<span class="text-xs font-semibold text-green-800">Matched activity</span>
						<span class="text-[10px] text-green-600">
							{workout.match.matchType} &middot; {confidenceLabel(workout.match.confidence)}
						</span>
					</div>
					<div class="flex items-center gap-2">
						{#if workout.match.matchType === 'suggested'}
							<form method="POST" action="?/manualMatch" use:enhance={() => () => invalidateAll()}>
								<input type="hidden" name="workoutId" value={workout.id} />
								<input type="hidden" name="activityId" value={workout.match.activityId} />
								<button
									type="submit"
									class="text-xs font-medium text-green-700 hover:text-green-900 transition-colors"
								>
									Confirm
								</button>
							</form>
						{/if}
						<a
							href={resolve(`/activities/${workout.match.activityId}`)}
							class="text-xs text-green-700 hover:text-green-900 font-medium underline underline-offset-2"
						>
							View activity
						</a>
					</div>
				</div>
				{#if workout.match.activity}
					{@const a = workout.match.activity}
					<div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-green-800">
						<span class="font-medium">{a.name}</span>
						<span class="text-green-600">{formatShortDate(a.startDate)}</span>
						<span class="font-mono">{formatDistance(a.distance, units)}</span>
						<span>{formatDuration(a.movingTime)}</span>
						<span>{formatPace(a.averageSpeed, units)}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Match controls -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={loadCandidates}
				disabled={loadingCandidates}
				class="rounded border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-colors disabled:opacity-50"
			>
				{#if loadingCandidates}
					Loading...
				{:else if showCandidates}
					Hide activities
				{:else if workout.match}
					Change match
				{:else}
					Match activity
				{/if}
			</button>
			{#if workout.match}
				<form method="POST" action="?/unmatch" use:enhance={() => () => invalidateAll()}>
					<input type="hidden" name="workoutId" value={workout.id} />
					<button
						type="submit"
						class="rounded border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-400 hover:border-red-300 hover:text-red-600 transition-colors"
					>
						Unmatch
					</button>
				</form>
			{/if}
		</div>

		{#if showCandidates}
			<div class="rounded border border-zinc-200 bg-zinc-50 p-3">
				{#if candidates.length === 0}
					<p class="text-xs text-zinc-400">No unmatched activities found for this week.</p>
				{:else}
					<p class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">Activities this week</p>
					<div class="space-y-1">
						{#each candidates as candidate (candidate.id)}
							<div class="flex items-center justify-between gap-2 py-1.5 border-b border-zinc-100 last:border-0">
								<div class="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-zinc-700 min-w-0">
									<span class="font-medium truncate">{candidate.name}</span>
									<span class="text-zinc-500">{formatShortDate(candidate.startDate)}</span>
									<span class="font-mono">{formatDistance(candidate.distance, units)}</span>
									<span>{formatDuration(candidate.movingTime)}</span>
									<span>{formatPace(candidate.averageSpeed, units)}</span>
									{#if candidate.linkedTo}
										<span class="text-[10px] text-amber-600">linked to {candidate.linkedTo}</span>
									{/if}
								</div>
								<form method="POST" action="?/manualMatch" use:enhance={() => () => { showCandidates = false; invalidateAll(); }}>
									<input type="hidden" name="workoutId" value={workout.id} />
									<input type="hidden" name="activityId" value={candidate.id} />
									<button
										type="submit"
										class="shrink-0 rounded bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-zinc-700 transition-colors"
									>
										{candidate.linkedTo ? 'Reassign' : 'Link'}
									</button>
								</form>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
