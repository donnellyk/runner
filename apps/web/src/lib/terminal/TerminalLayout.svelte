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
	import { findIndexAtDistance } from '$lib/streams';
	import { distanceNormFactor, normalizeStreams, normalizeActivity, streamGpsTotal } from './normalize-distance';
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
		planPaceZones?: ZoneDefinition[];
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
		planPaceZones = [],
		onlayoutcommit,
		compareState,
		chartZoomEnabled = false,
	}: Props = $props();

	let gridContainer = $state<HTMLElement | null>(null);
	// svelte-ignore state_referenced_locally
	const interaction = createGridInteraction(termState, () => gridContainer, onlayoutcommit);

	let snapPanel = $derived(interaction.previewPlacement);

	// Eagerly create zoom states for all panels (must happen outside derived/template context)
	$effect(() => {
		if (!chartZoomEnabled) return;
		for (const panel of termState.layoutPanels) {
			termState.ensureZoom(panel.id);
		}
	});

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

	// Distance normalization: trust a known total distance (e.g. a race's
	// official distance) and elapsed time, rescaling the distance dimension
	// (distance + velocity/pace) to match. Geometry (latlng) and pause
	// detection stay on the real GPS data. Display-only — never persisted.
	let normFactor = $derived(
		distanceNormFactor(termState.normalizeDistance, activity.distance ?? streamGpsTotal(streams)),
	);

	let normStreams = $derived(normalizeStreams(streams, normFactor));

	let normActivity = $derived(normalizeActivity(activity, normFactor));

	let chartIndices = $derived.by(() => {
		const velocity = streams.velocity;
		const len = velocity?.length ?? streams.distance?.length ?? 0;
		return prepareSamplingIndices(velocity, len, termState.params.samplePoints);
	});

	let sampledDist = $derived(sampleStream(normStreams.distance, chartIndices));
	let sampledTime = $derived(sampleStream(streams.time, chartIndices));

	let pausedMask = $derived(createPausedMask(streams.velocity, termState.params.pauseThreshold));
	let sampledPausedMask = $derived(sampleStream(pausedMask, chartIndices));

	function getSampledStream(source: string): number[] | null {
		const raw = getStreamForSource(normStreams, source as Parameters<typeof getStreamForSource>[1], units);
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

	// Per-activity stats/splits for the sidebar in compare mode, each normalized
	// to the active normalize-distance target.
	let sidebarCompareActivities = $derived.by(() => {
		if (!isCompareActive || !compareState) return [];
		return compareState.selectedActivities.map((ca: CompareActivity) => {
			const factor = distanceNormFactor(
				termState.normalizeDistance,
				ca.activity.distance ?? streamGpsTotal(ca.streams),
			);
			return {
				id: ca.id,
				name: ca.name,
				color: ca.color,
				activity: normalizeActivity(ca.activity, factor),
				streams: normalizeStreams(ca.streams, factor),
			};
		});
	});

	function getOverlaySeriesForSource(source: DataSource): OverlaySeries[] {
		if (!isCompareActive || !compareState) return [];
		const selected = compareState.selectedActivities;
		// Skip primary (index 0)
		return selected.slice(1).flatMap((ca: CompareActivity) => {
			// Normalize each compared activity to the same target distance so
			// their distance axes and pace line up with the primary.
			const factor = distanceNormFactor(
				termState.normalizeDistance,
				ca.activity.distance ?? streamGpsTotal(ca.streams),
			);
			const caStreams = normalizeStreams(ca.streams, factor);
			const raw = getStreamForSource(caStreams, source, units);
			if (!raw) return [];
			const velocity = caStreams.velocity;
			const len = velocity?.length ?? caStreams.distance?.length ?? 0;
			const indices = prepareSamplingIndices(velocity, len, termState.params.samplePoints);
			const sampled = sampleStream(raw, indices) ?? raw;
			const rawXStream = termState.xAxis === 'distance' ? caStreams.distance : caStreams.time;
			const sampledX = (sampleStream(rawXStream, indices) ?? rawXStream ?? sampled.map((_, i) => i));
			return [{
				data: sampled,
				xData: sampledX,
				color: ca.color,
				label: ca.name,
				distanceData: sampleStream(caStreams.distance, indices),
				timeData: sampleStream(caStreams.time, indices),
			}];
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
		// Any chart click dismisses a range selection (e.g. one set from a split).
		termState.selectionRange = null;
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

	/** Select a distance range (meters) on range-capable charts, e.g. from a split row. */
	function selectRangeByDistance(startMeters: number, endMeters: number) {
		if (!sampledDist || sampledDist.length === 0) return;
		const startIdx = findIndexAtDistance(sampledDist, startMeters);
		const endIdx = findIndexAtDistance(sampledDist, endMeters);
		if (endIdx <= startIdx) return;
		termState.selectionRange = { startIdx, endIdx };
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		interaction.handleKeydown(e);

		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		if (!termState.crosshairLocked || termState.crosshairIndex == null) return;

		const target = e.target as HTMLElement | null;
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
			return;

		const maxIdx = (chartIndices?.length ?? 0) - 1;
		if (maxIdx < 0) return;

		e.preventDefault();
		const idx = termState.crosshairIndex;

		if (e.shiftKey) {
			// Shift+arrow: select from the locked crosshair to the start / end of the activity.
			termState.selectionRange =
				e.key === 'ArrowLeft'
					? { startIdx: 0, endIdx: idx }
					: { startIdx: idx, endIdx: maxIdx };
			return;
		}

		// Plain arrow: step the crosshair between sample points, clearing any range.
		termState.selectionRange = null;
		const delta = e.key === 'ArrowRight' ? 1 : -1;
		termState.crosshairIndex = Math.min(maxIdx, Math.max(0, idx + delta));
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

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
						{planPaceZones}
						{routeCoords}
						{crosshairOrigIdx}
						{highlightRange}
						crosshairIndex={termState.crosshairIndex}
						crosshairLocked={termState.crosshairLocked}
						selectionRange={termState.selectionRange}
						highlightedNoteId={termState.highlightedNoteId}
						xAxis={termState.xAxis}
						showZones={termState.showZones}
						showPlanZones={termState.showPlanZones}
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
		activity={normActivity}
		{units}
		{termState}
		streams={normStreams}
		{notes}
		{laps}
		{crosshairValues}
		compareMode={isCompareActive}
		compareActivities={sidebarCompareActivities}
		onselectrange={selectRangeByDistance}
	/>
</div>
