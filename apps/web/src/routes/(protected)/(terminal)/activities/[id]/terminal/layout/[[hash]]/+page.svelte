<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, replaceState, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import '$lib/terminal/terminal-theme.css';
	import TerminalLayout from '$lib/terminal/TerminalLayout.svelte';
	import LayoutPopup from '$lib/terminal/LayoutPopup.svelte';
	import DisplayPopup from '$lib/terminal/DisplayPopup.svelte';
	import ProcessingPopup from '$lib/terminal/ProcessingPopup.svelte';
	import {
		createTerminalState,
		applySettings,
		getSettings,
	} from '$lib/terminal/terminal-state.svelte';
	import { prepareStreams, prepareNotes, prepareLaps, prepareSegments } from '$lib/terminal/prepare-page-data';
	import { createCompareState } from '$lib/terminal/compare-state.svelte';
	import CompareBar from '$lib/terminal/CompareBar.svelte';
	import ActivitySearchPopup from '$lib/terminal/ActivitySearchPopup.svelte';
	import type { Units } from '$lib/format';
	import {
		decodeLayout,
		decodeSettings,
		encodeLayout,
		encodeSettings,
		buildLayoutPath,
		cloneLayout,
		DEFAULT_LAYOUT,
		resetNextPanelId,
	} from '$lib/terminal/layout-url';

	let { data } = $props();

	const units = $derived(data.user.distanceUnit as Units);
	const a = $derived(data.activity);
	const paceZones = $derived(data.paceZones);
	const hrZones = $derived(data.hrZones);

	let streams = $derived(prepareStreams(data.streamMap));
	let notes = $derived(prepareNotes(data.notes));
	let lapList = $derived(prepareLaps(data.laps));
	let segmentList = $derived(prepareSegments(data.segments));

	// Compare state — initialized once from page data (not reactive to navigations)
	// svelte-ignore state_referenced_locally
	const compareState = createCompareState({
		id: data.activity.id,
		name: data.activity.name,
		startDate: data.activity.startDate,
		sportType: data.activity.sportType,
		activity: { distance: a.distance, movingTime: a.movingTime, averageSpeed: a.averageSpeed, averageHeartrate: a.averageHeartrate, totalElevationGain: a.totalElevationGain, averageCadence: a.averageCadence, routeGeoJson: a.routeGeoJson },
		streams,
		laps: lapList,
		segments: segmentList,
		notes,
	});

	// Effective data: in compare mode pass overlay data, otherwise use active tab's data
	let effectiveActivity = $derived(compareState.activeActivity.activity);
	let effectiveStreams = $derived(compareState.activeActivity.streams);
	let effectiveNotes = $derived(compareState.activeActivity.notes);
	let effectiveLaps = $derived(compareState.activeActivity.laps);
	let effectiveSegments = $derived(compareState.activeActivity.segments);

	let searchOpen = $state(false);

	async function handleSearchSelect(activityId: number) {
		searchOpen = false;
		await compareState.addActivity(activityId);
	}

	// Load compare activities from URL on mount
	const initialCompareIds = page.url.searchParams.get('compare');
	if (initialCompareIds) {
		onMount(async () => {
			const ids = initialCompareIds.split(',').map(Number).filter((n) => n > 0 && n !== data.activity.id);
			for (const id of ids.slice(0, 3)) {
				await compareState.addActivity(id);
			}
		});
	}

	// Sync compare state to URL
	let compareUrlParam = $derived.by(() => {
		const ids = compareState.activities.slice(1).map((a) => a.id);
		return ids.length > 0 ? ids.join(',') : null;
	});

	// Base path for this activity's layout URLs
	const basePath = resolve(`/activities/${data.activity.id}/terminal/layout`);

	// Initialize layout from path hash, saved default, or hardcoded default
	const urlParams = new URLSearchParams(page.url.search);
	const hashParam = page.params.hash ?? null;

	let initialLayout;
	let initialActiveLayoutId: number | null = null;
	let initialSettings;

	if (hashParam) {
		// Priority 1: Hash in URL path is authoritative
		initialLayout = decodeLayout(hashParam).panels;
		initialSettings = decodeSettings(urlParams);
		const matchingLayout = data.layouts.find(
			(l: { encoded: string }) => l.encoded.split('&')[0] === hashParam,
		);
		if (matchingLayout) {
			initialActiveLayoutId = matchingLayout.id;
		}
	} else {
		// Priority 2: User's saved default layout
		const savedDefault = data.layouts.find((l: { isDefault: boolean }) => l.isDefault);
		if (savedDefault) {
			const parts = savedDefault.encoded.split('&');
			initialLayout = decodeLayout(parts[0]).panels;
			initialSettings = decodeSettings(new URLSearchParams(parts.slice(1).join('&')));
			initialActiveLayoutId = savedDefault.id;
		} else {
			// Priority 3: Hardcoded default
			initialLayout = cloneLayout(DEFAULT_LAYOUT);
			initialSettings = decodeSettings(urlParams);
		}
	}

	resetNextPanelId(initialLayout.length + 1);
	const termState = createTerminalState(initialLayout);
	termState.activeLayoutId = initialActiveLayoutId;

	applySettings(termState, initialSettings);

	// Push layout hash to URL if not already present (must wait for router init)
	if (!hashParam) {
		onMount(() => {
			setTimeout(() => {
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				replaceState(`${basePath}${buildLayoutPath(termState.layoutPanels, getSettings(termState))}`, {});
			}, 0);
		});
	}

	// URL sync: debounced replaceState for continuous changes
	function currentUrl() {
		const base = `${basePath}${buildLayoutPath(termState.layoutPanels, getSettings(termState))}`;
		if (compareUrlParam) {
			const sep = base.includes('?') ? '&' : '?';
			return `${base}${sep}compare=${compareUrlParam}`;
		}
		return base;
	}

	let urlString = $derived(currentUrl());

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const url = urlString;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			replaceState(url, {});
		}, 300);
		return () => {
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	});

	// Auto-save active layout on changes
	let layoutEncoded = $derived(
		encodeLayout(termState.layoutPanels) + '&' + encodeSettings(getSettings(termState)),
	);
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const encoded = layoutEncoded;
		const activeId = termState.activeLayoutId;
		if (!activeId) return;
		if (autoSaveTimer) clearTimeout(autoSaveTimer);
		autoSaveTimer = setTimeout(() => {
			fetch(`/api/terminal-layouts/${activeId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ encoded }),
			}).then(() => refreshLayouts());
		}, 1000);
		return () => {
			if (autoSaveTimer) clearTimeout(autoSaveTimer);
		};
	});

	// Push discrete layout changes (resize, swap) to history for undo
	function pushLayoutToHistory() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		pushState(currentUrl(), {});
	}

	// Re-sync layout from URL on browser back/forward
	function handlePopstate() {
		const path = window.location.pathname;
		const hashMatch = path.match(/\/layout\/([^/]+)$/);
		const hash = hashMatch?.[1] ?? null;
		const params = new URLSearchParams(window.location.search);
		const { panels } = hash ? decodeLayout(hash) : { panels: cloneLayout(DEFAULT_LAYOUT) };
		termState.layoutPanels = panels;
		resetNextPanelId(panels.length + 1);
		applySettings(termState, decodeSettings(params));
	}

	// Saved layouts from page data
	// svelte-ignore state_referenced_locally
	let savedLayouts = $state(data.layouts.map((l: { id: number; name: string; encoded: string; isDefault: boolean }) => ({
		id: l.id,
		name: l.name,
		encoded: l.encoded,
		isDefault: l.isDefault,
	})));

	async function refreshLayouts() {
		const res = await fetch('/api/terminal-layouts');
		if (res.ok) {
			const { layouts } = await res.json();
			savedLayouts = layouts.map((l: { id: number; name: string; encoded: string; isDefault: boolean }) => ({
				id: l.id,
				name: l.name,
				encoded: l.encoded,
				isDefault: l.isDefault,
			}));
		}
	}

	type PopupType = 'display' | 'processing' | 'layout';
	let activePopup = $state<PopupType | null>(null);
	let popupAnchorRect = $state<DOMRect | null>(null);

	function togglePopup(which: PopupType, e: MouseEvent) {
		if (activePopup === which) {
			activePopup = null;
		} else {
			activePopup = which;
			popupAnchorRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		}
	}

	const meshOrbs = [
		{ color: '80, 250, 123', opacity: 0.26 },
		{ color: '139, 233, 253', opacity: 0.24 },
		{ color: '189, 147, 249', opacity: 0.19 },
		{ color: '255, 184, 108', opacity: 0.18 },
	].map((orb) => ({
		...orb,
		x: Math.round(Math.random() * 60 + 20),
		y: Math.round(Math.random() * 60 + 20),
		dur: 15 + Math.round(Math.random() * 12),
	}));

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (termState.isResizing || termState.isDragging) {
				e.preventDefault();
				return;
			}
			goto(resolve(`/activities/${a.id}`));
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} onpopstate={handlePopstate} />

<div data-terminal class="fixed inset-0 flex flex-col" style="background: var(--term-mesh); zoom: {termState.uiScale};">
	<div class="fixed inset-0 pointer-events-none" style="z-index: 0; overflow: hidden;">
		{#each meshOrbs as orb, i (i)}
			<div
				class="absolute rounded-full"
				style="
					width: 60vmax; height: 60vmax;
					left: {orb.x}%; top: {orb.y}%;
					translate: -50% -50%;
					background: radial-gradient(circle, rgba({orb.color}, {orb.opacity}) 0%, transparent 70%);
					--mesh-drift-x: {-50 + 15 * termState.meshDrift}%;
					--mesh-drift-y: {-50 - 15 * termState.meshDrift}%;
					--mesh-scale: {1 + 0.2 * termState.meshScale};
					animation: mesh-drift {termState.meshSpeed > 0 ? orb.dur / termState.meshSpeed : 0}s ease-in-out infinite alternate;
					animation-play-state: {termState.meshSpeed > 0 ? 'running' : 'paused'};
				"
			></div>
		{/each}
	</div>
	<div class="flex items-center h-9 px-3 shrink-0" style="border-bottom: 1px solid var(--term-border); position: relative; z-index: 1;">
		<a
			href={resolve(`/activities/${a.id}`)}
			class="text-[12px] px-2 py-0.5 rounded no-underline"
			style="color: var(--term-text-muted); border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
		>ESC Exit</a>
		{#if compareState.activities.length <= 1}
			<span class="ml-3 text-[13px] font-medium truncate" style="color: var(--term-text); font-family: 'Geist Mono', monospace;">{a.name}</span>
			<span class="ml-2 text-[12px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">
				{new Date(a.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
			</span>
		{/if}
		<div class="ml-2 flex items-center gap-1">
			<CompareBar {compareState} onsearchopen={() => searchOpen = true} />
		</div>
		{#if compareState.loading}
			<span class="ml-2 text-[11px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">Loading...</span>
		{/if}
		<div class="ml-auto flex gap-1">
			<div class="flex" style="border: 1px solid var(--term-border); border-radius: 4px; overflow: hidden;">
				<button
					class="text-[11px] px-2 py-0.5"
					style="font-family: 'Geist Mono', monospace; {termState.xAxis === 'distance' ? 'background: var(--term-surface-hover); color: var(--term-text-bright);' : 'color: var(--term-text-muted);'}"
					onclick={() => termState.xAxis = 'distance'}
				>Dist</button>
				<button
					class="text-[11px] px-2 py-0.5"
					style="font-family: 'Geist Mono', monospace; {termState.xAxis === 'time' ? 'background: var(--term-surface-hover); color: var(--term-text-bright);' : 'color: var(--term-text-muted);'}"
					onclick={() => termState.xAxis = 'time'}
				>Time</button>
			</div>
			<button
				class="text-[12px] px-2 py-0.5 rounded"
				style="color: {activePopup === 'display' ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}; border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
				onclick={(e) => togglePopup('display', e)}
			>Display</button>
			<button
				class="text-[12px] px-2 py-0.5 rounded"
				style="color: {activePopup === 'processing' ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}; border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
				onclick={(e) => togglePopup('processing', e)}
			>Processing</button>
			<button
				class="text-[12px] px-2 py-0.5 rounded"
				style="color: {activePopup === 'layout' ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}; border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
				onclick={(e) => togglePopup('layout', e)}
			>Layouts</button>
		</div>
	</div>

	<div class="flex-1" style="min-height: 0; position: relative; z-index: 1;">
		<TerminalLayout
			activity={effectiveActivity}
			{units}
			{termState}
			streams={effectiveStreams}
			notes={effectiveNotes}
			laps={effectiveLaps}
			segments={effectiveSegments}
			{paceZones}
			{hrZones}
			onlayoutcommit={pushLayoutToHistory}
			{compareState}
		/>
	</div>
</div>

{#if activePopup === 'layout'}
	<LayoutPopup
		{termState}
		{savedLayouts}
		onlayoutschange={refreshLayouts}
		onclose={() => activePopup = null}
	/>
{:else if activePopup === 'display' && popupAnchorRect}
	<DisplayPopup
		{termState}
		anchorRect={popupAnchorRect}
		onclose={() => activePopup = null}
	/>
{:else if activePopup === 'processing' && popupAnchorRect}
	<ProcessingPopup
		{termState}
		anchorRect={popupAnchorRect}
		onclose={() => activePopup = null}
	/>
{/if}

{#if searchOpen}
	<ActivitySearchPopup
		sportType={compareState.sportType}
		excludeIds={compareState.activities.map((a) => a.id)}
		{units}
		onselect={handleSearchSelect}
		onclose={() => searchOpen = false}
	/>
{/if}
