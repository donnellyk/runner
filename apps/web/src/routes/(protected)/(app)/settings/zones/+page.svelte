<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatPaceForInput, parsePaceInput, formatPace, formatDistance, type Units } from '$lib/format';
	import type { ZoneDefinition } from '@web-runner/shared';

	let { data, form } = $props();
	const units = data.user.distanceUnit as Units;

	let zoneType = $state<'pace' | 'heartrate'>('pace');

	let paceZones = $state<ZoneDefinition[]>(structuredClone(data.zones.paceZones));
	let hrZones = $state<ZoneDefinition[]>(structuredClone(data.zones.hrZones));

	$effect(() => {
		paceZones = structuredClone(data.zones.paceZones);
		hrZones = structuredClone(data.zones.hrZones);
	});

	const activeZones = $derived(zoneType === 'pace' ? paceZones : hrZones);

	const KM_TO_MI = 1.60934;

	// Zones are always stored as sec/km internally. Convert for display/input when imperial.
	function getPaceInput(val: number | null): string {
		if (val == null) return '';
		const display = units === 'imperial' ? val * KM_TO_MI : val;
		return formatPaceForInput(display);
	}

	function setPaceMin(zone: ZoneDefinition, value: string) {
		const parsed = parsePaceInput(value);
		zone.paceMin = parsed == null ? null : units === 'imperial' ? parsed / KM_TO_MI : parsed;
	}

	function setPaceMax(zone: ZoneDefinition, value: string) {
		const parsed = parsePaceInput(value);
		zone.paceMax = parsed == null ? null : units === 'imperial' ? parsed / KM_TO_MI : parsed;
	}

	import { resolve } from '$app/paths';
	import { formatDurationClock } from '$lib/format';

	const raceActivities = data.raceActivities;

	function paceSec(activity: { movingTime: number | null; distance: number | null }): number | null {
		if (!activity.movingTime || !activity.distance) return null;
		return activity.movingTime / (activity.distance / 1000);
	}
</script>

<div class="mb-6">
	<h1 class="font-serif text-4xl font-semibold text-zinc-900 mb-1">Effort Zones</h1>
	<p class="text-sm text-zinc-400">Define your training zones. These appear as colored bands on activity charts.</p>
</div>

