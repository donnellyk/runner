<script lang="ts">
	import type { Units } from '$lib/format';
	import type { ActivityLap } from '../terminal-state.svelte';
	import { speedToPace, formatPaceDisplay } from '$lib/format';
	import { createChartDimensions } from '../shared/chart-dimensions.svelte';

	interface Props {
		laps: ActivityLap[];
		units?: Units;
	}

	let { laps, units = 'metric' }: Props = $props();

	let lapPaces = $derived(
		laps.map((lap) => speedToPace(lap.averageSpeed, units) ?? 0),
	);

	let paceRange = $derived.by(() => {
		const valid = lapPaces.filter((p) => p > 0);
		if (valid.length === 0) return { min: 0, max: 1 };
		return { min: Math.min(...valid), max: Math.max(...valid) };
	});

	const LAP_PAD = { top: 6, bottom: 4, left: 30, right: 60 } as const;
	const dims = createChartDimensions(LAP_PAD);

	let barHeight = $derived(
		laps.length > 0 ? Math.min(20, (dims.chartH / laps.length) * 0.7) : 10,
	);

	function barY(i: number): number {
		if (laps.length <= 1) return LAP_PAD.top + dims.chartH / 2;
		return LAP_PAD.top + (i / (laps.length - 1)) * (dims.chartH - barHeight) + barHeight / 2;
	}

	function barW(pace: number): number {
		if (paceRange.max === paceRange.min || pace <= 0) return 0;
		const t = (pace - paceRange.min) / (paceRange.max - paceRange.min);
		return (1 - t) * dims.chartW * 0.8 + dims.chartW * 0.2;
	}
</script>

<div class="relative w-full h-full flex flex-col" style="min-height: 0;">
	<div class="flex items-baseline justify-end px-2 py-1 shrink-0">
		<span class="text-[13px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">
			{laps.length} laps
		</span>
	</div>

	<svg
		bind:this={dims.svgEl}
		class="flex-1 w-full"
		style="display: block; min-height: 0;"
		preserveAspectRatio="none"
		viewBox="0 0 {dims.svgWidth} {dims.svgHeight}"
		role="img"
		aria-label="Lap comparison chart"
	>
		{#each laps as lap, i (lap.id)}
			{@const pace = lapPaces[i]}
			{@const w = barW(pace)}
			{@const y = barY(i)}
			{@const fastest = pace === paceRange.min}

			<text x={LAP_PAD.left - 4} y={y + barHeight / 4} text-anchor="end"
				fill="var(--term-text-muted)" font-size="11" font-family="'Geist Mono', monospace"
			>{i + 1}</text>

			<rect x={LAP_PAD.left} y={y - barHeight / 2} width={w} height={barHeight}
				fill={fastest ? '#22c55e' : 'var(--term-pace)'} fill-opacity={fastest ? 0.8 : 0.5}
				rx="2" />

			{#if pace > 0}
				<text x={LAP_PAD.left + w + 4} y={y + barHeight / 4} text-anchor="start"
					fill="var(--term-text-bright)" font-size="11" font-family="'Geist Mono', monospace"
					style="font-variant-numeric: tabular-nums;"
				>{formatPaceDisplay(pace, units)}</text>
			{/if}
		{/each}
	</svg>
</div>
