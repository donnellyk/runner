<script lang="ts">
	import type { ZoneDefinition } from '@web-runner/shared';
	import { formatPaceDisplay, speedToPace, KM_TO_MI_PACE, M_TO_FT, type Units } from '$lib/format';
	import TerminalLineChart from './charts/TerminalLineChart.svelte';
	import CandlestickChart from './charts/CandlestickChart.svelte';
	import CadenceBarChart, { type BarEntry } from './charts/CadenceBarChart.svelte';
	import SplitHeatmap from './charts/SplitHeatmap.svelte';
	import NotesPanel from './charts/NotesPanel.svelte';
	import TerminalMap from './charts/TerminalMap.svelte';
	import LapComparison from './charts/LapComparison.svelte';
	import {
		type PanelConfig,
		type DataSource,
		type ActivityNote,
		type ActivityLap,
		type ActivitySegment,
		type StreamData,
		type ChartZoom,
		getUnitForSource,
		isInvertedSource,
		getZonesForSource,
		DATA_SOURCE_LABELS,
		DATA_SOURCE_COLORS,
	} from './terminal-state.svelte';
	import { candlesFromSegments, candlesFromLaps, type CandleData } from './candlestick';
	import { findIndexAtDistance } from '$lib/streams';
	import type { OverlaySeries, OverlayRoute } from './types';

	interface Props {
		config: PanelConfig;
		units: Units;
		streams: StreamData;
		notes: ActivityNote[];
		laps: ActivityLap[];
		segments: ActivitySegment[];
		paceZones: ZoneDefinition[];
		hrZones: ZoneDefinition[];
		routeCoords: [number, number][] | null;
		crosshairOrigIdx: number | null;
		highlightRange: { start: number; end: number } | null;
		crosshairIndex: number | null;
		crosshairLocked: boolean;
		highlightedNoteId: number | null;
		xAxis: 'distance' | 'time';
		showZones: boolean;
		showPauseGaps: boolean;
		smoothingWindow: number;
		wickPercentile: number;
		sampledDist: number[] | null;
		sampledTime: number[] | null;
		sampledPausedMask: boolean[] | null;
		getSampledStream: (source: string) => number[] | null;
		oncrosshairmove: (index: number | null) => void;
		oncrosshairclick: (index: number | null) => void;
		oncrosshairleave: () => void;
		onnotehighlight: (id: number | null) => void;
		compareMode?: boolean;
		primaryColor?: string;
		getOverlaySeriesForSource?: (source: DataSource) => OverlaySeries[];
		overlayRoutes?: OverlayRoute[];
		zoom?: ChartZoom;
	}

	let {
		config,
		units,
		streams,
		notes,
		laps,
		segments,
		paceZones,
		hrZones,
		routeCoords,
		crosshairOrigIdx,
		highlightRange,
		crosshairIndex,
		crosshairLocked,
		highlightedNoteId,
		xAxis,
		showZones,
		showPauseGaps,
		smoothingWindow,
		wickPercentile,
		sampledDist,
		sampledTime,
		sampledPausedMask,
		getSampledStream,
		oncrosshairmove,
		oncrosshairclick,
		oncrosshairleave,
		onnotehighlight,
		compareMode = false,
		primaryColor,
		getOverlaySeriesForSource,
		overlayRoutes = [],
		zoom,
	}: Props = $props();

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

	function barsFromSegments(source: DataSource): BarEntry[] {
		return segments.map((s) => {
			let avg: number;
			switch (source) {
				case 'cadence': avg = (s.avgCadence ?? 0) * 2; break;
				case 'heartrate': avg = s.avgHeartrate ?? 0; break;
				case 'pace': avg = s.avgPace != null ? (units === 'imperial' ? s.avgPace * KM_TO_MI_PACE : s.avgPace) : 0; break;
				case 'power': avg = s.avgPower ?? 0; break;
				case 'elevation': avg = s.elevationGain != null ? (units === 'imperial' ? s.elevationGain * M_TO_FT : s.elevationGain) : 0; break;
				case 'grade': avg = 0; break;
			}
			return { avg, xMid: (s.distanceStart + s.distanceEnd) / 2, label: `${s.segmentIndex + 1}` };
		}).filter((b) => b.avg > 0);
	}

	function barsFromLaps(source: DataSource): BarEntry[] {
		let cumDist = 0;
		return laps.map((l) => {
			let avg: number;
			switch (source) {
				case 'cadence': avg = (l.averageCadence ?? 0) * 2; break;
				case 'heartrate': avg = l.averageHeartrate ?? 0; break;
				case 'pace': avg = speedToPace(l.averageSpeed, units) ?? 0; break;
				case 'power': avg = 0; break;
				case 'elevation': avg = 0; break;
				case 'grade': avg = 0; break;
			}
			const lapDist = l.distance ?? 0;
			const xMid = cumDist + lapDist / 2;
			cumDist += lapDist;
			return { avg, xMid, label: `${l.lapIndex + 1}` };
		}).filter((b) => b.avg > 0);
	}
</script>

