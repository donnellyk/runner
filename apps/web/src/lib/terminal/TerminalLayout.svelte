<script lang="ts">
	import type { ZoneDefinition } from '@web-runner/shared';
	import { formatPaceDisplay, type Units } from '$lib/format';
	import { bucketAvgIndices } from '$lib/sampling';
	import TerminalPanel from './TerminalPanel.svelte';
	import TerminalSidebar from './TerminalSidebar.svelte';
	import TerminalLineChart from './charts/TerminalLineChart.svelte';
	import CandlestickChart from './charts/CandlestickChart.svelte';
	import CadenceBarChart from './charts/CadenceBarChart.svelte';
	import SplitHeatmap from './charts/SplitHeatmap.svelte';
	import NotesPanel from './charts/NotesPanel.svelte';
	import TerminalMap from './charts/TerminalMap.svelte';
	import LapComparison from './charts/LapComparison.svelte';
	import {
		type TerminalState,
		type StreamData,
		type PanelConfig,
		type ActivityNote,
		type ActivityLap,
		type ActivitySegment,
		getStreamForSource,
		getUnitForSource,
		isInvertedSource,
		getZonesForSource,
		DATA_SOURCE_LABELS,
		DATA_SOURCE_COLORS,
	} from './terminal-state.svelte';
	import { candlesFromSegments, candlesFromLaps, type CandleData } from './candlestick';
	import { findIndexAtDistance } from '$lib/streams';
	import type { ActivityData } from './types';

	interface Props {
		activity: ActivityData;
		units: Units;
		state: TerminalState;
		streams: StreamData;
		notes: ActivityNote[];
		laps: ActivityLap[];
		segments: ActivitySegment[];
		paceZones: ZoneDefinition[];
		hrZones: ZoneDefinition[];
	}

	let {
		activity,
		units,
		state,
		streams,
		notes,
		laps,
		segments,
		paceZones,
		hrZones,
	}: Props = $props();

	let chartIndices = $derived.by(() => {
		const velocity = streams.velocity;
		const len = velocity?.length ?? streams.distance?.length ?? 0;
		if (len <= state.params.samplePoints) return null;
		return bucketAvgIndices(velocity ?? Array.from({ length: len }, () => 0), state.params.samplePoints);
	});

	function sample<T>(stream: T[] | null): T[] | null {
		if (!stream || !chartIndices) return stream;
		return chartIndices.map((i) => stream[i]);
	}

	let sampledDist = $derived(sample(streams.distance));
	let sampledTime = $derived(sample(streams.time));

	let pausedMask = $derived(
		streams.velocity
			? streams.velocity.map((ms) => ms < state.params.pauseThreshold)
			: null,
	);
	let sampledPausedMask = $derived(sample(pausedMask));

	function getSampledStream(source: string): number[] | null {
		const raw = getStreamForSource(streams, source as Parameters<typeof getStreamForSource>[1], units);
		return sample(raw);
	}

	let routeCoords = $derived.by((): [number, number][] | null => {
		if (activity.routeGeoJson) {
			try {
				return JSON.parse(activity.routeGeoJson).coordinates;
			} catch { return null; }
		}
		if (streams.latlng) {
			return streams.latlng.map(([lat, lng]) => [lng, lat]);
		}
		return null;
	});

	let crosshairOrigIdx = $derived.by(() => {
		if (state.crosshairIndex == null) return null;
		return chartIndices ? chartIndices[state.crosshairIndex] : state.crosshairIndex;
	});

	let crosshairValues = $derived.by((): Record<string, string | null> => {
		if (state.crosshairIndex == null) return {};
		const result: Record<string, string | null> = {};

		const paceData = getSampledStream('pace');
		if (paceData && paceData[state.crosshairIndex] != null && paceData[state.crosshairIndex] > 0) {
			result['pace'] = formatPaceDisplay(paceData[state.crosshairIndex], units);
		}
		const hrData = getSampledStream('heartrate');
		if (hrData && hrData[state.crosshairIndex] != null) {
			result['heartrate'] = `${Math.round(hrData[state.crosshairIndex])} bpm`;
		}
		const elevData = getSampledStream('elevation');
		if (elevData && elevData[state.crosshairIndex] != null) {
			const u = units === 'imperial' ? ' ft' : ' m';
			result['elevation'] = `${Math.round(elevData[state.crosshairIndex])}${u}`;
		}
		const cadData = getSampledStream('cadence');
		if (cadData && cadData[state.crosshairIndex] != null) {
			result['cadence'] = `${Math.round(cadData[state.crosshairIndex])} spm`;
		}
		return result;
	});

	let highlightRange = $derived.by((): { start: number; end: number } | null => {
		if (state.highlightedNoteId == null) return null;
		const note = notes.find((n) => n.id === state.highlightedNoteId);
		if (!note) return null;
		return { start: note.distanceStart, end: note.distanceEnd ?? note.distanceStart };
	});

	function updatePanel(index: number, config: PanelConfig) {
		const newPanels = [...state.panels];
		newPanels[index] = config;
		state.panels = newPanels;
	}

	function streamIdxToCandleIdx(streamIdx: number | null, candles: CandleData[]): number | null {
		if (streamIdx == null || candles.length === 0 || !sampledDist) return null;
		const dist = sampledDist[streamIdx];
		if (dist == null) return null;
		for (let i = candles.length - 1; i >= 0; i--) {
			if (dist >= candles[i].distanceStart) return i;
		}
		return 0;
	}

	function candleIdxToStreamIdx(candleIdx: number | null, candles: CandleData[]): number | null {
		if (candleIdx == null || !candles[candleIdx] || !sampledDist) return null;
		const midDist = (candles[candleIdx].distanceStart + candles[candleIdx].distanceEnd) / 2;
		return findIndexAtDistance(sampledDist, midDist);
	}

	function onCrosshairMove(index: number | null) {
		if (state.crosshairLocked) return;
		state.crosshairIndex = index;
	}

	function onCrosshairClick(index: number | null) {
		if (state.crosshairLocked) {
			state.crosshairLocked = false;
			state.crosshairIndex = index;
		} else if (index != null) {
			state.crosshairIndex = index;
			state.crosshairLocked = true;
		}
	}

	function onCrosshairLeave() {
		if (state.crosshairLocked) return;
		state.crosshairIndex = null;
	}
