<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		type PanelConfig,
		type DataSource,
		type ChartType,
		type SpecialPanel,
		CHART_TYPE_MATRIX,
		DATA_SOURCE_LABELS,
		type StreamData,
	} from './terminal-state.svelte';
	import { getAvailableDataSources } from './terminal-state.svelte';

	interface Props {
		config: PanelConfig;
		streams: StreamData;
		onchange: (config: PanelConfig) => void;
		children: Snippet;
		hasLaps?: boolean;
	}

	let { config, streams, onchange, children, hasLaps = false }: Props = $props();

	let availableSources = $derived(getAvailableDataSources(streams));

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

<div class="flex flex-col h-full" style="background: var(--term-surface); border: 1px solid var(--term-border); border-radius: 4px; overflow: hidden;">
	<div class="flex items-center gap-1 px-1.5 py-0.5 shrink-0" style="border-bottom: 1px solid var(--term-border);">
		<select
			class="bg-transparent text-[9px] uppercase tracking-wide cursor-pointer border-none outline-none"
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
				class="bg-transparent text-[9px] uppercase tracking-wide cursor-pointer border-none outline-none"
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
	</div>

	<div class="flex-1" style="min-height: 0;">
		{@render children()}
	</div>
</div>
