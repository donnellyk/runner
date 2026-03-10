<script lang="ts">
	import type { Units } from '$lib/format';
	import type { ActivityLap } from '../terminal-state.svelte';
	import { KM_TO_MI_PACE, formatPaceDisplay } from '$lib/format';

	interface Props {
		laps: ActivityLap[];
		units?: Units;
	}

	let { laps, units = 'metric' }: Props = $props();

	let lapPaces = $derived(
		laps.map((lap) => {
			const speed = lap.averageSpeed ?? 0;
			if (speed <= 0) return 0;
			const secPerKm = 1000 / speed;
			return units === 'imperial' ? secPerKm * KM_TO_MI_PACE : secPerKm;
		}),
	);

	let paceRange = $derived.by(() => {
		const valid = lapPaces.filter((p) => p > 0);
		if (valid.length === 0) return { min: 0, max: 1 };
		return { min: Math.min(...valid), max: Math.max(...valid) };
	});

	const PAD_TOP = 6;
	const PAD_BOTTOM = 4;
	const PAD_LEFT = 30;
	const PAD_RIGHT = 60;

	let svgEl = $state<SVGSVGElement | null>(null);
	let svgWidth = $state(400);
	let svgHeight = $state(160);

	$effect(() => {
		if (!svgEl) return;
		const ro = new ResizeObserver(([entry]) => {
			svgWidth = entry.contentRect.width;
			svgHeight = entry.contentRect.height;
		});
		ro.observe(svgEl);
		return () => ro.disconnect();
	});

	let chartW = $derived(svgWidth - PAD_LEFT - PAD_RIGHT);
	let chartH = $derived(svgHeight - PAD_TOP - PAD_BOTTOM);

	let barHeight = $derived(
		laps.length > 0 ? Math.min(20, (chartH / laps.length) * 0.7) : 10,
	);

	function barY(i: number): number {
		if (laps.length <= 1) return PAD_TOP + chartH / 2;
		return PAD_TOP + (i / (laps.length - 1)) * (chartH - barHeight) + barHeight / 2;
	}

	function barW(pace: number): number {
		if (paceRange.max === paceRange.min || pace <= 0) return 0;
		const t = (pace - paceRange.min) / (paceRange.max - paceRange.min);
		return (1 - t) * chartW * 0.8 + chartW * 0.2;
	}
</script>

<div class="relative w-full h-full flex flex-col" style="min-height: 0;">
	<div class="flex items-baseline justify-between px-2 py-1 shrink-0">
		<span class="text-[10px] uppercase tracking-widest" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">
			Lap Comparison
		</span>
		<span class="text-[11px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">
			{laps.length} laps
		</span>
	</div>

	<svg
		bind:this={svgEl}
		class="flex-1 w-full"
		style="display: block; min-height: 0;"
		preserveAspectRatio="none"
		viewBox="0 0 {svgWidth} {svgHeight}"
		role="img"
		aria-label="Lap comparison chart"
	>
		{#each laps as lap, i (lap.id)}
			{@const pace = lapPaces[i]}
			{@const w = barW(pace)}
			{@const y = barY(i)}
			{@const fastest = pace === paceRange.min}

			<text x={PAD_LEFT - 4} y={y + barHeight / 4} text-anchor="end"
				fill="var(--term-text-muted)" font-size="9" font-family="'Geist Mono', monospace"
			>{i + 1}</text>

			<rect x={PAD_LEFT} y={y - barHeight / 2} width={w} height={barHeight}
				fill={fastest ? '#22c55e' : 'var(--term-pace)'} fill-opacity={fastest ? 0.8 : 0.5}
				rx="2" />

			{#if pace > 0}
				<text x={PAD_LEFT + w + 4} y={y + barHeight / 4} text-anchor="start"
					fill="var(--term-text-bright)" font-size="9" font-family="'Geist Mono', monospace"
					style="font-variant-numeric: tabular-nums;"
				>{formatPaceDisplay(pace, units)}</text>
			{/if}
		{/each}
	</svg>
</div>
