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
	import type { ActivityData } from './types';
	import { encodeLayout, encodeSettings, decodeLayout, decodeSettings, getNextPanelId, resetNextPanelId, type LayoutPanel } from './layout-url';
	import { GRID_COLS, GRID_ROWS } from './grid-validation';
	import { DATA_SOURCE_COLORS } from './terminal-state.svelte';
	import { findSplitForNewPanel, MAX_PANELS } from './grid-validation';

	interface SavedLayout {
		id: number;
		name: string;
		encoded: string;
		isDefault: boolean;
	}

	interface Props {
		activity: ActivityData;
		units: Units;
		termState: TerminalState;
		notes: ActivityNote[];
		laps: ActivityLap[];
		crosshairValues?: Record<string, string | null>;
		savedLayouts?: SavedLayout[];
		onlayoutschange?: () => void;
	}

	let {
		activity,
		units,
		termState,
		notes,
		laps,
		crosshairValues = {},
		savedLayouts = [],
		onlayoutschange,
	}: Props = $props();

	let showDisplay = $state(true);
	let showProcessing = $state(false);
	let savingName = $state('');
	let showSaveInput = $state(false);

	function updateParam<K extends keyof ProcessingParams>(key: K, value: ProcessingParams[K]) {
		termState.params = { ...termState.params, [key]: value };
	}

	function getCurrentEncoded(): string {
		const layoutStr = encodeLayout(termState.layoutPanels);
		const settingsStr = encodeSettings({
			xAxis: termState.xAxis,
			showZones: termState.showZones,
			showNotes: termState.showNotes,
			showPauseGaps: termState.showPauseGaps,
			smoothingWindow: termState.params.smoothingWindow,
			samplePoints: termState.params.samplePoints,
			pauseThreshold: termState.params.pauseThreshold,
			wickPercentile: termState.wickPercentile,
		});
		return settingsStr ? `${layoutStr}&${settingsStr}` : layoutStr;
	}

	async function saveLayout() {
		if (!savingName.trim()) return;
		const encoded = getCurrentEncoded();
		const res = await fetch('/api/terminal-layouts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: savingName.trim(), encoded }),
		});
		if (res.ok) {
			const { id } = await res.json();
			termState.activeLayoutId = id;
			showSaveInput = false;
			savingName = '';
			onlayoutschange?.();
		}
	}

	async function updateLayout(layout: SavedLayout) {
		const encoded = getCurrentEncoded();
		await fetch(`/api/terminal-layouts/${layout.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ encoded }),
		});
		onlayoutschange?.();
	}

	let confirmDeleteId = $state<number | null>(null);

	async function deleteLayout(layout: SavedLayout) {
		if (confirmDeleteId !== layout.id) {
			confirmDeleteId = layout.id;
			return;
		}
		confirmDeleteId = null;
		await fetch(`/api/terminal-layouts/${layout.id}`, { method: 'DELETE' });
		if (termState.activeLayoutId === layout.id) {
			termState.activeLayoutId = null;
		}
		onlayoutschange?.();
	}

	async function toggleDefault(layout: SavedLayout) {
		if (layout.isDefault) {
			await fetch(`/api/terminal-layouts/${layout.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isDefault: false }),
			});
		} else {
			await fetch(`/api/terminal-layouts/${layout.id}/default`, { method: 'POST' });
		}
		onlayoutschange?.();
	}

	function addPanel() {
		const split = findSplitForNewPanel(termState.layoutPanels);
		if (!split) return;

		const newPanels = termState.layoutPanels.map((p, i) => {
			if (i === split.panelIndex) {
				return { ...p, config: { ...p.config }, placement: { ...split.shrunkPlacement } };
			}
			return { ...p, config: { ...p.config }, placement: { ...p.placement } };
		});

		newPanels.push({
			id: getNextPanelId(),
			config: { kind: 'chart', dataSource: 'pace', chartType: 'line' },
			placement: split.placement,
		});

		termState.layoutPanels = newPanels;
	}

	function loadLayout(layout: SavedLayout) {
		const encoded = layout.encoded;
		const parts = encoded.split('&');
		const layoutStr = parts[0];
		const settingsStr = parts.slice(1).join('&');

		const { panels } = decodeLayout(layoutStr);
		termState.layoutPanels = panels;
		termState.activeLayoutId = layout.id;
		resetNextPanelId(panels.length + 1);

		const settings = decodeSettings(new URLSearchParams(settingsStr));
		termState.xAxis = settings.xAxis;
		termState.showZones = settings.showZones;
		termState.showNotes = settings.showNotes;
		termState.showPauseGaps = settings.showPauseGaps;
		termState.params = {
			smoothingWindow: settings.smoothingWindow,
			samplePoints: settings.samplePoints,
			pauseThreshold: settings.pauseThreshold,
		};
		termState.wickPercentile = settings.wickPercentile;
	}

	let tooltipLayoutId = $state<number | null>(null);
	let tooltipPanels = $state<LayoutPanel[] | null>(null);
	let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

	function getPanelColor(panel: LayoutPanel): string {
		if (panel.config.kind === 'special') return 'var(--term-text-muted)';
		if (panel.config.dataSource) return DATA_SOURCE_COLORS[panel.config.dataSource] ?? 'var(--term-text-muted)';
		return 'var(--term-text-muted)';
	}

	function showTooltip(layout: SavedLayout) {
		clearTooltip();
		tooltipTimer = setTimeout(() => {
			const { panels } = decodeLayout(layout.encoded.split('&')[0]);
			tooltipLayoutId = layout.id;
			tooltipPanels = panels;
		}, 300);
	}

	function clearTooltip() {
		if (tooltipTimer) {
			clearTimeout(tooltipTimer);
			tooltipTimer = null;
		}
		tooltipLayoutId = null;
		tooltipPanels = null;
	}
