<script lang="ts">
	import { KM_TO_MI_PACE, type Units } from '$lib/format';

	interface Lap {
		lapIndex: number;
		averageSpeed: number | null;
	}

	interface Props {
		laps: Lap[];
		units?: Units;
		color?: string;
	}

	let { laps, units = 'metric', color = '#6366f1' }: Props = $props();

	const CHART_H = 220;
	const PAD_TOP = 8;
	const PAD_BOTTOM = 20;
	const PAD_LEFT = 54;
	const PAD_RIGHT = 0;
	const BAR_GAP = 3;
	// Fraction of chart height used for the compressed 0→scaleFloor zone
	const BOTTOM_FRAC = 0.25;

	let svgEl = $state<SVGSVGElement | null>(null);
	let svgWidth = $state(600);

	$effect(() => {
		if (!svgEl) return;
		const ro = new ResizeObserver(([entry]) => {
			svgWidth = entry.contentRect.width;
		});
		ro.observe(svgEl);
		return () => ro.disconnect();
	});

	let chartW = $derived(svgWidth - PAD_LEFT - PAD_RIGHT);
	let chartH = $derived(CHART_H - PAD_TOP - PAD_BOTTOM);

	function speedToPace(speed: number | null): number | null {
		if (!speed || speed <= 0) return null;
		const secPerKm = 1000 / speed;
		return units === 'imperial' ? secPerKm * KM_TO_MI_PACE : secPerKm;
	}

	let paces = $derived(laps.map((l) => speedToPace(l.averageSpeed)));
	let validPaces = $derived(paces.filter((p): p is number => p != null));

	let yMin = $derived(validPaces.length > 0 ? Math.min(...validPaces) : 0);
	let yMax = $derived(validPaces.length > 0 ? Math.max(...validPaces) : 1);
	let yRange = $derived(yMax - yMin || 1);

	let avgPace = $derived(
		validPaces.length > 0
			? validPaces.reduce((a, b) => a + b, 0) / validPaces.length
			: null,
	);

	// Non-linear scale: 0→scaleFloor is compressed into BOTTOM_FRAC of chart height.
	// scaleFloor→scaleCeil is expanded into (1-BOTTOM_FRAC), giving label space.
	let scaleFloor = $derived(Math.floor((yMin - 30) / 60) * 60); // round minute just below yMin
	let scaleCeil  = $derived(Math.ceil((yMax + 15) / 60) * 60);  // round minute just above yMax

	let barSlot = $derived(laps.length > 0 ? chartW / laps.length : 0);
	let barW = $derived(Math.max(1, barSlot - BAR_GAP));

	function barHeight(pace: number): number {
		if (pace <= 0) return 0;
		if (pace <= scaleFloor) {
			return (pace / scaleFloor) * BOTTOM_FRAC * chartH;
		}
		const expanded = Math.min(pace - scaleFloor, scaleCeil - scaleFloor) / (scaleCeil - scaleFloor);
		return BOTTOM_FRAC * chartH + expanded * (1 - BOTTOM_FRAC) * chartH;
	}
	function barY(pace: number): number {
		return PAD_TOP + chartH - barHeight(pace);
	}

	function formatPace(sec: number): string {
		const mins = Math.floor(sec / 60);
		const secs = Math.round(sec % 60);
		const u = units === 'imperial' ? '/mi' : '/km';
		return `${mins}:${String(secs).padStart(2, '0')}${u}`;
	}

	// Y-axis labels: every 1 minute within the expanded zone only
	let yLabels = $derived.by(() => {
		const labels: { value: number; y: number }[] = [];
		for (let v = scaleFloor; v <= scaleCeil; v += 60) {
			labels.push({ value: v, y: barY(v) });
		}
		return labels;
	});

	let hoveredIndex = $state<number | null>(null);

	function handleMouseMove(e: MouseEvent) {
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		const mouseX = e.clientX - rect.left - PAD_LEFT;
		const i = Math.floor(mouseX / barSlot);
		hoveredIndex = i >= 0 && i < laps.length ? i : null;
	}

	function handleMouseLeave() {
		hoveredIndex = null;
	}

	let tooltipValue = $derived(
		hoveredIndex != null && paces[hoveredIndex] != null
			? formatPace(paces[hoveredIndex]!)
			: null,
	);
</script>

<div class="mb-6">
	<div class="flex items-baseline justify-between mb-1.5">
		<span class="text-xs font-medium uppercase tracking-wide text-zinc-400">Laps</span>
		{#if tooltipValue != null}
			<span class="font-mono text-xs text-zinc-700" style="font-variant-numeric: tabular-nums;">
				Lap {(hoveredIndex ?? 0) + 1} · {tooltipValue}
			</span>
		{:else}
			<span class="font-mono text-xs text-zinc-400" style="font-variant-numeric: tabular-nums;">
				{laps.length} laps · {formatPace(yMin)}–{formatPace(yMax)}
			</span>
		{/if}
	</div>

	<svg
		bind:this={svgEl}
		width="100%"
		viewBox="0 0 {svgWidth} {CHART_H}"
		style="height: {CHART_H}px; display: block;"
		role="img"
		aria-label="Laps pace chart"
		onmousemove={handleMouseMove}
		onmouseleave={handleMouseLeave}
	>
		{#each yLabels as lbl}
			<line
				x1={PAD_LEFT}
				y1={lbl.y}
				x2={PAD_LEFT + chartW}
				y2={lbl.y}
				stroke="#e4e4e7"
				stroke-width="1"
			/>
			<text
				x={PAD_LEFT - 6}
				y={lbl.y + 3}
				text-anchor="end"
				fill="#a1a1aa"
				font-size="9"
				font-family="'Geist Mono', monospace"
			>{formatPace(lbl.value)}</text>
		{/each}

		{#if avgPace != null}
			{@const avgY = barY(avgPace)}
			<line
				x1={PAD_LEFT}
				y1={avgY}
				x2={PAD_LEFT + chartW}
				y2={avgY}
				stroke="#71717a"
				stroke-width="1"
				stroke-dasharray="3,2"
			/>
			<text
				x={PAD_LEFT + chartW / 2}
				y={avgY - 3}
				text-anchor="middle"
				fill="#71717a"
				font-size="9"
				font-family="'Geist Mono', monospace"
			>avg {formatPace(avgPace)}</text>
		{/if}

		{#each paces as pace, i}
			{#if pace != null}
				{@const x = PAD_LEFT + i * barSlot + BAR_GAP / 2}
				{@const isHovered = hoveredIndex === i}
				<rect
					{x}
					y={barY(pace)}
					width={barW}
					height={barHeight(pace)}
					fill={color}
					fill-opacity={isHovered ? 0.9 : 0.55}
					rx="1"
				/>
			{/if}
		{/each}

		{#each [0, Math.floor(laps.length / 2), laps.length - 1] as i}
			<text
				x={PAD_LEFT + i * barSlot + barSlot / 2}
				y={CHART_H - 4}
				text-anchor="middle"
				fill="#a1a1aa"
				font-size="9"
				font-family="'Geist Mono', monospace"
			>{i + 1}</text>
		{/each}
	</svg>
</div>