{#if form?.success}
	<div class="mb-6 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-700">
		Zones saved.
	</div>
{/if}

{#if raceActivities}
	<div class="mb-8">
		<div class="flex items-baseline justify-between mb-2">
			<p class="text-xs font-semibold uppercase tracking-wide text-zinc-400">Calculate from recent race</p>
			<span class="text-xs text-zinc-400 font-mono">{raceActivities.distanceLabel}</span>
		</div>
		<div class="border border-zinc-200 rounded-lg divide-y divide-zinc-100">
			{#each raceActivities.candidates as activity (activity.id)}
				<div class="flex items-center justify-between gap-4 px-4 py-3">
					<div class="min-w-0 flex-1">
						<a
							href={resolve(`/activities/${activity.id}`)}
							class="text-sm font-medium text-zinc-900 hover:text-zinc-600 hover:underline truncate block"
						>
							{activity.name}
						</a>
						<p class="text-xs text-zinc-400 font-mono mt-0.5" style="font-variant-numeric: tabular-nums;">
							{new Date(activity.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
							·
							{formatDistance(activity.distance, units)}
							·
							{formatPace(activity.averageSpeed, units)}
							{#if activity.averageHeartrate}
								·
								{Math.round(activity.averageHeartrate)} bpm
							{/if}
						</p>
					</div>
					<form method="POST" action="?/calcFromRace" use:enhance class="shrink-0">
						<input type="hidden" name="activityId" value={activity.id} />
						<input type="hidden" name="distanceLabel" value={raceActivities.distanceLabel} />
						<input type="hidden" name="avgPaceSec" value={paceSec(activity)} />
						<input type="hidden" name="avgHR" value={activity.averageHeartrate ?? ''} />
						<button
							type="submit"
							class="px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded hover:bg-zinc-700 whitespace-nowrap"
						>
							Use this
						</button>
					</form>
				</div>
			{/each}
		</div>
	</div>
{/if}

<div class="flex gap-1 mb-6">
	<button
		onclick={() => (zoneType = 'pace')}
		class="px-3 py-1.5 text-sm rounded {zoneType === 'pace' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'}"
	>
		Pace
	</button>
	<button
		onclick={() => (zoneType = 'heartrate')}
		class="px-3 py-1.5 text-sm rounded {zoneType === 'heartrate' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'}"
	>
		Heart Rate
	</button>
</div>

<form method="POST" action="?/saveZones" use:enhance>
	<input type="hidden" name="zoneType" value={zoneType} />
	<input type="hidden" name="zones" value={JSON.stringify(activeZones)} />

	<div class="space-y-2 mb-6">
		{#each activeZones as zone (zone.index)}
			<div class="flex items-center gap-4 p-4 border border-zinc-100 rounded-lg">
				<div class="w-3 h-8 rounded-sm shrink-0" style="background: {zone.color};"></div>

				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-zinc-900">Zone {zone.index} · {zone.name}</p>

					{#if zoneType === 'pace'}
						<div class="flex items-center gap-2 mt-1">
							{#if zone.index === 1}
								<span class="text-xs text-zinc-400">Slower than</span>
								<input
									type="text"
									placeholder="M:SS"
									value={getPaceInput(zone.paceMin)}
									oninput={(e) => { setPaceMin(zone, (e.target as HTMLInputElement).value); }}
									class="w-16 px-2 py-1 text-xs font-mono border border-zinc-200 rounded text-center"
									style="font-variant-numeric: tabular-nums;"
								/>
								<span class="text-xs text-zinc-400">/{units === 'imperial' ? 'mi' : 'km'}</span>
							{:else if zone.index === 5}
								<span class="text-xs text-zinc-400">Faster than</span>
								<input
									type="text"
									placeholder="M:SS"
									value={getPaceInput(zone.paceMax)}
									oninput={(e) => { setPaceMax(zone, (e.target as HTMLInputElement).value); }}
									class="w-16 px-2 py-1 text-xs font-mono border border-zinc-200 rounded text-center"
									style="font-variant-numeric: tabular-nums;"
								/>
								<span class="text-xs text-zinc-400">/{units === 'imperial' ? 'mi' : 'km'}</span>
							{:else}
								<input
									type="text"
									placeholder="M:SS"
									value={getPaceInput(zone.paceMax)}
									oninput={(e) => { setPaceMax(zone, (e.target as HTMLInputElement).value); }}
									class="w-16 px-2 py-1 text-xs font-mono border border-zinc-200 rounded text-center"
									style="font-variant-numeric: tabular-nums;"
								/>
								<span class="text-xs text-zinc-300">–</span>
								<input
									type="text"
									placeholder="M:SS"
									value={getPaceInput(zone.paceMin)}
									oninput={(e) => { setPaceMin(zone, (e.target as HTMLInputElement).value); }}
									class="w-16 px-2 py-1 text-xs font-mono border border-zinc-200 rounded text-center"
									style="font-variant-numeric: tabular-nums;"
								/>
								<span class="text-xs text-zinc-400">/{units === 'imperial' ? 'mi' : 'km'}</span>
							{/if}
						</div>
					{:else}
						<div class="flex items-center gap-2 mt-1">
							{#if zone.index === 1}
								<span class="text-xs text-zinc-400">Below</span>
								<input
									type="number"
									value={zone.hrMax ?? ''}
									oninput={(e) => { zone.hrMax = parseInt((e.target as HTMLInputElement).value) || null; }}
									class="w-16 px-2 py-1 text-xs font-mono border border-zinc-200 rounded text-center"
									style="font-variant-numeric: tabular-nums;"
								/>
								<span class="text-xs text-zinc-400">bpm</span>
							{:else if zone.index === 5}
								<span class="text-xs text-zinc-400">Above</span>
								<input
									type="number"
									value={zone.hrMin ?? ''}
									oninput={(e) => { zone.hrMin = parseInt((e.target as HTMLInputElement).value) || null; }}
									class="w-16 px-2 py-1 text-xs font-mono border border-zinc-200 rounded text-center"
									style="font-variant-numeric: tabular-nums;"
								/>
								<span class="text-xs text-zinc-400">bpm</span>
							{:else}
								<input
									type="number"
									value={zone.hrMin ?? ''}
									oninput={(e) => { zone.hrMin = parseInt((e.target as HTMLInputElement).value) || null; }}
									class="w-16 px-2 py-1 text-xs font-mono border border-zinc-200 rounded text-center"
									style="font-variant-numeric: tabular-nums;"
								/>
								<span class="text-xs text-zinc-300">–</span>
								<input
									type="number"
									value={zone.hrMax ?? ''}
									oninput={(e) => { zone.hrMax = parseInt((e.target as HTMLInputElement).value) || null; }}
									class="w-16 px-2 py-1 text-xs font-mono border border-zinc-200 rounded text-center"
									style="font-variant-numeric: tabular-nums;"
								/>
								<span class="text-xs text-zinc-400">bpm</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<button
		type="submit"
		class="w-32 px-4 py-2 text-sm font-medium bg-zinc-900 text-white rounded hover:bg-zinc-700"
	>
		Save zones
	</button>
</form>

<form method="POST" action="?/resetColors" use:enhance class="mt-2">
	<input type="hidden" name="zoneType" value={zoneType} />
	<button
		type="submit"
		class="w-32 px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded"
	>
		Reset colors
	</button>
</form>
