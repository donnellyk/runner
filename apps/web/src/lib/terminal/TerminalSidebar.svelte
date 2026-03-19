<script lang="ts">
	import {
		formatDistance,
		formatPace,
		formatElevation,
		formatDurationClock,
		formatDistancePrecise,
		type Units,
	} from '$lib/format';
	import type { TerminalState } from './terminal-state.svelte';
	import { type ActivityNote, type ActivityLap } from './terminal-state.svelte';
	import type { ActivityData } from './types';

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

	let collapsed = $state(false);
</script>

{#if collapsed}
	<button
		class="sidebar-collapsed"
		onclick={() => collapsed = false}
		title="Expand sidebar"
	>
		<span class="collapse-icon">&rsaquo;</span>
	</button>
{:else}
	<div class="sidebar">
		<div class="sidebar-header">
			<button class="collapse-btn" onclick={() => collapsed = true} title="Collapse sidebar">&lsaquo;</button>
		</div>

		<!-- Stats -->
		<div class="section">
			<div class="stats-grid" style="font-variant-numeric: tabular-nums;">
				{#if activity.distance}
					<div>
						<div class="stat-label">Distance</div>
						<div class="stat-value">{formatDistance(activity.distance, units)}</div>
					</div>
				{/if}
				{#if activity.averageSpeed}
					<div>
						<div class="stat-label">Avg Pace</div>
						<div class="stat-value">{crosshairValues.pace ?? formatPace(activity.averageSpeed, units)}</div>
					</div>
				{/if}
				{#if activity.movingTime}
					<div>
						<div class="stat-label">Time</div>
						<div class="stat-value">{formatDurationClock(activity.movingTime)}</div>
					</div>
				{/if}
				{#if activity.averageHeartrate}
					<div>
						<div class="stat-label">Avg HR</div>
						<div class="stat-value">{crosshairValues.heartrate ?? `${Math.round(activity.averageHeartrate)} bpm`}</div>
					</div>
				{/if}
				{#if activity.totalElevationGain && activity.totalElevationGain > 0}
					<div>
						<div class="stat-label">Elevation</div>
						<div class="stat-value">{crosshairValues.elevation ?? `+${formatElevation(activity.totalElevationGain, units)}`}</div>
					</div>
				{/if}
				{#if activity.averageCadence}
					<div>
						<div class="stat-label">Cadence</div>
						<div class="stat-value">{crosshairValues.cadence ?? `${Math.round(activity.averageCadence * 2)} spm`}</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Notes -->
		{#if notes.length > 0}
			<div class="section">
				<div class="section-header">Notes ({notes.length})</div>
				<div class="notes-list">
					{#each notes as note (note.id)}
						<button
							class="note-btn"
							style="background: {termState.highlightedNoteId === note.id ? 'var(--term-surface-hover)' : 'transparent'};"
							onclick={() => termState.highlightedNoteId = termState.highlightedNoteId === note.id ? null : note.id}
						>
							<span class="note-dist">{formatDistance(note.distanceStart, units)}</span>
							<span class="note-text">{note.content}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Laps -->
		{#if laps.length > 0}
			<div class="section">
				<div class="section-header">Laps ({laps.length})</div>
				<table class="laps-table" style="font-variant-numeric: tabular-nums;">
					<thead>
						<tr>
							<th class="text-left">#</th>
							<th class="text-right">Dist</th>
							<th class="text-right">Pace</th>
							<th class="text-right">HR</th>
						</tr>
					</thead>
					<tbody>
						{#each laps as lap (lap.id)}
							<tr>
								<td>{lap.lapIndex + 1}</td>
								<td class="text-right">{lap.distance ? formatDistancePrecise(lap.distance, units) : '—'}</td>
								<td class="text-right" style="color: var(--term-text-bright);">{formatPace(lap.averageSpeed, units)}</td>
								<td class="text-right">{lap.averageHeartrate ? Math.round(lap.averageHeartrate) : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/if}

<style>
	.sidebar-collapsed {
		width: 26px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		background: var(--term-surface);
		backdrop-filter: blur(12px);
		border: 1px solid var(--term-border);
		border-radius: 4px;
	}

	.sidebar-collapsed:hover {
		background: var(--term-surface-hover);
	}

	.collapse-icon {
		font-size: 15px;
		color: var(--term-text-muted);
		font-family: 'Geist Mono', monospace;
	}

	.sidebar {
		width: 310px;
		flex-shrink: 0;
		overflow-y: auto;
		background: var(--term-surface);
		backdrop-filter: blur(12px);
		border: 1px solid var(--term-border);
		border-radius: 4px;
		font-family: 'Geist Mono', monospace;
	}

	.sidebar-header {
		display: flex;
		justify-content: flex-end;
		padding: 4px 4px 0;
	}

	.collapse-btn {
		font-size: 15px;
		color: var(--term-text-muted);
		cursor: pointer;
		padding: 0 4px;
		border-radius: 3px;
		font-family: 'Geist Mono', monospace;
		line-height: 1;
	}

	.collapse-btn:hover {
		color: var(--term-text-bright);
		background: var(--term-surface-hover);
	}

	.section {
		padding: 8px 12px;
		border-bottom: 1px solid var(--term-border);
	}

	.section:last-child {
		border-bottom: none;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 16px;
	}

	.stat-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--term-text-muted);
	}

	.stat-value {
		font-size: 15px;
		font-weight: 500;
		color: var(--term-text-bright);
	}

	.section-header {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--term-text-muted);
		margin-bottom: 6px;
	}

	.notes-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.note-btn {
		width: 100%;
		text-align: left;
		padding: 4px 6px;
		border-radius: 3px;
		font-size: 12px;
		cursor: pointer;
	}

	.note-dist {
		color: var(--term-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.note-text {
		color: var(--term-text);
		margin-left: 4px;
	}

	.laps-table {
		width: 100%;
		font-size: 12px;
		color: var(--term-text);
	}

	.laps-table th {
		font-weight: normal;
		color: var(--term-text-muted);
		padding: 2px 0;
	}

	.laps-table td {
		padding: 2px 0;
	}
</style>
