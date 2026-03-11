<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import '$lib/terminal/terminal-theme.css';
	import TerminalLayout from '$lib/terminal/TerminalLayout.svelte';
	import {
		createTerminalState,
		type StreamData,
		type ActivityNote,
		type ActivityLap,
		type ActivitySegment,
	} from '$lib/terminal/terminal-state.svelte';
	import type { Units } from '$lib/format';

	let { data } = $props();

	const units = $derived(data.user.distanceUnit as Units);
	const a = $derived(data.activity);
	const paceZones = $derived(data.paceZones);
	const hrZones = $derived(data.hrZones);

	function getStream(type: string): number[] | null {
		const s = data.streamMap[type];
		return Array.isArray(s) && s.length > 0 ? s : null;
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
			return Array.isArray(s) && s.length > 0 ? s as unknown as [number, number][] : null;
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

	const state = createTerminalState();

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
			goto(resolve(`/activities/${a.id}`));
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

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
					--mesh-drift-x: {-50 + 15 * state.meshDrift}%;
					--mesh-drift-y: {-50 - 15 * state.meshDrift}%;
					--mesh-scale: {1 + 0.2 * state.meshScale};
					animation: mesh-drift {state.meshSpeed > 0 ? orb.dur / state.meshSpeed : 0}s ease-in-out infinite alternate;
					animation-play-state: {state.meshSpeed > 0 ? 'running' : 'paused'};
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
	</div>

	<div class="flex-1" style="min-height: 0; position: relative; z-index: 1;">
		<TerminalLayout
			activity={{ distance: a.distance, movingTime: a.movingTime, averageSpeed: a.averageSpeed, averageHeartrate: a.averageHeartrate, totalElevationGain: a.totalElevationGain, averageCadence: a.averageCadence, routeGeoJson: a.routeGeoJson }}
			{units}
			{state}
			{streams}
			{notes}
			laps={lapList}
			segments={segmentList}
			{paceZones}
			{hrZones}
		/>
	</div>
</div>

