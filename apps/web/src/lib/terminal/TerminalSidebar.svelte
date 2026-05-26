<script lang="ts">
	import {
		formatDistance,
		formatPace,
		formatElevation,
		formatDurationClock,
		formatDistancePrecise,
		type Units,
	} from '$lib/format';
	import { raceDistanceBounds } from '@web-runner/shared';
	import type { TerminalState, StreamData } from './terminal-state.svelte';
	import { type ActivityNote, type ActivityLap } from './terminal-state.svelte';
	import type { ActivityData } from './types';
	import { computeRaceSplits, SPLIT_CHOICES, MARATHON_METERS, type SplitChoice, type RaceSplit } from './marathon-splits';
	import { streamGpsTotal } from './normalize-distance';
	import { computeDecoupling } from './trendlines';

	interface CompareSidebarActivity {
		id: number;
		name: string;
		color: string;
		activity: ActivityData;
		streams: StreamData;
	}

	interface Props {
		activity: ActivityData;
		units: Units;
		termState: TerminalState;
		streams: StreamData;
		notes: ActivityNote[];
		laps: ActivityLap[];
		crosshairValues?: Record<string, string | null>;
		compareMode?: boolean;
		compareActivities?: CompareSidebarActivity[];
		onselectrange?: (startMeters: number, endMeters: number) => void;
	}

	let {
		activity,
		units,
		termState,
		streams,
		notes,
		laps,
		crosshairValues = {},
		compareMode = false,
		compareActivities = [],
		onselectrange,
	}: Props = $props();

	let collapsed = $state(false);
	let splitChoice = $state<SplitChoice>('5k');
	// Active split, keyed so each row tracks its own selection state.
	let activeSplitKey = $state<string | null>(null);

	function selectSplitChoice(choice: SplitChoice) {
		splitChoice = choice;
		activeSplitKey = null; // split indices change with the choice
	}

	function clickSplit(key: string, split: { startDistance: number; endDistance: number }) {
		if (activeSplitKey === key) {
			// Clicking the active split again clears the selection.
			termState.selectionRange = null;
			activeSplitKey = null;
			return;
		}
		onselectrange?.(split.startDistance, split.endDistance);
		activeSplitKey = key;
	}

	/** Cardiac drift (aerobic decoupling) as a signed percentage, or null. */
	function fmtDrift(s: StreamData): string | null {
		const d = computeDecoupling(s.velocity, s.heartrate);
		if (d == null) return null;
		return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
	}

	// Stat rows, so compare mode can stack each activity's value under one label.
	const STAT_DEFS: { label: string; get: (a: ActivityData, s: StreamData) => string | null }[] = [
		{ label: 'Distance', get: (a) => (a.distance ? formatDistance(a.distance, units) : null) },
		{ label: 'Avg Pace', get: (a) => (a.averageSpeed ? formatPace(a.averageSpeed, units) : null) },
		{ label: 'Time', get: (a) => (a.movingTime ? formatDurationClock(a.movingTime) : null) },
		{ label: 'Avg HR', get: (a) => (a.averageHeartrate ? `${Math.round(a.averageHeartrate)} bpm` : null) },
		{
			label: 'Elevation',
			get: (a) => (a.totalElevationGain && a.totalElevationGain > 0 ? `+${formatElevation(a.totalElevationGain, units)}` : null),
		},
		{ label: 'Cadence', get: (a) => (a.averageCadence ? `${Math.round(a.averageCadence * 2)} spm` : null) },
		{ label: 'Drift', get: (_a, s) => fmtDrift(s) },
	];

	let driftSingle = $derived(compareMode ? null : fmtDrift(streams));

	// Drop the highlight whenever the selection is cleared elsewhere (e.g. clicking a chart).
	$effect(() => {
		if (termState.selectionRange === null) activeSplitKey = null;
	});

	/** Format a signed split delta (seconds) as "+M:SS" / "−M:SS". */
	function formatDelta(seconds: number | null): string {
		if (seconds == null) return '—';
		if (seconds === 0) return '±0:00';
		const sign = seconds > 0 ? '+' : '−';
		return `${sign}${formatDurationClock(Math.abs(seconds))}`;
	}

	function isMarathon(act: ActivityData): boolean {
		if (act.workoutType !== 'race') return false;
		if (act.sportType !== 'run' && act.sportType !== 'trail_run') return false;
		if (!act.distance) return false;
		const { lo, hi } = raceDistanceBounds(MARATHON_METERS);
		return act.distance >= lo && act.distance <= hi;
	}

	// "Half" is half of the reference distance; 5K/10K are fixed intervals.
	function splitMetersForChoice(choice: SplitChoice, total: number): number {
		if (choice === 'half') return total / 2;
		return choice === '10k' ? 10000 : 5000;
	}

	function splitsFor(strm: StreamData, officialTotal: number | null | undefined): RaceSplit[] {
		const dist = strm.distance;
		const time = strm.time;
		if (!dist?.length || !time?.length) return [];
		const gpsTotal = dist[dist.length - 1];
		if (!gpsTotal || gpsTotal <= 0 || !officialTotal || officialTotal <= 0) return [];
		return computeRaceSplits({
			distanceStream: dist,
			timeStream: time,
			splitMeters: splitMetersForChoice(splitChoice, officialTotal),
			choice: splitChoice,
			officialTotal,
			gpsTotal,
		});
	}

	// Single mode: only marathon races, even-distributed to the official marathon.
	let singleSplits = $derived(!compareMode && isMarathon(activity) ? splitsFor(streams, MARATHON_METERS) : []);

	// Compare mode: splits for every compared activity, based on each activity's
	// own (possibly normalized) distance, aligned by split index.
	let compareSplitsList = $derived(
		!compareMode
			? []
			: compareActivities
					.map((a) => ({
						id: a.id,
						name: a.name,
						color: a.color,
						splits: splitsFor(a.streams, a.activity.distance ?? streamGpsTotal(a.streams)),
					}))
					.filter((a) => a.splits.length > 0),
	);
	// Longest split set defines the rows; shorter activities show "—" beyond their finish.
	let canonicalSplits = $derived(
		compareSplitsList.reduce((best, a) => (a.splits.length > best.length ? a.splits : best), [] as RaceSplit[]),
	);

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

		{#snippet statsGrid(act: ActivityData, cross: Record<string, string | null>)}
			<div class="stats-grid" style="font-variant-numeric: tabular-nums;">
				{#if act.distance}
					<div>
						<div class="stat-label">Distance</div>
						<div class="stat-value">{formatDistance(act.distance, units)}</div>
					</div>
				{/if}
				{#if act.averageSpeed}
					<div>
						<div class="stat-label">Avg Pace</div>
						<div class="stat-value">{cross.pace ?? formatPace(act.averageSpeed, units)}</div>
					</div>
				{/if}
				{#if act.movingTime}
					<div>
						<div class="stat-label">Time</div>
						<div class="stat-value">{formatDurationClock(act.movingTime)}</div>
					</div>
				{/if}
				{#if act.averageHeartrate}
					<div>
						<div class="stat-label">Avg HR</div>
						<div class="stat-value">{cross.heartrate ?? `${Math.round(act.averageHeartrate)} bpm`}</div>
					</div>
				{/if}
				{#if act.totalElevationGain && act.totalElevationGain > 0}
					<div>
						<div class="stat-label">Elevation</div>
						<div class="stat-value">{cross.elevation ?? `+${formatElevation(act.totalElevationGain, units)}`}</div>
					</div>
				{/if}
				{#if act.averageCadence}
					<div>
						<div class="stat-label">Cadence</div>
						<div class="stat-value">{cross.cadence ?? `${Math.round(act.averageCadence * 2)} spm`}</div>
					</div>
				{/if}
				{#if driftSingle != null}
					<div title="Aerobic decoupling (cardiac drift)">
						<div class="stat-label">Drift</div>
						<div class="stat-value">{driftSingle}</div>
					</div>
				{/if}
			</div>
		{/snippet}

		{#snippet splitToggle()}
			<div class="split-toggle">
				{#each SPLIT_CHOICES as c (c.value)}
					<button
						class="split-btn"
						style:color={splitChoice === c.value ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}
						style:background={splitChoice === c.value ? 'var(--term-surface-hover)' : 'transparent'}
						onclick={() => selectSplitChoice(c.value)}
					>{c.label}</button>
				{/each}
			</div>
		{/snippet}

		{#snippet splitsTable(splits: RaceSplit[])}
			<table class="laps-table" style="font-variant-numeric: tabular-nums;">
				<thead>
					<tr>
						<th class="text-left"></th>
						<th class="text-right">Time</th>
						<th class="text-right">Δ</th>
						<th class="text-right">Total</th>
					</tr>
				</thead>
				<tbody>
					{#each splits as split (split.index)}
						<tr
							class="split-row"
							class:active={activeSplitKey === `s${split.index}`}
							role="button"
							tabindex="0"
							title="Select this split on the charts"
							onclick={() => clickSplit(`s${split.index}`, split)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickSplit(`s${split.index}`, split); } }}
						>
							<td>{split.label}</td>
							<td class="text-right" style="color: var(--term-text-bright);">{formatDurationClock(split.elapsed)}</td>
							<td
								class="text-right"
								style:color={split.delta == null || split.delta === 0
									? 'var(--term-text-muted)'
									: split.delta > 0
										? 'var(--term-hr)'
										: 'var(--term-pace)'}
							>{formatDelta(split.delta)}</td>
							<td class="text-right">{formatDurationClock(split.cumulative)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/snippet}

		<!-- Stats -->
		{#if compareMode}
			<div class="section">
				<div class="stats-grid" style="font-variant-numeric: tabular-nums;">
					{#each STAT_DEFS as stat (stat.label)}
						{#if compareActivities.some((a) => stat.get(a.activity, a.streams) != null)}
							<div>
								<div class="stat-label">{stat.label}</div>
								{#each compareActivities as ca (ca.id)}
									{@const v = stat.get(ca.activity, ca.streams)}
									{#if v != null}
										<div class="stat-value stat-stack" style:color={ca.color}>{v}</div>
									{/if}
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{:else}
			<div class="section">
				{@render statsGrid(activity, crosshairValues)}
			</div>
		{/if}

		<!-- Splits -->
		{#if compareMode && compareSplitsList.length > 0}
			<div class="section">
				<div class="section-header splits-header">
					<span>Splits</span>
					{@render splitToggle()}
				</div>
				<table class="laps-table" style="font-variant-numeric: tabular-nums;">
					<thead>
						<tr>
							<th class="text-left"></th>
							<th class="text-right">Time</th>
							<th class="text-right">Δ</th>
							<th class="text-right">Total</th>
						</tr>
					</thead>
					<tbody>
						{#each canonicalSplits as canon, i (canon.index)}
							<tr
								class="split-row"
								class:active={activeSplitKey === `c${canon.index}`}
								role="button"
								tabindex="0"
								title="Select this split on the charts"
								onclick={() => clickSplit(`c${canon.index}`, canon)}
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickSplit(`c${canon.index}`, canon); } }}
							>
								<td>{canon.label}</td>
								<td class="text-right">
									{#each compareSplitsList as m (m.id)}
										<div class="split-stack" style:color={m.color}>{m.splits[i] ? formatDurationClock(m.splits[i].elapsed) : '—'}</div>
									{/each}
								</td>
								<td class="text-right">
									{#each compareSplitsList as m (m.id)}
										{@const d = m.splits[i]?.delta}
										<div
											class="split-stack"
											style:color={!m.splits[i] || d == null || d === 0
												? 'var(--term-text-muted)'
												: d > 0
													? 'var(--term-hr)'
													: 'var(--term-pace)'}
										>{m.splits[i] ? formatDelta(d ?? null) : '—'}</div>
									{/each}
								</td>
								<td class="text-right">
									{#each compareSplitsList as m (m.id)}
										<div class="split-stack" style:color={m.color}>{m.splits[i] ? formatDurationClock(m.splits[i].cumulative) : '—'}</div>
									{/each}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if !compareMode && singleSplits.length > 0}
			<div class="section">
				<div class="section-header splits-header">
					<span>Splits</span>
					{@render splitToggle()}
				</div>
				{@render splitsTable(singleSplits)}
			</div>
		{/if}

		{#if !compareMode}
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

	.splits-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.stat-stack {
		font-size: 14px;
		line-height: 1.35;
	}

	.split-stack {
		line-height: 1.4;
	}

	.split-toggle {
		display: flex;
		gap: 2px;
	}

	.split-btn {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 3px;
		cursor: pointer;
		font-family: 'Geist Mono', monospace;
		letter-spacing: 0.05em;
	}

	.split-btn:hover {
		color: var(--term-text-bright);
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

	.split-row {
		cursor: pointer;
	}

	.split-row:hover td {
		background: var(--term-surface-hover);
	}

	.split-row.active td {
		background: var(--term-surface-hover);
		color: var(--term-text-bright);
	}
</style>
