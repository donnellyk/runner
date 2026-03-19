<script lang="ts">
	import { onMount } from 'svelte';
	import {
		type PanelConfig,
		type DataSource,
		type ChartType,
		type SpecialPanel,
		CHART_TYPE_MATRIX,
		DATA_SOURCE_LABELS,
		DATA_SOURCE_COLORS,
		SPECIAL_PANEL_LABELS,
		COLOR_PALETTE,
		type StreamData,
	} from './terminal-state.svelte';
	import { getAvailableDataSources } from './terminal-state.svelte';

	interface Props {
		config: PanelConfig;
		streams: StreamData;
		hasLaps: boolean;
		canRemove: boolean;
		defaults: { smoothingWindow: number; showPauseGaps: boolean; showZones: boolean };
		anchorRect: { top: number; left: number; right: number; bottom: number };
		onchange: (config: PanelConfig) => void;
		onremove?: () => void;
		onclose: () => void;
	}

	let { config, streams, hasLaps, canRemove, defaults, anchorRect, onchange, onremove, onclose }: Props = $props();

	let availableSources = $derived(getAvailableDataSources(streams));

	const POPUP_W = 240;
	let popupTop = $state(0);
	let popupLeft = $state(0);

	onMount(() => {
		popupTop = anchorRect.bottom + 4;
		popupLeft = anchorRect.right - POPUP_W;
		if (popupTop + 400 > window.innerHeight) {
			popupTop = Math.max(8, anchorRect.top - 400 - 4);
		}
		if (popupLeft < 8) popupLeft = 8;
		if (popupLeft + POPUP_W > window.innerWidth - 8) {
			popupLeft = window.innerWidth - POPUP_W - 8;
		}

		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				e.stopImmediatePropagation();
				e.preventDefault();
				onclose();
			}
		}
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	let chartTypes = $derived(
		config.kind === 'chart' && config.dataSource
			? CHART_TYPE_MATRIX[config.dataSource]
			: [],
	);

	let activeColor = $derived(
		config.kind === 'chart' && config.dataSource
			? config.colorOverride ?? DATA_SOURCE_COLORS[config.dataSource]
			: undefined,
	);

	let hasOverrides = $derived(
		config.smoothingOverride !== undefined ||
		config.pauseGapsOverride !== undefined ||
		config.zonesOverride !== undefined,
	);

	function optStyle(selected: boolean): string {
		return `color: ${selected ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}; background: ${selected ? 'var(--term-surface-hover)' : 'transparent'}; border: 1px solid ${selected ? 'var(--term-border)' : 'transparent'};`;
	}

	function handleSourceChange(e: Event) {
		const v = (e.target as HTMLSelectElement).value;
		if (v.startsWith('special:')) {
			onchange({ kind: 'special', specialType: v.slice(8) as SpecialPanel });
		} else {
			const source = v.slice(5) as DataSource;
			const types = CHART_TYPE_MATRIX[source];
			const current = config.chartType;
			const chartType = current && types.includes(current) ? current : types[0];
			onchange({ kind: 'chart', dataSource: source, chartType });
		}
	}

	function setChartType(type: ChartType) {
		onchange({ ...config, chartType: type });
	}

	function setCandlestickMode(mode: 'splits' | 'laps') {
		onchange({ ...config, candlestickMode: mode });
	}

	function setBarMode(mode: 'stream' | 'splits' | 'laps') {
		onchange({ ...config, barMode: mode });
	}

	function setColor(color: string | undefined) {
		onchange({ ...config, colorOverride: color });
	}

	function setSmoothing(e: Event) {
		onchange({ ...config, smoothingOverride: Number((e.target as HTMLInputElement).value) });
	}

	function togglePauseGaps() {
		const current = config.pauseGapsOverride ?? defaults.showPauseGaps;
		onchange({ ...config, pauseGapsOverride: !current });
	}

	function toggleZones() {
		const current = config.zonesOverride ?? defaults.showZones;
		onchange({ ...config, zonesOverride: !current });
	}

	function resetOverrides() {
		onchange({ ...config, smoothingOverride: undefined, pauseGapsOverride: undefined, zonesOverride: undefined });
	}

	function handleRemove() {
		onremove?.();
		onclose();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0" style="z-index: 98;" onclick={onclose}></div>

<div
	data-terminal
	class="config-popup"
	style="top: {popupTop}px; left: {popupLeft}px; width: {POPUP_W}px;"
>
	<!-- Data source (select menu) -->
	<div>
		<div class="section-label">Data</div>
		<select
			class="source-select"
			value={config.kind === 'special' ? `special:${config.specialType}` : `data:${config.dataSource}`}
			onchange={handleSourceChange}
		>
			<optgroup label="Data">
				{#each availableSources as source (source)}
					<option value="data:{source}">{DATA_SOURCE_LABELS[source]}</option>
				{/each}
			</optgroup>
			<optgroup label="Special">
				{#each (['map', 'notes', 'heatmap'] as const) as type (type)}
					<option value="special:{type}">{SPECIAL_PANEL_LABELS[type]}</option>
				{/each}
				{#if hasLaps}
					<option value="special:laps">{SPECIAL_PANEL_LABELS['laps']}</option>
				{/if}
			</optgroup>
		</select>
	</div>

	<!-- Chart type -->
	{#if config.kind === 'chart' && chartTypes.length > 0}
		<div>
			<div class="section-label">Chart</div>
			<div class="flex gap-1">
				{#each chartTypes as type (type)}
					<button
						class="opt-btn"
						style={optStyle(config.chartType === type)}
						onclick={() => setChartType(type)}
					>{type}</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Mode -->
	{#if config.chartType === 'candlestick'}
		<div>
			<div class="section-label">Mode</div>
			<div class="flex gap-1">
				<button class="opt-btn" style={optStyle((config.candlestickMode ?? 'splits') === 'splits')} onclick={() => setCandlestickMode('splits')}>Splits</button>
				{#if hasLaps}
					<button class="opt-btn" style={optStyle(config.candlestickMode === 'laps')} onclick={() => setCandlestickMode('laps')}>Laps</button>
				{/if}
			</div>
		</div>
	{/if}
	{#if config.chartType === 'bar'}
		<div>
			<div class="section-label">Mode</div>
			<div class="flex gap-1">
				<button class="opt-btn" style={optStyle((config.barMode ?? 'stream') === 'stream')} onclick={() => setBarMode('stream')}>Stream</button>
				<button class="opt-btn" style={optStyle(config.barMode === 'splits')} onclick={() => setBarMode('splits')}>Splits</button>
				{#if hasLaps}
					<button class="opt-btn" style={optStyle(config.barMode === 'laps')} onclick={() => setBarMode('laps')}>Laps</button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Color -->
	{#if config.kind === 'chart' && activeColor}
		<div>
			<div class="section-label">Color</div>
			<div class="flex flex-wrap gap-1">
				{#each COLOR_PALETTE as color (color.value)}
					<button
						class="color-swatch"
						style="background: {color.value}; border-color: {color.value === activeColor ? 'var(--term-text-bright)' : 'transparent'};"
						title={color.label}
						onclick={() => setColor(color.value)}
					></button>
				{/each}
			</div>
			{#if config.colorOverride}
				<button class="opt-btn mt-1" style="color: var(--term-text-muted); border: 1px solid var(--term-border);" onclick={() => setColor(undefined)}>Reset Color</button>
			{/if}
		</div>
	{/if}

	<!-- Processing overrides -->
	{#if config.kind === 'chart'}
		<div>
			<div class="section-label">Processing</div>

			<div class="proc-row">
				<span class="proc-label" style:color={config.smoothingOverride !== undefined ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}>Smooth</span>
				<input
					type="range"
					class="proc-slider"
					min="0"
					max="20"
					value={config.smoothingOverride ?? defaults.smoothingWindow}
					oninput={setSmoothing}
				/>
				<span class="proc-val">{config.smoothingOverride ?? defaults.smoothingWindow}</span>
			</div>

			<div class="proc-row">
				<label class="flex items-center gap-1.5 cursor-pointer flex-1">
					<input type="checkbox"
						checked={config.pauseGapsOverride ?? defaults.showPauseGaps}
						onchange={togglePauseGaps}
						class="accent-current"
					/>
					<span class="proc-label" style:color={config.pauseGapsOverride !== undefined ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}>Pause Gaps</span>
				</label>
			</div>

			<div class="proc-row">
				<label class="flex items-center gap-1.5 cursor-pointer flex-1">
					<input type="checkbox"
						checked={config.zonesOverride ?? defaults.showZones}
						onchange={toggleZones}
						class="accent-current"
					/>
					<span class="proc-label" style:color={config.zonesOverride !== undefined ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}>Zones</span>
				</label>
			</div>

			{#if hasOverrides}
				<button
					class="opt-btn w-full mt-1"
					style="color: var(--term-text-muted); border: 1px solid var(--term-border);"
					onclick={resetOverrides}
				>Reset Overrides</button>
			{/if}
		</div>
	{/if}

	<!-- Remove -->
	{#if canRemove}
		<button
			class="opt-btn w-full"
			style="color: var(--term-text-muted); border: 1px solid var(--term-border);"
			onclick={handleRemove}
		>Remove Panel</button>
	{/if}
</div>

<style>
	.config-popup {
		position: fixed;
		z-index: 99;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
		max-height: calc(100vh - 16px);
		overflow-y: auto;
		background: var(--term-bg);
		border: 1px solid var(--term-border);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		font-family: 'Geist Mono', monospace;
	}

	.section-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--term-text-muted);
		margin-bottom: 4px;
	}

	.source-select {
		width: 100%;
		font-size: 12px;
		padding: 3px 4px;
		border-radius: 3px;
		cursor: pointer;
		background: var(--term-surface);
		color: var(--term-text);
		border: 1px solid var(--term-border);
		font-family: 'Geist Mono', monospace;
		outline: none;
	}

	.opt-btn {
		font-size: 11px;
		padding: 2px 6px;
		border-radius: 3px;
		cursor: pointer;
		font-family: 'Geist Mono', monospace;
	}

	.color-swatch {
		width: 20px;
		height: 20px;
		border-radius: 3px;
		cursor: pointer;
		border: 2px solid transparent;
	}

	.proc-row {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 4px;
	}

	.proc-row:last-child {
		margin-bottom: 0;
	}

	.proc-label {
		font-size: 11px;
		flex: 1;
	}

	.proc-slider {
		width: 80px;
		height: 12px;
		cursor: pointer;
		accent-color: var(--term-text-muted);
	}

	.proc-val {
		font-size: 11px;
		width: 16px;
		text-align: right;
		color: var(--term-text);
	}
</style>
