<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		type PanelConfig,
		type DataSource,
		type ChartType,
		type SpecialPanel,
		CHART_TYPE_MATRIX,
		DATA_SOURCE_LABELS,
		DATA_SOURCE_COLORS,
		COLOR_PALETTE,
		type StreamData,
	} from './terminal-state.svelte';
	import { getAvailableDataSources } from './terminal-state.svelte';

	interface Props {
		config: PanelConfig;
		streams: StreamData;
		onchange: (config: PanelConfig) => void;
		children: Snippet;
		hasLaps?: boolean;
		swapActive?: boolean;
		isSwapSource?: boolean;
		onswap?: () => void;
		onremove?: () => void;
		canRemove?: boolean;
	}

	let { config, streams, onchange, children, hasLaps = false, swapActive = false, isSwapSource = false, onswap, onremove, canRemove = false }: Props = $props();

	let availableSources = $derived(getAvailableDataSources(streams));
	let showColorPicker = $state(false);

	function setColor(color: string | undefined) {
		onchange({ ...config, colorOverride: color });
		showColorPicker = false;
	}

	let activeColor = $derived(
		config.kind === 'chart' && config.dataSource
			? config.colorOverride ?? DATA_SOURCE_COLORS[config.dataSource]
			: undefined,
	);

	function setSpecial(type: SpecialPanel) {
		onchange({ kind: 'special', specialType: type });
	}

	function setDataSource(source: DataSource) {
		const types = CHART_TYPE_MATRIX[source];
		const currentType = config.chartType;
		const chartType = currentType && types.includes(currentType) ? currentType : types[0];
		onchange({ kind: 'chart', dataSource: source, chartType });
	}

	function setChartType(type: ChartType) {
		onchange({ ...config, chartType: type });
	}

	function setCandlestickMode(mode: 'splits' | 'laps') {
		onchange({ ...config, candlestickMode: mode });
	}

	let chartTypes = $derived(
		config.kind === 'chart' && config.dataSource
			? CHART_TYPE_MATRIX[config.dataSource]
			: [],
	);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="flex flex-col h-full"
	style="background: var(--term-surface); backdrop-filter: blur(12px); border: 1px solid {swapActive && !isSwapSource ? 'var(--term-snap-border)' : 'var(--term-border)'}; border-radius: 4px; overflow: hidden; {isSwapSource ? 'opacity: 0.6;' : ''}"
	onclick={swapActive && !isSwapSource && onswap ? onswap : undefined}
>
	<div class="flex items-center gap-1 px-1.5 py-0.5 shrink-0" style="border-bottom: 1px solid var(--term-border);">
		{#if onswap}
			<button
				class="text-[9px] cursor-pointer px-1 rounded"
				style="color: {isSwapSource ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}; border: 1px solid {isSwapSource ? 'var(--term-snap-border)' : 'var(--term-border)'}; font-family: 'Geist Mono', monospace;"
				title={isSwapSource ? 'Cancel swap' : 'Swap with another panel'}
				onclick={(e) => { e.stopPropagation(); onswap!(); }}
			>{isSwapSource ? '...' : '\u21C4'}</button>
		{/if}
		<select
			class="bg-transparent text-[10px] uppercase tracking-wide cursor-pointer border-none outline-none"
			style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;"
			value={config.kind === 'special' ? `special:${config.specialType}` : `data:${config.dataSource}`}
			onchange={(e) => {
				const v = (e.target as HTMLSelectElement).value;
				if (v.startsWith('special:')) {
					setSpecial(v.slice(8) as SpecialPanel);
				} else {
					setDataSource(v.slice(5) as DataSource);
				}
			}}
		>
			<optgroup label="Data">
				{#each availableSources as source (source)}
					<option value="data:{source}">{DATA_SOURCE_LABELS[source]}</option>
				{/each}
			</optgroup>
			<optgroup label="Special">
				<option value="special:map">Map</option>
				<option value="special:notes">Notes</option>
				<option value="special:heatmap">Heatmap</option>
				{#if hasLaps}
					<option value="special:laps">Lap Comparison</option>
				{/if}
			</optgroup>
		</select>

		{#if config.kind === 'chart' && chartTypes.length > 0}
			<select
				class="bg-transparent text-[10px] uppercase tracking-wide cursor-pointer border-none outline-none"
				style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;"
				value={config.chartType}
				onchange={(e) => setChartType((e.target as HTMLSelectElement).value as ChartType)}
			>
				{#each chartTypes as type (type)}
					<option value={type}>{type}</option>
				{/each}
			</select>
		{/if}

		{#if config.chartType === 'candlestick'}
			<select
				class="bg-transparent text-[9px] uppercase tracking-wide cursor-pointer border-none outline-none ml-auto"
				style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;"
				value={config.candlestickMode ?? 'splits'}
				onchange={(e) => setCandlestickMode((e.target as HTMLSelectElement).value as 'splits' | 'laps')}
			>
				<option value="splits">Splits</option>
				{#if hasLaps}
					<option value="laps">Laps</option>
				{/if}
			</select>
		{/if}

		{#if config.kind === 'chart' && activeColor}
			<div class="ml-auto" style="position: relative;">
				<button
					class="w-3 h-3 rounded-sm cursor-pointer"
					style="background: {activeColor}; border: 1px solid var(--term-border);"
					title="Change color"
					onclick={() => showColorPicker = !showColorPicker}
				></button>
				{#if showColorPicker}
					<div
						style="
							position: fixed;
							z-index: 100;
							display: grid;
							grid-template-columns: repeat(4, 14px);
							gap: 3px;
							padding: 5px;
							border-radius: 4px;
							background: var(--term-bg);
							border: 1px solid var(--term-border);
							transform: translate(-100%, 4px);
						"
					>
						{#each COLOR_PALETTE as color (color.value)}
							<button
								class="rounded-sm cursor-pointer"
								style="width: 14px; height: 14px; background: {color.value}; border: 1px solid {color.value === activeColor ? 'var(--term-text-bright)' : 'transparent'};"
								title={color.label}
								onclick={() => setColor(color.value)}
							></button>
						{/each}
						{#if config.colorOverride}
							<button
								class="rounded-sm cursor-pointer"
								style="width: 100%; height: 14px; grid-column: 1 / -1; margin-top: 2px; color: var(--term-text-muted); border: 1px solid var(--term-border); font-size: 8px;"
								onclick={() => setColor(undefined)}
							>Reset</button>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
		{#if canRemove && onremove}
			<button
				class="text-[9px] cursor-pointer px-1 rounded ml-auto"
				style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;"
				title="Remove panel"
				onclick={(e) => { e.stopPropagation(); onremove!(); }}
			>&#x2715;</button>
		{/if}
	</div>

	<div class="flex-1" style="min-height: 0;">
		{@render children()}
	</div>
</div>
