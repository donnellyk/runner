<script lang="ts">
	import {
		formatDistance,
		formatPace,
		formatElevation,
		formatDurationClock,
		formatDistancePrecise,
		type Units,
	} from '$lib/format';
	import type { TerminalState, ActivityNote, ActivityLap, ProcessingParams } from './terminal-state.svelte';

	interface ActivityData {
		distance: number | null;
		movingTime: number | null;
		averageSpeed: number | null;
		averageHeartrate: number | null;
		totalElevationGain: number | null;
		averageCadence: number | null;
	}

	interface Props {
		activity: ActivityData;
		units: Units;
		termState: TerminalState;
		notes: ActivityNote[];
		laps: ActivityLap[];
		crosshairValues?: Record<string, string | null>;
	}

	let {
		activity,
		units,
		termState,
		notes,
		laps,
		crosshairValues = {},
	}: Props = $props();

	let showDisplay = $state(true);
	let showProcessing = $state(false);

	function updateParam<K extends keyof ProcessingParams>(key: K, value: ProcessingParams[K]) {
		termState.params = { ...termState.params, [key]: value };
	}
</script>

<div class="h-full overflow-y-auto" style="background: var(--term-surface); border-left: 1px solid var(--term-border); width: 280px;">
	<!-- Stats -->
	<div class="px-3 py-3" style="border-bottom: 1px solid var(--term-border);">
		<div class="grid grid-cols-2 gap-x-4 gap-y-1.5" style="font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums;">
			{#if activity.distance}
				<div>
					<div class="text-[9px] uppercase tracking-wide" style="color: var(--term-text-muted);">Distance</div>
					<div class="text-[13px] font-medium" style="color: var(--term-text-bright);">{formatDistance(activity.distance, units)}</div>
				</div>
			{/if}
			{#if activity.averageSpeed}
				<div>
					<div class="text-[9px] uppercase tracking-wide" style="color: var(--term-text-muted);">Avg Pace</div>
					<div class="text-[13px] font-medium" style="color: var(--term-text-bright);">{crosshairValues.pace ?? formatPace(activity.averageSpeed, units)}</div>
				</div>
			{/if}
			{#if activity.movingTime}
				<div>
					<div class="text-[9px] uppercase tracking-wide" style="color: var(--term-text-muted);">Time</div>
					<div class="text-[13px] font-medium" style="color: var(--term-text-bright);">{formatDurationClock(activity.movingTime)}</div>
				</div>
			{/if}
			{#if activity.averageHeartrate}
				<div>
					<div class="text-[9px] uppercase tracking-wide" style="color: var(--term-text-muted);">Avg HR</div>
					<div class="text-[13px] font-medium" style="color: var(--term-text-bright);">{crosshairValues.heartrate ?? `${Math.round(activity.averageHeartrate)} bpm`}</div>
				</div>
			{/if}
			{#if activity.totalElevationGain && activity.totalElevationGain > 0}
				<div>
					<div class="text-[9px] uppercase tracking-wide" style="color: var(--term-text-muted);">Elevation</div>
					<div class="text-[13px] font-medium" style="color: var(--term-text-bright);">{crosshairValues.elevation ?? `+${formatElevation(activity.totalElevationGain, units)}`}</div>
				</div>
			{/if}
			{#if activity.averageCadence}
				<div>
					<div class="text-[9px] uppercase tracking-wide" style="color: var(--term-text-muted);">Cadence</div>
					<div class="text-[13px] font-medium" style="color: var(--term-text-bright);">{crosshairValues.cadence ?? `${Math.round(activity.averageCadence * 2)} spm`}</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Controls -->
	<div style="border-bottom: 1px solid var(--term-border);">
		<button
			class="w-full flex items-center justify-between px-3 py-2 cursor-pointer"
			style="color: var(--term-text); font-size: 11px; font-weight: 500;"
			onclick={() => showDisplay = !showDisplay}
		>
			Display
			<span class="text-[9px]" style="color: var(--term-text-muted);">{showDisplay ? '−' : '+'}</span>
		</button>
		{#if showDisplay}
			<div class="px-3 pb-3 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<span class="text-[10px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">X-Axis</span>
					<div class="flex gap-0.5">
						<button
							class="px-2 py-0.5 text-[9px] rounded"
							style="font-family: 'Geist Mono', monospace; {termState.xAxis === 'distance' ? 'background: var(--term-surface-hover); color: var(--term-text-bright);' : 'color: var(--term-text-muted);'}"
							onclick={() => termState.xAxis = 'distance'}
						>Dist</button>
						<button
							class="px-2 py-0.5 text-[9px] rounded"
							style="font-family: 'Geist Mono', monospace; {termState.xAxis === 'time' ? 'background: var(--term-surface-hover); color: var(--term-text-bright);' : 'color: var(--term-text-muted);'}"
							onclick={() => termState.xAxis = 'time'}
						>Time</button>
					</div>
				</div>
				<label class="flex items-center justify-between cursor-pointer">
					<span class="text-[10px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Zones</span>
					<input type="checkbox" bind:checked={termState.showZones} class="rounded" />
				</label>
				<label class="flex items-center justify-between cursor-pointer">
					<span class="text-[10px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Notes</span>
					<input type="checkbox" bind:checked={termState.showNotes} class="rounded" />
				</label>
				<label class="flex items-center justify-between cursor-pointer">
					<span class="text-[10px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Pause Gaps</span>
					<input type="checkbox" bind:checked={termState.showPauseGaps} class="rounded" />
				</label>
			</div>
		{/if}
	</div>

	<div style="border-bottom: 1px solid var(--term-border);">
		<button
			class="w-full flex items-center justify-between px-3 py-2 cursor-pointer"
			style="color: var(--term-text); font-size: 11px; font-weight: 500;"
			onclick={() => showProcessing = !showProcessing}
		>
			Processing
			<span class="text-[9px]" style="color: var(--term-text-muted);">{showProcessing ? '−' : '+'}</span>
		</button>
		{#if showProcessing}
			<div class="px-3 pb-3 flex flex-col gap-2">
				<div>
					<div class="flex items-center justify-between mb-1">
						<span class="text-[10px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Smoothing</span>
						<span class="text-[10px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">{termState.params.smoothingWindow}</span>
					</div>
					<input type="range" min="0" max="10" step="1" value={termState.params.smoothingWindow}
						oninput={(e) => updateParam('smoothingWindow', parseInt((e.target as HTMLInputElement).value))}
						class="w-full h-1 rounded appearance-none" style="background: var(--term-border);" />
				</div>
				<div>
					<div class="flex items-center justify-between mb-1">
						<span class="text-[10px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Samples</span>
						<span class="text-[10px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">{termState.params.samplePoints}</span>
					</div>
					<input type="range" min="100" max="2000" step="100" value={termState.params.samplePoints}
						oninput={(e) => updateParam('samplePoints', parseInt((e.target as HTMLInputElement).value))}
						class="w-full h-1 rounded appearance-none" style="background: var(--term-border);" />
				</div>
				<div>
					<div class="flex items-center justify-between mb-1">
						<span class="text-[10px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Pause (m/s)</span>
						<span class="text-[10px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">{termState.params.pauseThreshold.toFixed(1)}</span>
					</div>
					<input type="range" min="0.1" max="3.0" step="0.1" value={termState.params.pauseThreshold}
						oninput={(e) => updateParam('pauseThreshold', parseFloat((e.target as HTMLInputElement).value))}
						class="w-full h-1 rounded appearance-none" style="background: var(--term-border);" />
				</div>
			</div>
		{/if}
	</div>

	<!-- Layout -->
	<div style="border-bottom: 1px solid var(--term-border);">
		<div class="px-3 py-2">
			<button
				class="w-full text-[10px] px-2 py-1 rounded"
				style="color: var(--term-text-muted); border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
				onclick={() => termState.resetPanels()}
			>Reset Layout</button>
		</div>
	</div>

	<!-- Notes -->
	{#if notes.length > 0}
		<div style="border-bottom: 1px solid var(--term-border);">
			<div class="px-3 py-2">
				<span class="text-[10px] uppercase tracking-wide" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">
					Notes ({notes.length})
				</span>
			</div>
			<div class="px-2 pb-2">
				{#each notes as note (note.id)}
					<button
						class="w-full text-left py-1 px-1.5 rounded text-[10px] cursor-pointer"
						style="background: {termState.highlightedNoteId === note.id ? 'var(--term-surface-hover)' : 'transparent'};"
						onclick={() => termState.highlightedNoteId = termState.highlightedNoteId === note.id ? null : note.id}
					>
						<span style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums;">
							{formatDistance(note.distanceStart, units)}
						</span>
						<span style="color: var(--term-text);" class="ml-1">{note.content}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Laps -->
	{#if laps.length > 0}
		<div class="px-3 py-2">
			<span class="text-[10px] uppercase tracking-wide" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">
				Laps ({laps.length})
			</span>
			<table class="w-full mt-1" style="font-family: 'Geist Mono', monospace; font-size: 10px; font-variant-numeric: tabular-nums;">
				<thead>
					<tr style="color: var(--term-text-muted);">
						<th class="text-left font-normal py-0.5">#</th>
						<th class="text-right font-normal py-0.5">Dist</th>
						<th class="text-right font-normal py-0.5">Pace</th>
						<th class="text-right font-normal py-0.5">HR</th>
					</tr>
				</thead>
				<tbody>
					{#each laps as lap (lap.id)}
						<tr style="color: var(--term-text);">
							<td class="py-0.5">{lap.lapIndex + 1}</td>
							<td class="text-right py-0.5">{lap.distance ? formatDistancePrecise(lap.distance, units) : '—'}</td>
							<td class="text-right py-0.5" style="color: var(--term-text-bright);">{formatPace(lap.averageSpeed, units)}</td>
							<td class="text-right py-0.5">{lap.averageHeartrate ? Math.round(lap.averageHeartrate) : '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