{#if config.kind === 'special'}
	{#if config.specialType === 'map' && routeCoords}
		<TerminalMap
			coordinates={routeCoords}
			latlngStream={streams.latlng}
			distanceStream={streams.distance}
			{crosshairOrigIdx}
			{highlightRange}
			overlayRoutes={compareMode ? overlayRoutes : []}
		/>
	{:else if config.specialType === 'notes'}
		<NotesPanel
			{notes}
			{units}
			highlightedNoteId={highlightedNoteId}
			onnotehighlight={(id) => onnotehighlight(id)}
		/>
	{:else if config.specialType === 'heatmap'}
		<SplitHeatmap
			{segments}
			{units}
		/>
	{:else if config.specialType === 'laps' && laps.length > 0}
		<LapComparison {laps} {units} />
	{:else}
		<div class="flex items-center justify-center h-full">
			<span class="text-[13px]" style="color: var(--term-text-muted);">No data</span>
		</div>
	{/if}
{:else if config.dataSource}
	{@const streamData = getSampledStream(config.dataSource)}
	{#if streamData}
		{#if config.chartType === 'candlestick' && config.dataSource === 'pace'}
			{@const mode = config.candlestickMode ?? 'splits'}
			{@const candles = mode === 'laps'
				? candlesFromLaps(laps, streams.velocity, streams.distance, units, wickPercentile)
				: candlesFromSegments(segments, streams.velocity, streams.distance, units, wickPercentile)}
			<CandlestickChart
				{candles}
				{units}
				{mode}
				{zoom}
				crosshairIndex={streamIdxToCandleIdx(crosshairIndex, candles)}
				crosshairLocked={crosshairLocked}
				oncrosshairmove={(ci) => oncrosshairmove(candleIdxToStreamIdx(ci, candles))}
				oncrosshairclick={(ci) => oncrosshairclick(candleIdxToStreamIdx(ci, candles))}
				oncrosshairleave={oncrosshairleave}
			/>
		{:else if config.chartType === 'bar'}
			{@const barMode = config.barMode ?? 'stream'}
			{@const precomputedBars = barMode === 'laps' ? barsFromLaps(config.dataSource) : barMode === 'splits' ? barsFromSegments(config.dataSource) : undefined}
			<CadenceBarChart
				data={streamData}
				distanceData={sampledDist ?? undefined}
				timeData={sampledTime ?? undefined}
				{xAxis}
				{units}
				{zoom}
				label={DATA_SOURCE_LABELS[config.dataSource]}
				color={compareMode && primaryColor ? primaryColor : config.colorOverride ?? DATA_SOURCE_COLORS[config.dataSource]}
				unit={getUnitForSource(config.dataSource, units)}
				formatValue={config.dataSource === 'pace' ? (v: number) => formatPaceDisplay(v, units) : undefined}
				smoothingWindow={config.smoothingOverride ?? smoothingWindow}
				crosshairIndex={crosshairIndex}
				crosshairLocked={crosshairLocked}
				{highlightRange}
				{precomputedBars}
				oncrosshairmove={oncrosshairmove}
				oncrosshairclick={oncrosshairclick}
				oncrosshairleave={oncrosshairleave}
				overlayData={compareMode && getOverlaySeriesForSource ? getOverlaySeriesForSource(config.dataSource) : undefined}
			/>
		{:else}
			{@const panelShowZones = config.zonesOverride ?? showZones}
			{@const zoneInfo = panelShowZones ? getZonesForSource(config.dataSource, paceZones, hrZones, units) : null}
			<TerminalLineChart
				data={streamData}
				distanceData={sampledDist ?? undefined}
				timeData={sampledTime ?? undefined}
				{xAxis}
				{units}
				{zoom}
				label={DATA_SOURCE_LABELS[config.dataSource]}
				color={compareMode && primaryColor ? primaryColor : config.colorOverride ?? DATA_SOURCE_COLORS[config.dataSource]}
				unit={getUnitForSource(config.dataSource, units)}
				formatValue={config.dataSource === 'pace' ? (v: number) => formatPaceDisplay(v, units) : undefined}
				pausedMask={sampledPausedMask ?? undefined}
				showPauseGaps={config.pauseGapsOverride ?? showPauseGaps}
				invertY={isInvertedSource(config.dataSource)}
				smoothingWindow={config.smoothingOverride ?? smoothingWindow}
				zones={zoneInfo?.zones}
				zoneMetric={zoneInfo?.metric}
				showZones={panelShowZones}
				filled={config.chartType === 'area' && !compareMode}
				crosshairIndex={crosshairIndex}
				crosshairLocked={crosshairLocked}
				{highlightRange}
				oncrosshairmove={oncrosshairmove}
				oncrosshairclick={oncrosshairclick}
				oncrosshairleave={oncrosshairleave}
				overlayData={compareMode && getOverlaySeriesForSource ? getOverlaySeriesForSource(config.dataSource) : undefined}
			/>
		{/if}
	{:else}
		<div class="flex items-center justify-center h-full">
			<span class="text-[13px]" style="color: var(--term-text-muted);">No data</span>
		</div>
	{/if}
{/if}
