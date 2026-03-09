<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import SparkLine from '$lib/components/SparkLine.svelte';
	import { formatDistance, formatDuration, formatPace, formatElevation, type Units } from '$lib/format';
	import { sportColor, workoutBadge } from '$lib/activity-colors';

	let { data } = $props();
	const units = data.user.distanceUnit as Units;

	function rowClick(e: MouseEvent, id: number) {
		if ((e.target as HTMLElement).closest('button, a, form')) return;
		goto(resolve(`/activities/${id}`));
	}

	let grouped = $derived.by(() => {
		const map = new Map<string, typeof data.activities>();
		for (const a of data.activities) {
			const key = new Date(a.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(a);
		}
		return [...map.entries()];
	});

	function dayLabel(date: Date | string): string {
		return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	const activitiesPath = resolve('/activities');

	function buildQuery(overrides: Record<string, string>) {
		const p = new URLSearchParams({
			sport:    data.filters.sport,
			workout:  data.filters.workout,
			range:    data.filters.range,
			distance: data.filters.distance,
			...overrides,
		});
		// remove empty
		for (const [k, v] of [...p.entries()]) {
			if (!v) p.delete(k);
		}
		return p.toString();
	}
</script>

<div class="mb-8">
	<h1 class="font-serif text-4xl font-semibold text-zinc-900 mb-6">Activities</h1>

	<form method="GET" class="flex flex-wrap gap-3 items-center">
		<select
			name="sport"
			onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
			class="border border-zinc-200 rounded px-2.5 py-1.5 text-sm bg-white text-zinc-700"
		>
			<option value="">All sports</option>
			{#each data.sportTypes as s}
				<option value={s} selected={data.filters.sport === s}>{s}</option>
			{/each}
		</select>

		<select
			name="range"
			onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
			class="border border-zinc-200 rounded px-2.5 py-1.5 text-sm bg-white text-zinc-700"
		>
			<option value="">All time</option>
			<option value="week"  selected={data.filters.range === 'week'}>This week</option>
			<option value="month" selected={data.filters.range === 'month'}>This month</option>
			<option value="90d"   selected={data.filters.range === '90d'}>Last 90 days</option>
		</select>

		<select
			name="distance"
			onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
			class="border border-zinc-200 rounded px-2.5 py-1.5 text-sm bg-white text-zinc-700"
		>
			<option value="">Any distance</option>
			{#each data.distancePresets as p}
				<option value={p} selected={data.filters.distance === p}>{p}</option>
			{/each}
		</select>

		<select
			name="workout"
			onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
			class="border border-zinc-200 rounded px-2.5 py-1.5 text-sm bg-white text-zinc-700"
		>
			<option value="">Any type</option>
			<option value="race"     selected={data.filters.workout === 'race'}>Race</option>
			<option value="workout"  selected={data.filters.workout === 'workout'}>Workout</option>
			<option value="long_run" selected={data.filters.workout === 'long_run'}>Long run</option>
		</select>
	</form>
</div>

{#if grouped.length === 0}
	<p class="text-sm text-zinc-400">No activities found.</p>
{/if}

{#each grouped as [month, acts]}
	<div class="mb-8">
		<div class="font-serif text-lg font-medium text-zinc-400 mb-3 pb-2 border-b border-zinc-100">
			{month}
		</div>

		<div class="space-y-0">
			{#each acts as activity (activity.id)}
				{@const color = sportColor(activity.sportType)}
				{@const badge = workoutBadge(activity.workoutType)}
				<div
					class="flex items-center justify-between py-3 border-b border-zinc-50 cursor-pointer hover:bg-zinc-50 -mx-2 px-2 rounded"
					style="border-left: 3px solid {color};"
					onclick={(e) => rowClick(e, activity.id)}
					role="button"
					tabindex="0"
					onkeydown={(e) => e.key === 'Enter' && goto(resolve(`/activities/${activity.id}`))}
				>
					<div class="min-w-0 flex-1">
						<div class="flex items-baseline gap-2">
							<span class="text-xs text-zinc-400 w-24 shrink-0 font-mono" style="font-variant-numeric: tabular-nums;">
								{dayLabel(activity.startDate)}
							</span>
							<span class="text-sm font-medium text-zinc-900 truncate">{activity.name}</span>
							{#if badge}
								<span class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded" style="background: {badge.bg}; color: {badge.fg};">{badge.label}</span>
							{/if}
						</div>
						<div class="flex items-center gap-2 mt-0.5 pl-27 font-mono text-xs text-zinc-400" style="padding-left: 6.5rem; font-variant-numeric: tabular-nums;">
							{#if activity.distance}
								<span>{formatDistance(activity.distance, units)}</span>
								<span class="text-zinc-200">·</span>
							{/if}
							{#if activity.movingTime}
								<span>{formatDuration(activity.movingTime)}</span>
							{/if}
							{#if activity.averageSpeed}
								<span class="text-zinc-200">·</span>
								<span>{formatPace(activity.averageSpeed, units)}</span>
							{/if}
							{#if activity.averageHeartrate}
								<span class="text-zinc-200">·</span>
								<span>{Math.round(activity.averageHeartrate)} bpm</span>
							{/if}
							{#if activity.totalElevationGain && activity.totalElevationGain > 5}
								<span class="text-zinc-200">·</span>
								<span>+{formatElevation(activity.totalElevationGain, units)}</span>
							{/if}
						</div>
					</div>

					{#if activity.sparkline && activity.sparkline.length > 1}
						<div class="ml-4 shrink-0 opacity-60">
							<SparkLine data={activity.sparkline} color={color} width={64} height={20} />
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/each}

{#if data.nextCursor}
	<div class="mt-4">
		<a
			href="{activitiesPath}?{buildQuery({ cursor: data.nextCursor })}"
			class="text-sm text-zinc-500 hover:text-zinc-900"
		>
			Load more
		</a>
	</div>
{/if}
