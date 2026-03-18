<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, replaceState, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import '$lib/terminal/terminal-theme.css';
	import TerminalLayout from '$lib/terminal/TerminalLayout.svelte';
	import LayoutPopup from '$lib/terminal/LayoutPopup.svelte';
	import {
		createTerminalState,
		applySettings,
		getSettings,
		type StreamData,
		type ActivityNote,
		type ActivityLap,
		type ActivitySegment,
	} from '$lib/terminal/terminal-state.svelte';
	import { isLatLngArray, isNumberArray } from '$lib/terminal/types';
	import type { Units } from '$lib/format';
	import {
		decodeLayout,
		decodeSettings,
		encodeLayout,
		encodeSettings,
		buildTerminalUrl,
		cloneLayout,
		DEFAULT_LAYOUT,
		resetNextPanelId,
	} from '$lib/terminal/layout-url';

	let { data } = $props();

	const units = $derived(data.user.distanceUnit as Units);
	const a = $derived(data.activity);
	const paceZones = $derived(data.paceZones);
	const hrZones = $derived(data.hrZones);

	function getStream(type: string): number[] | null {
		const s = data.streamMap[type];
		return isNumberArray(s) && s.length > 0 ? s : null;
	}

	let streams = $derived<StreamData>({
		velocity: getStream('velocity_smooth'),
		heartrate: getStream('heartrate'),
		altitude: getStream('altitude'),
		cadence: getStream('cadence'),
		power: getStream('watts'),
		grade: getStream('grade_smooth'),
		distance: getStream('distance'),
		time: getStream('time'),
		latlng: (() => {
			const s = data.streamMap['latlng'];
			return isLatLngArray(s) ? s : null;
		})(),
	});

	let notes = $derived<ActivityNote[]>(data.notes.map((n) => ({
		id: n.id,
		distanceStart: n.distanceStart,
		distanceEnd: n.distanceEnd,
		content: n.content,
	})));

	let lapList = $derived<ActivityLap[]>(data.laps.map((l) => ({
		id: l.id,
		lapIndex: l.lapIndex,
		distance: l.distance,
		movingTime: l.movingTime,
		averageSpeed: l.averageSpeed,
		averageHeartrate: l.averageHeartrate,
		averageCadence: l.averageCadence,
	})));

	let segmentList = $derived<ActivitySegment[]>(data.segments.map((s) => ({
		id: s.id,
		segmentIndex: s.segmentIndex,
		distanceStart: s.distanceStart,
		distanceEnd: s.distanceEnd,
		avgPace: s.avgPace,
		minPace: s.minPace,
		maxPace: s.maxPace,
		avgHeartrate: s.avgHeartrate,
		avgCadence: s.avgCadence,
		avgPower: s.avgPower,
		elevationGain: s.elevationGain,
		elevationLoss: s.elevationLoss,
	})));

	// Initialize layout from URL params, saved default, or hardcoded default
	const urlParams = new URLSearchParams(page.url.search);
	const layoutParam = urlParams.get('l');

	let initialLayout;
	let initialActiveLayoutId: number | null = null;
	let initialSettings;

	if (layoutParam) {
		// Priority 1: URL param is authoritative
		initialLayout = decodeLayout(layoutParam).panels;
		initialSettings = decodeSettings(urlParams);
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

	// Push layout to URL if not already present (must wait for router init)
	if (!layoutParam) {
		const initialUrl = buildTerminalUrl(termState.layoutPanels, getSettings(termState));
		if (initialUrl) {
			onMount(() => {
				// Router isn't ready synchronously in onMount; defer to next tick
				setTimeout(() => {
					// eslint-disable-next-line svelte/no-navigation-without-resolve -- updating query params on current page
					replaceState(`${page.url.pathname}${initialUrl}`, {});
				}, 0);
			});
		}
	}

	// URL sync: debounced replaceState for continuous changes
	function currentUrlString() {
		return buildTerminalUrl(termState.layoutPanels, getSettings(termState));
	}

	let urlString = $derived(currentUrlString());

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const url = urlString;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			replaceState(`${page.url.pathname}${url}`, {});
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
		const url = currentUrlString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		pushState(`${page.url.pathname}${url}`, {});
	}

	// Re-sync layout from URL on browser back/forward
	// SvelteKit's afterNavigate doesn't fire for shallow routing popstate,
	// so we listen directly on the window popstate event.
	function handlePopstate() {
		const params = new URLSearchParams(window.location.search);
		const l = params.get('l');
		const { panels } = l ? decodeLayout(l) : { panels: cloneLayout(DEFAULT_LAYOUT) };
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

	let showLayoutPopup = $state(false);

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
			// Cancel active interactions first, only exit if nothing was active
			if (termState.isResizing || termState.isDragging) {
				e.preventDefault();
				return;
			}
			goto(resolve(`/activities/${a.id}`));
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} onpopstate={handlePopstate} />

<div data-terminal class="fixed inset-0 flex flex-col" style="background: var(--term-mesh);">
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
	<div class="flex items-center h-8 px-3 shrink-0" style="border-bottom: 1px solid var(--term-border); position: relative; z-index: 1;">
		<a
			href={resolve(`/activities/${a.id}`)}
			class="text-[11px] px-2 py-0.5 rounded no-underline"
			style="color: var(--term-text-muted); border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
		>ESC Exit</a>
		<span class="ml-3 text-[12px] font-medium truncate" style="color: var(--term-text); font-family: 'Geist Mono', monospace;">{a.name}</span>
		<span class="ml-2 text-[11px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">
			{new Date(a.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
		</span>
		<button
			class="ml-auto text-[11px] px-2 py-0.5 rounded"
			style="color: {showLayoutPopup ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}; border: 1px solid var(--term-border); font-family: 'Geist Mono', monospace;"
			onclick={() => showLayoutPopup = !showLayoutPopup}
		>Layouts</button>
	</div>

	<div class="flex-1" style="min-height: 0; position: relative; z-index: 1;">
		<TerminalLayout
			activity={{ distance: a.distance, movingTime: a.movingTime, averageSpeed: a.averageSpeed, averageHeartrate: a.averageHeartrate, totalElevationGain: a.totalElevationGain, averageCadence: a.averageCadence, routeGeoJson: a.routeGeoJson }}
			{units}
			{termState}
			{streams}
			{notes}
			laps={lapList}
			segments={segmentList}
			{paceZones}
			{hrZones}
			onlayoutcommit={pushLayoutToHistory}
		/>
	</div>
</div>

{#if showLayoutPopup}
	<LayoutPopup
		{termState}
		{savedLayouts}
		onlayoutschange={refreshLayouts}
		onclose={() => showLayoutPopup = false}
	/>
{/if}