</script>

<div class="h-full overflow-y-auto" style="background: var(--term-surface); backdrop-filter: blur(12px); border-left: 1px solid var(--term-border); width: 280px;">
	<!-- Stats -->
	<div class="px-3 py-3" style="border-bottom: 1px solid var(--term-border);">
		<div class="grid grid-cols-2 gap-x-4 gap-y-1.5" style="font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums;">
			{#if activity.distance}
				<div>
					<div class="text-[10px] uppercase tracking-wide" style="color: var(--term-text-muted);">Distance</div>
					<div class="text-[14px] font-medium" style="color: var(--term-text-bright);">{formatDistance(activity.distance, units)}</div>
				</div>
			{/if}
			{#if activity.averageSpeed}
				<div>
					<div class="text-[10px] uppercase tracking-wide" style="color: var(--term-text-muted);">Avg Pace</div>
					<div class="text-[14px] font-medium" style="color: var(--term-text-bright);">{crosshairValues.pace ?? formatPace(activity.averageSpeed, units)}</div>
				</div>
			{/if}
			{#if activity.movingTime}
				<div>
					<div class="text-[10px] uppercase tracking-wide" style="color: var(--term-text-muted);">Time</div>
					<div class="text-[14px] font-medium" style="color: var(--term-text-bright);">{formatDurationClock(activity.movingTime)}</div>
				</div>
			{/if}
			{#if activity.averageHeartrate}
				<div>
					<div class="text-[10px] uppercase tracking-wide" style="color: var(--term-text-muted);">Avg HR</div>
					<div class="text-[14px] font-medium" style="color: var(--term-text-bright);">{crosshairValues.heartrate ?? `${Math.round(activity.averageHeartrate)} bpm`}</div>
				</div>
			{/if}
			{#if activity.totalElevationGain && activity.totalElevationGain > 0}
				<div>
					<div class="text-[10px] uppercase tracking-wide" style="color: var(--term-text-muted);">Elevation</div>
					<div class="text-[14px] font-medium" style="color: var(--term-text-bright);">{crosshairValues.elevation ?? `+${formatElevation(activity.totalElevationGain, units)}`}</div>
				</div>
			{/if}
			{#if activity.averageCadence}
				<div>
					<div class="text-[10px] uppercase tracking-wide" style="color: var(--term-text-muted);">Cadence</div>
					<div class="text-[14px] font-medium" style="color: var(--term-text-bright);">{crosshairValues.cadence ?? `${Math.round(activity.averageCadence * 2)} spm`}</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Controls -->
	<div style="border-bottom: 1px solid var(--term-border);">
		<button
			class="w-full flex items-center justify-between px-3 py-2 cursor-pointer"
			style="color: var(--term-text); font-size: 12px; font-weight: 500;"
			onclick={() => showDisplay = !showDisplay}
		>
			Display
			<span class="text-[9px]" style="color: var(--term-text-muted);">{showDisplay ? '−' : '+'}</span>
		</button>
		{#if showDisplay}
			<div class="px-3 pb-3 flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<span class="text-[11px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">X-Axis</span>
					<div class="flex gap-0.5">
						<button
							class="px-2 py-0.5 text-[10px] rounded"
							style="font-family: 'Geist Mono', monospace; {termState.xAxis === 'distance' ? 'background: var(--term-surface-hover); color: var(--term-text-bright);' : 'color: var(--term-text-muted);'}"
							onclick={() => termState.xAxis = 'distance'}
						>Dist</button>
						<button
							class="px-2 py-0.5 text-[10px] rounded"
							style="font-family: 'Geist Mono', monospace; {termState.xAxis === 'time' ? 'background: var(--term-surface-hover); color: var(--term-text-bright);' : 'color: var(--term-text-muted);'}"
							onclick={() => termState.xAxis = 'time'}
						>Time</button>
					</div>
				</div>
				<label class="flex items-center justify-between cursor-pointer">
					<span class="text-[11px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Zones</span>
					<input type="checkbox" bind:checked={termState.showZones} class="rounded" />
				</label>
				<label class="flex items-center justify-between cursor-pointer">
					<span class="text-[11px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Notes</span>
					<input type="checkbox" bind:checked={termState.showNotes} class="rounded" />
				</label>
				<label class="flex items-center justify-between cursor-pointer">
					<span class="text-[11px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Pause Gaps</span>
					<input type="checkbox" bind:checked={termState.showPauseGaps} class="rounded" />
				</label>
			</div>
		{/if}
	</div>

	<div style="border-bottom: 1px solid var(--term-border);">
		<button
			class="w-full flex items-center justify-between px-3 py-2 cursor-pointer"
			style="color: var(--term-text); font-size: 12px; font-weight: 500;"
			onclick={() => showProcessing = !showProcessing}
		>
			Processing
			<span class="text-[9px]" style="color: var(--term-text-muted);">{showProcessing ? '−' : '+'}</span>
		</button>
		{#if showProcessing}
			<div class="px-3 pb-3 flex flex-col gap-2">
				<div>
					<div class="flex items-center justify-between mb-1">
						<span class="text-[11px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Smoothing</span>
						<span class="text-[11px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">{termState.params.smoothingWindow}</span>
					</div>
					<input type="range" min="0" max="10" step="1" value={termState.params.smoothingWindow}
						oninput={(e) => updateParam('smoothingWindow', parseInt((e.target as HTMLInputElement).value))}
						class="w-full h-1 rounded appearance-none" style="background: var(--term-border);" />
				</div>
				<div>
					<div class="flex items-center justify-between mb-1">
						<span class="text-[11px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Samples</span>
						<span class="text-[11px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">{termState.params.samplePoints}</span>
					</div>
					<input type="range" min="100" max="2000" step="100" value={termState.params.samplePoints}
						oninput={(e) => updateParam('samplePoints', parseInt((e.target as HTMLInputElement).value))}
						class="w-full h-1 rounded appearance-none" style="background: var(--term-border);" />
				</div>
				<div>
					<div class="flex items-center justify-between mb-1">
						<span class="text-[11px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Pause (m/s)</span>
						<span class="text-[11px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">{termState.params.pauseThreshold.toFixed(1)}</span>
					</div>
					<input type="range" min="0.1" max="3.0" step="0.1" value={termState.params.pauseThreshold}
						oninput={(e) => updateParam('pauseThreshold', parseFloat((e.target as HTMLInputElement).value))}
						class="w-full h-1 rounded appearance-none" style="background: var(--term-border);" />
				</div>
				<div>
					<div class="flex items-center justify-between mb-1">
						<span class="text-[11px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Wick Clip</span>
						<span class="text-[11px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">p{termState.wickPercentile}–{100 - termState.wickPercentile}</span>
					</div>
					<input type="range" min="0" max="25" step="1" value={termState.wickPercentile}
						oninput={(e) => termState.wickPercentile = parseInt((e.target as HTMLInputElement).value)}
						class="w-full h-1 rounded appearance-none" style="background: var(--term-border);" />
				</div>
			</div>
		{/if}
	</div>

	<!-- Layout -->
	<div style="border-bottom: 1px solid var(--term-border);">
		<div class="px-3 py-2 flex flex-col gap-2">
			<div class="flex gap-1">
				<button
					class="flex-1 text-[11px] px-2 py-1 rounded"
					style="color: var(--term-text-muted); border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
					onclick={() => { showSaveInput = true; }}
				>Save</button>
				<button
					class="flex-1 text-[11px] px-2 py-1 rounded"
					style="color: var(--term-text-muted); border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
					onclick={() => termState.resetLayout()}
				>Reset</button>
			</div>
			<div class="flex gap-1">
				<button
					class="flex-1 text-[11px] px-2 py-1 rounded"
					style="color: var(--term-text-muted); border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
					disabled={termState.layoutPanels.length >= MAX_PANELS}
					onclick={addPanel}
				>+ Add Panel</button>
			</div>
			{#if showSaveInput}
				<form class="flex gap-1" onsubmit={(e) => { e.preventDefault(); saveLayout(); }}>
					<input
						type="text"
						bind:value={savingName}
						placeholder="Layout name"
						class="flex-1 text-[11px] px-2 py-1 rounded bg-transparent outline-none"
						style="color: var(--term-text); border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
					/>
					<button
						type="submit"
						class="text-[11px] px-2 py-1 rounded"
						style="color: var(--term-text-bright); border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
					>OK</button>
					<button
						type="button"
						class="text-[11px] px-1 py-1 rounded"
						style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;"
						onclick={() => { showSaveInput = false; savingName = ''; }}
					>x</button>
				</form>
			{/if}
			{#if savedLayouts.length > 0}
				<div class="flex flex-col gap-0.5">
					<span class="text-[10px] uppercase tracking-wide" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">
						Saved
					</span>
					{#each savedLayouts as layout (layout.id)}
						<div class="flex items-center gap-1 py-0.5 px-1 rounded" style="position: relative; background: {termState.activeLayoutId === layout.id ? 'var(--term-surface-hover)' : 'transparent'};">
							{#if tooltipLayoutId === layout.id && tooltipPanels}
								{@const svgW = 72}
								{@const svgH = 36}
								{@const cellW = svgW / GRID_COLS}
								{@const cellH = svgH / GRID_ROWS}
								<div
									class="absolute pointer-events-none"
									style="bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 4px; z-index: 50;"
								>
									<svg width={svgW} height={svgH} style="background: var(--term-bg); border: 1px solid var(--term-border); border-radius: 3px;">
										{#each tooltipPanels as panel (panel.id)}
											<rect
												x={panel.placement.col * cellW + 0.5}
												y={panel.placement.row * cellH + 0.5}
												width={panel.placement.colSpan * cellW - 1}
												height={panel.placement.rowSpan * cellH - 1}
												fill={getPanelColor(panel)}
												opacity="0.6"
												rx="1"
											/>
										{/each}
									</svg>
								</div>
							{/if}
							<button
								class="flex-1 text-left text-[11px] cursor-pointer truncate"
								style="color: {termState.activeLayoutId === layout.id ? 'var(--term-text-bright)' : 'var(--term-text)'}; font-family: 'Geist Mono', monospace;"
								onclick={() => loadLayout(layout)}
								onmouseenter={() => showTooltip(layout)}
								onmouseleave={() => clearTooltip()}
							>
								{#if termState.activeLayoutId === layout.id}
									<span style="color: var(--term-snap-border);">&#x25cf;</span>
								{/if}
								{layout.name}
							</button>
							<button
								class="text-[10px] cursor-pointer shrink-0"
								style="color: {layout.isDefault ? 'var(--term-pace)' : 'var(--term-text-muted)'}; font-family: 'Geist Mono', monospace;"
								title={layout.isDefault ? 'Unset default' : 'Set as default'}
								onclick={() => toggleDefault(layout)}
							>{layout.isDefault ? '★' : '☆'}</button>
							{#if termState.activeLayoutId === layout.id}
								<button
									class="text-[10px] cursor-pointer shrink-0"
									style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;"
									title="Update with current layout"
									onclick={() => updateLayout(layout)}
								>↻</button>
							{/if}
							<button
								class="text-[10px] cursor-pointer shrink-0"
								style="color: {confirmDeleteId === layout.id ? 'var(--term-hr)' : 'var(--term-text-muted)'}; font-family: 'Geist Mono', monospace;"
								title={confirmDeleteId === layout.id ? 'Click again to confirm delete' : 'Delete'}
								onclick={() => deleteLayout(layout)}
								onmouseleave={() => { if (confirmDeleteId === layout.id) confirmDeleteId = null; }}
							>{confirmDeleteId === layout.id ? '✕?' : '✕'}</button>
						</div>
					{/each}
				</div>
			{/if}
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
						class="w-full text-left py-1 px-1.5 rounded text-[11px] cursor-pointer"
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
			<table class="w-full mt-1" style="font-family: 'Geist Mono', monospace; font-size: 11px; font-variant-numeric: tabular-nums;">
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