</script>

<div class="flex h-full w-full">
	<div class="flex-1 grid grid-cols-3 grid-rows-2 gap-1 p-1" style="min-width: 0;">
		{#each state.panels as panel, idx (idx)}
			<TerminalPanel
				config={panel}
				{streams}
				hasLaps={laps.length > 1}
				onchange={(c) => updatePanel(idx, c)}
			>
				{#if panel.kind === 'special'}
					{#if panel.specialType === 'map' && routeCoords}
						<TerminalMap
							coordinates={routeCoords}
							latlngStream={streams.latlng}
							distanceStream={streams.distance}
							{crosshairOrigIdx}
							{highlightRange}
						/>
					{:else if panel.specialType === 'notes'}
						<NotesPanel
							{notes}
							{units}
							highlightedNoteId={state.highlightedNoteId}
							onnotehighlight={(id) => state.highlightedNoteId = id}
						/>
					{:else if panel.specialType === 'heatmap'}
						<SplitHeatmap
							{segments}
							{units}
						/>
					{:else if panel.specialType === 'laps' && laps.length > 0}
						<LapComparison {laps} {units} />
					{:else}
						<div class="flex items-center justify-center h-full">
							<span class="text-[12px]" style="color: var(--term-text-muted);">No data</span>
						</div>
					{/if}
				{:else if panel.dataSource}
					{@const streamData = getSampledStream(panel.dataSource)}
					{#if streamData}
						{#if panel.chartType === 'candlestick' && panel.dataSource === 'pace'}
							{@const mode = panel.candlestickMode ?? 'splits'}
							{@const candles = mode === 'laps'
								? candlesFromLaps(laps, streams.velocity, streams.distance, units)
								: candlesFromSegments(segments, streams.velocity, streams.distance, units)}
							<CandlestickChart
								{candles}
								{units}
								{mode}
								crosshairIndex={streamIdxToCandleIdx(state.crosshairIndex, candles)}
								crosshairLocked={state.crosshairLocked}
								oncrosshairmove={(ci) => onCrosshairMove(candleIdxToStreamIdx(ci, candles))}
								oncrosshairclick={(ci) => onCrosshairClick(candleIdxToStreamIdx(ci, candles))}
								oncrosshairleave={onCrosshairLeave}
							/>
						{:else if panel.chartType === 'bar'}
							<CadenceBarChart
								data={streamData}
								distanceData={sampledDist ?? undefined}
								timeData={sampledTime ?? undefined}
								xAxis={state.xAxis}
								{units}
								label={DATA_SOURCE_LABELS[panel.dataSource]}
								color={panel.colorOverride ?? DATA_SOURCE_COLORS[panel.dataSource]}
								unit={getUnitForSource(panel.dataSource, units)}
								formatValue={panel.dataSource === 'pace' ? (v: number) => formatPaceDisplay(v, units) : undefined}
								smoothingWindow={state.params.smoothingWindow}
								crosshairIndex={state.crosshairIndex}
								crosshairLocked={state.crosshairLocked}
								{highlightRange}
								oncrosshairmove={onCrosshairMove}
								oncrosshairclick={onCrosshairClick}
								oncrosshairleave={onCrosshairLeave}
							/>
						{:else}
							{@const zoneInfo = state.showZones ? getZonesForSource(panel.dataSource, paceZones, hrZones, units) : null}
							<TerminalLineChart
								data={streamData}
								distanceData={sampledDist ?? undefined}
								timeData={sampledTime ?? undefined}
								xAxis={state.xAxis}
								{units}
								label={DATA_SOURCE_LABELS[panel.dataSource]}
								color={panel.colorOverride ?? DATA_SOURCE_COLORS[panel.dataSource]}
								unit={getUnitForSource(panel.dataSource, units)}
								formatValue={panel.dataSource === 'pace' ? (v: number) => formatPaceDisplay(v, units) : undefined}
								pausedMask={sampledPausedMask ?? undefined}
								showPauseGaps={state.showPauseGaps}
								invertY={isInvertedSource(panel.dataSource)}
								smoothingWindow={state.params.smoothingWindow}
								zones={zoneInfo?.zones}
								zoneMetric={zoneInfo?.metric}
								showZones={state.showZones}
								filled={panel.chartType === 'area'}
								lineGlow={state.lineGlow}
								glowOpacity={state.glowOpacity}
								crosshairIndex={state.crosshairIndex}
								crosshairLocked={state.crosshairLocked}
								{highlightRange}
								oncrosshairmove={onCrosshairMove}
								oncrosshairclick={onCrosshairClick}
								oncrosshairleave={onCrosshairLeave}
							/>
						{/if}
					{:else}
						<div class="flex items-center justify-center h-full">
							<span class="text-[12px]" style="color: var(--term-text-muted);">No data</span>
						</div>
					{/if}
				{/if}
			</TerminalPanel>
		{/each}
	</div>

	<TerminalSidebar
		{activity}
		{units}
		termState={state}
		{notes}
		{laps}
		{crosshairValues}
	/>
</div>
