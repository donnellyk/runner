<script lang="ts">
	import type { ZoneDefinition } from '@web-runner/shared';
	import { type Units } from '$lib/format';
	import TerminalPanel from './TerminalPanel.svelte';
	import TerminalSidebar from './TerminalSidebar.svelte';
	import PanelContent from './PanelContent.svelte';
	import {
		type TerminalState,
		type StreamData,
		type PanelConfig,
		type ActivityNote,
		type ActivityLap,
		type ActivitySegment,
		getStreamForSource,
		getPanelLabel,
	} from './terminal-state.svelte';
	import type { ActivityData, OverlaySeries, OverlayRoute } from './types';
	import { createGridInteraction } from './grid-interaction.svelte';
	import { removePanel } from './grid-validation';
	import ResizeHandle from './ResizeHandle.svelte';
	import GridOverlay from './GridOverlay.svelte';
	import PanelConfigPopup from './PanelConfigPopup.svelte';
	import {
		prepareSamplingIndices,
		sampleStream,
		createPausedMask,
		extractRouteCoordinates,
		computeCrosshairValues,
	} from './prepare-chart-data';
	import {
		type CompareStateType,
		type CompareActivity,
		isPanelDisabledInCompare,
	} from './compare-state.svelte';
	import type { DataSource } from './terminal-state.svelte';

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
		compareState?: CompareStateType;
		chartZoomEnabled?: boolean;
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
		compareState,
		chartZoomEnabled = false,
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
		return prepareSamplingIndices(velocity, len, termState.params.samplePoints);
	});

	let sampledDist = $derived(sampleStream(streams.distance, chartIndices));
	let sampledTime = $derived(sampleStream(streams.time, chartIndices));

	let pausedMask = $derived(createPausedMask(streams.velocity, termState.params.pauseThreshold));
	let sampledPausedMask = $derived(sampleStream(pausedMask, chartIndices));

	function getSampledStream(source: string): number[] | null {
		const raw = getStreamForSource(streams, source as Parameters<typeof getStreamForSource>[1], units);
		return sampleStream(raw, chartIndices);
	}

	let routeCoords = $derived(extractRouteCoordinates(activity.routeGeoJson, streams.latlng));

	let crosshairOrigIdx = $derived.by(() => {
		if (termState.crosshairIndex == null) return null;
		return chartIndices ? chartIndices[termState.crosshairIndex] : termState.crosshairIndex;
	});

	let crosshairValues = $derived(computeCrosshairValues(termState.crosshairIndex, getSampledStream, units));

	// Compare mode overlay data
	let isCompareActive = $derived(compareState?.compareMode ?? false);
	let primaryCompareColor = $derived(compareState?.activities[0]?.color ?? null);

	function getOverlaySeriesForSource(source: DataSource): OverlaySeries[] {
		if (!isCompareActive || !compareState) return [];
		const selected = compareState.selectedActivities;
		// Skip primary (index 0)
		return selected.slice(1).flatMap((ca: CompareActivity) => {
			const raw = getStreamForSource(ca.streams, source, units);
			if (!raw) return [];
			const velocity = ca.streams.velocity;
			const len = velocity?.length ?? ca.streams.distance?.length ?? 0;
			const indices = prepareSamplingIndices(velocity, len, termState.params.samplePoints);
			const sampled = sampleStream(raw, indices) ?? raw;
			const rawXStream = termState.xAxis === 'distance' ? ca.streams.distance : ca.streams.time;
			const sampledX = (sampleStream(rawXStream, indices) ?? rawXStream ?? sampled.map((_, i) => i));
			return [{ data: sampled, xData: sampledX, color: ca.color, label: ca.name }];
		});
	}

	let overlayRoutes = $derived.by((): OverlayRoute[] => {
		if (!isCompareActive || !compareState) return [];
		const selected = compareState.selectedActivities;
		return selected.slice(1).flatMap((ca: CompareActivity) => {
			const coords = extractRouteCoordinates(ca.activity.routeGeoJson, ca.streams.latlng);
			if (!coords) return [];
			return [{ coordinates: coords, color: ca.color, label: ca.name }];
		});
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
			{@const panelZoom = chartZoomEnabled ? termState.getZoom(panel.id) : undefined}
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
					zoom={panelZoom}
					isDragSource={interaction.dragPanelIndex === idx}
					ondragstart={(e) => interaction.startDrag(idx, e.pointerId, e)}
					onconfigopen={(rect) => openConfigPopup(idx, rect)}
					compareDisabled={isCompareActive && isPanelDisabledInCompare(panel.config)}
				>
					<PanelContent
						config={panel.config}
						zoom={panelZoom}
						{units}
						{streams}
						{notes}
						{laps}
						{segments}
						{paceZones}
						{hrZones}
						{routeCoords}
						{crosshairOrigIdx}
						{highlightRange}
						crosshairIndex={termState.crosshairIndex}
						crosshairLocked={termState.crosshairLocked}
						highlightedNoteId={termState.highlightedNoteId}
						xAxis={termState.xAxis}
						showZones={termState.showZones}
						showPauseGaps={termState.showPauseGaps}
						smoothingWindow={termState.params.smoothingWindow}
						wickPercentile={termState.wickPercentile}
						{sampledDist}
						{sampledTime}
						{sampledPausedMask}
						{getSampledStream}
						oncrosshairmove={onCrosshairMove}
						oncrosshairclick={onCrosshairClick}
						oncrosshairleave={onCrosshairLeave}
						onnotehighlight={(id) => termState.highlightedNoteId = id}
						compareMode={isCompareActive}
						primaryColor={isCompareActive ? primaryCompareColor ?? undefined : undefined}
						{getOverlaySeriesForSource}
						{overlayRoutes}
					/>
				</TerminalPanel>
			</div>
		{/each}
	</div>

	{#if configPanelIdx !== null && configAnchorRect && !interaction.isActive}
		{@const cfgPanel = termState.layoutPanels[configPanelIdx]}
		{#if cfgPanel}
			<PanelConfigPopup
				config={cfgPanel.config}
				zoom={chartZoomEnabled ? termState.getZoom(cfgPanel.id) : undefined}
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
		compareMode={isCompareActive}
	/>
</div>
