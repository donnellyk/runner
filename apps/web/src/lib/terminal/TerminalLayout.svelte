<script lang="ts">
	import type { ZoneDefinition } from '@web-runner/shared';
	import { formatPaceDisplay, KM_TO_MI_PACE, M_TO_FT, type Units } from '$lib/format';
	import { bucketAvgIndices } from '$lib/sampling';
	import TerminalPanel from './TerminalPanel.svelte';
	import TerminalSidebar from './TerminalSidebar.svelte';
	import TerminalLineChart from './charts/TerminalLineChart.svelte';
	import CandlestickChart from './charts/CandlestickChart.svelte';
	import CadenceBarChart, { type BarEntry } from './charts/CadenceBarChart.svelte';
	import SplitHeatmap from './charts/SplitHeatmap.svelte';
	import NotesPanel from './charts/NotesPanel.svelte';
	import TerminalMap from './charts/TerminalMap.svelte';
	import LapComparison from './charts/LapComparison.svelte';
	import {
		type TerminalState,
		type StreamData,
		type PanelConfig,
		type DataSource,
		type ActivityNote,
		type ActivityLap,
		type ActivitySegment,
		getStreamForSource,
		getUnitForSource,
		isInvertedSource,
		getZonesForSource,
		getPanelLabel,
		DATA_SOURCE_LABELS,
		DATA_SOURCE_COLORS,
	} from './terminal-state.svelte';
	import { candlesFromSegments, candlesFromLaps, type CandleData } from './candlestick';
	import { findIndexAtDistance } from '$lib/streams';
	import type { ActivityData } from './types';
	import { createGridInteraction } from './grid-interaction.svelte';
	import { removePanel } from './grid-validation';
	import ResizeHandle from './ResizeHandle.svelte';
	import GridOverlay from './GridOverlay.svelte';
	import PanelConfigPopup from './PanelConfigPopup.svelte';

	interface Props {
		activity: ActivityData;
		units: Units;
		termState: TerminalState;
		streams: StreamData;
		notes: ActivityNote[];
		laps: ActivityLap[];
		segments: ActivitySegment[];
		paceZones: ZoneDefinition[];
		hrZones: ZoneDefinition[];
		onlayoutcommit?: () => void;
	}

	let {
		activity,
		units,
		termState,
		streams,
		notes,
		laps,
		segments,
		paceZones,
		hrZones,
		onlayoutcommit,
	}: Props = $props();

	let gridContainer = $state<HTMLElement | null>(null);
	// svelte-ignore state_referenced_locally
	const interaction = createGridInteraction(termState, () => gridContainer, onlayoutcommit);

	let snapPanel = $derived(interaction.previewPlacement);

	// Config popup state
	let configPanelIdx = $state<number | null>(null);
	let configAnchorRect = $state<DOMRect | null>(null);

	// Close config popup when drag/resize starts
	$effect(() => {
		if (interaction.isActive) configPanelIdx = null;
	});

	function openConfigPopup(idx: number, rect: DOMRect) {
		configPanelIdx = configPanelIdx === idx ? null : idx;
		configAnchorRect = rect;
	}

	let processingDefaults = $derived({
		smoothingWindow: termState.params.smoothingWindow,
		showPauseGaps: termState.showPauseGaps,
		showZones: termState.showZones,
	});

	let chartIndices = $derived.by(() => {
		const velocity = streams.velocity;
		const len = velocity?.length ?? streams.distance?.length ?? 0;
		if (len <= termState.params.samplePoints) return null;
		return bucketAvgIndices(velocity ?? Array.from({ length: len }, () => 0), termState.params.samplePoints);
	});

	function sample<T>(stream: T[] | null): T[] | null {
		if (!stream || !chartIndices) return stream;
		return chartIndices.map((i) => stream[i]);
	}

	let sampledDist = $derived(sample(streams.distance));
	let sampledTime = $derived(sample(streams.time));

	let pausedMask = $derived(
		streams.velocity
			? streams.velocity.map((ms) => ms < termState.params.pauseThreshold)
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
		if (termState.crosshairIndex == null) return null;
		return chartIndices ? chartIndices[termState.crosshairIndex] : termState.crosshairIndex;
	});

	let crosshairValues = $derived.by((): Record<string, string | null> => {
		if (termState.crosshairIndex == null) return {};
		const result: Record<string, string | null> = {};

		const paceData = getSampledStream('pace');
		if (paceData && paceData[termState.crosshairIndex] != null && paceData[termState.crosshairIndex] > 0) {
			result['pace'] = formatPaceDisplay(paceData[termState.crosshairIndex], units);
		}
		const hrData = getSampledStream('heartrate');
		if (hrData && hrData[termState.crosshairIndex] != null) {
			result['heartrate'] = `${Math.round(hrData[termState.crosshairIndex])} bpm`;
		}
		const elevData = getSampledStream('elevation');
		if (elevData && elevData[termState.crosshairIndex] != null) {
			const u = units === 'imperial' ? ' ft' : ' m';
			result['elevation'] = `${Math.round(elevData[termState.crosshairIndex])}${u}`;
		}
		const cadData = getSampledStream('cadence');
		if (cadData && cadData[termState.crosshairIndex] != null) {
			result['cadence'] = `${Math.round(cadData[termState.crosshairIndex])} spm`;
		}
		return result;
	});

	let highlightRange = $derived.by((): { start: number; end: number } | null => {
		if (termState.highlightedNoteId == null) return null;
		const note = notes.find((n) => n.id === termState.highlightedNoteId);
		if (!note) return null;
		return { start: note.distanceStart, end: note.distanceEnd ?? note.distanceStart };
	});

	function updatePanel(panelId: number, config: PanelConfig) {
		termState.layoutPanels = termState.layoutPanels.map((p) =>
			p.id === panelId ? { ...p, config } : p,
		);
	}

	function removePanelAtIndex(idx: number) {
		const result = removePanel(termState.layoutPanels, idx);
		if (result) termState.layoutPanels = result;
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
				case 'pace': avg = l.averageSpeed != null && l.averageSpeed > 0 ? (units === 'imperial' ? (1000 / l.averageSpeed) * KM_TO_MI_PACE : 1000 / l.averageSpeed) : 0; break;
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

	function onCrosshairMove(index: number | null) {
		if (termState.crosshairLocked || termState.isResizing) return;
		termState.crosshairIndex = index;
	}

	function onCrosshairClick(index: number | null) {
		if (termState.crosshairLocked) {
			termState.crosshairLocked = false;
			termState.crosshairIndex = index;
		} else if (index != null) {
			termState.crosshairIndex = index;
			termState.crosshairLocked = true;
		}
	}

	function onCrosshairLeave() {
		if (termState.crosshairLocked) return;
		termState.crosshairIndex = null;
	}
</script>

<svelte:window onkeydown={interaction.handleKeydown} />

<div class="flex h-full w-full gap-0.5 p-0.5">
	<div
		bind:this={gridContainer}
		class="flex-1 grid"
		role="application"
		style="min-width: 0; min-height: 0; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(0, 1fr)); position: relative; user-select: none;"
		onpointermove={interaction.onPointerMove}
		onpointerup={interaction.onPointerUp}
		style:cursor={interaction.dragPanelIndex !== null ? 'grabbing' : undefined}
	>
		<GridOverlay
			visible={termState.isResizing || interaction.dragPanelIndex !== null}
			snapPanel={termState.isResizing ? snapPanel : interaction.dragPreviewPlacement}
			affectedPanels={termState.isResizing ? interaction.affectedPlacements : interaction.dragAffectedPlacements}
			blocked={termState.isResizing ? interaction.resizeBlocked : interaction.dragBlocked}
		/>
		{#each termState.layoutPanels as panel, idx (panel.id)}
			<div style="
				grid-column: {panel.placement.col + 1} / span {panel.placement.colSpan};
				grid-row: {panel.placement.row + 1} / span {panel.placement.rowSpan};
				position: relative;
				margin: 1px;
				min-width: 0;
				min-height: 0;
				overflow: hidden;
			">
				<ResizeHandle
					panelIndex={idx}
					onresizestart={interaction.startResize}
				/>
				<TerminalPanel
					config={panel.config}
					isDragSource={interaction.dragPanelIndex === idx}
					ondragstart={(e) => interaction.startDrag(idx, e.pointerId, e)}
					onconfigopen={(rect) => openConfigPopup(idx, rect)}
				>
					{#if panel.config.kind === 'special'}
						{#if panel.config.specialType === 'map' && routeCoords}
							<TerminalMap
								coordinates={routeCoords}
								latlngStream={streams.latlng}
								distanceStream={streams.distance}
								{crosshairOrigIdx}
								{highlightRange}
							/>
						{:else if panel.config.specialType === 'notes'}
							<NotesPanel
								{notes}
								{units}
								highlightedNoteId={termState.highlightedNoteId}
								onnotehighlight={(id) => termState.highlightedNoteId = id}
							/>
						{:else if panel.config.specialType === 'heatmap'}
							<SplitHeatmap
								{segments}
								{units}
							/>
						{:else if panel.config.specialType === 'laps' && laps.length > 0}
							<LapComparison {laps} {units} />
						{:else}
							<div class="flex items-center justify-center h-full">
								<span class="text-[13px]" style="color: var(--term-text-muted);">No data</span>
							</div>
						{/if}
					{:else if panel.config.dataSource}
						{@const streamData = getSampledStream(panel.config.dataSource)}
						{#if streamData}
							{#if panel.config.chartType === 'candlestick' && panel.config.dataSource === 'pace'}
								{@const mode = panel.config.candlestickMode ?? 'splits'}
								{@const candles = mode === 'laps'
									? candlesFromLaps(laps, streams.velocity, streams.distance, units, termState.wickPercentile)
									: candlesFromSegments(segments, streams.velocity, streams.distance, units, termState.wickPercentile)}
								<CandlestickChart
									{candles}
									{units}
									{mode}
									crosshairIndex={streamIdxToCandleIdx(termState.crosshairIndex, candles)}
									crosshairLocked={termState.crosshairLocked}
									oncrosshairmove={(ci) => onCrosshairMove(candleIdxToStreamIdx(ci, candles))}
									oncrosshairclick={(ci) => onCrosshairClick(candleIdxToStreamIdx(ci, candles))}
									oncrosshairleave={onCrosshairLeave}
								/>
							{:else if panel.config.chartType === 'bar'}
								{@const barMode = panel.config.barMode ?? 'stream'}
								{@const precomputedBars = barMode === 'laps' ? barsFromLaps(panel.config.dataSource) : barMode === 'splits' ? barsFromSegments(panel.config.dataSource) : undefined}
								<CadenceBarChart
									data={streamData}
									distanceData={sampledDist ?? undefined}
									timeData={sampledTime ?? undefined}
									xAxis={termState.xAxis}
									{units}
									label={DATA_SOURCE_LABELS[panel.config.dataSource]}
									color={panel.config.colorOverride ?? DATA_SOURCE_COLORS[panel.config.dataSource]}
									unit={getUnitForSource(panel.config.dataSource, units)}
									formatValue={panel.config.dataSource === 'pace' ? (v: number) => formatPaceDisplay(v, units) : undefined}
									smoothingWindow={panel.config.smoothingOverride ?? termState.params.smoothingWindow}
									crosshairIndex={termState.crosshairIndex}
									crosshairLocked={termState.crosshairLocked}
									{highlightRange}
									{precomputedBars}
									oncrosshairmove={onCrosshairMove}
									oncrosshairclick={onCrosshairClick}
									oncrosshairleave={onCrosshairLeave}
								/>
							{:else}
								{@const panelShowZones = panel.config.zonesOverride ?? termState.showZones}
								{@const zoneInfo = panelShowZones ? getZonesForSource(panel.config.dataSource, paceZones, hrZones, units) : null}
								<TerminalLineChart
									data={streamData}
									distanceData={sampledDist ?? undefined}
									timeData={sampledTime ?? undefined}
									xAxis={termState.xAxis}
									{units}
									label={DATA_SOURCE_LABELS[panel.config.dataSource]}
									color={panel.config.colorOverride ?? DATA_SOURCE_COLORS[panel.config.dataSource]}
									unit={getUnitForSource(panel.config.dataSource, units)}
									formatValue={panel.config.dataSource === 'pace' ? (v: number) => formatPaceDisplay(v, units) : undefined}
									pausedMask={sampledPausedMask ?? undefined}
									showPauseGaps={panel.config.pauseGapsOverride ?? termState.showPauseGaps}
									invertY={isInvertedSource(panel.config.dataSource)}
									smoothingWindow={panel.config.smoothingOverride ?? termState.params.smoothingWindow}
									zones={zoneInfo?.zones}
									zoneMetric={zoneInfo?.metric}
									showZones={panelShowZones}
									filled={panel.config.chartType === 'area'}
									crosshairIndex={termState.crosshairIndex}
									crosshairLocked={termState.crosshairLocked}
									{highlightRange}
									oncrosshairmove={onCrosshairMove}
									oncrosshairclick={onCrosshairClick}
									oncrosshairleave={onCrosshairLeave}
								/>
							{/if}
						{:else}
							<div class="flex items-center justify-center h-full">
								<span class="text-[13px]" style="color: var(--term-text-muted);">No data</span>
							</div>
						{/if}
					{/if}
				</TerminalPanel>
			</div>
		{/each}
	</div>

	{#if configPanelIdx !== null && configAnchorRect && !interaction.isActive}
		{@const cfgPanel = termState.layoutPanels[configPanelIdx]}
		{#if cfgPanel}
			<PanelConfigPopup
				config={cfgPanel.config}
				{streams}
				hasLaps={laps.length > 1}
				canRemove={termState.layoutPanels.length > 1}
				defaults={processingDefaults}
				anchorRect={configAnchorRect}
				onchange={(c) => { updatePanel(cfgPanel.id, c); }}
				onremove={() => { removePanelAtIndex(configPanelIdx!); configPanelIdx = null; }}
				onclose={() => configPanelIdx = null}
			/>
		{/if}
	{/if}

	{#if interaction.dragGhostPos && interaction.dragPanelIndex !== null}
		{@const draggedPanel = termState.layoutPanels[interaction.dragPanelIndex]}
		{@const ghostLabel = draggedPanel ? getPanelLabel(draggedPanel.config) : 'Panel'}
		<div
			class="fixed pointer-events-none px-2 py-1 rounded text-[12px]"
			style="
				left: {interaction.dragGhostPos.x + 12}px;
				top: {interaction.dragGhostPos.y + 12}px;
				background: var(--term-drag-ghost);
				border: 1px solid var(--term-snap-border);
				color: var(--term-text-bright);
				font-family: 'Geist Mono', monospace;
				z-index: 50;
			"
		>{ghostLabel}</div>
	{/if}

	<TerminalSidebar
		{activity}
		{units}
		{termState}
		{notes}
		{laps}
		{crosshairValues}
	/>
</div>
