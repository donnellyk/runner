<script lang="ts">
	import type { Units } from '$lib/format';
	import { smoothStream, trimLeadingZeros, formatXLabelShort } from '../shared/axes';
	import { findClosestIndex } from '../shared/chart-utils';

	interface Props {
		data: number[];
		distanceData?: number[];
		timeData?: number[];
		xAxis?: 'distance' | 'time';
		units?: Units;
		label: string;
		color: string;
		unit: string;
		formatValue?: (v: number) => string;
		smoothingWindow?: number;
		crosshairIndex?: number | null;
		crosshairLocked?: boolean;
		highlightRange?: { start: number; end: number } | null;
		oncrosshairmove?: (index: number | null) => void;
		oncrosshairclick?: (index: number | null) => void;
		oncrosshairleave?: () => void;
	}

	let {
		data,
		distanceData,
		timeData,
		xAxis = 'distance',
		units = 'metric',
		label,
		color,
		unit,
		formatValue,
		smoothingWindow = 2,
		crosshairIndex = null,
		crosshairLocked = false,
		highlightRange = null,
		oncrosshairmove,
		oncrosshairclick,
		oncrosshairleave,
	}: Props = $props();

	function fmt(v: number): string {
		return formatValue ? formatValue(v) : `${v.toFixed(0)}${unit}`;
	}

	const PAD_TOP = 6;
	const PAD_BOTTOM = 20;
	const PAD_LEFT = 4;
	const PAD_RIGHT = 56;
	const BUCKET_COUNT = 60;

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

	let xData = $derived(
		xAxis === 'distance' && distanceData
			? distanceData
			: timeData ?? data.map((_, i) => i),
	);

	let startIdx = $derived(trimLeadingZeros(data));
	let trimData = $derived(startIdx > 0 ? data.slice(startIdx) : data);
	let trimXData = $derived(startIdx > 0 ? xData.slice(startIdx) : xData);

	let smoothData = $derived(smoothStream(trimData, smoothingWindow, null));

	let buckets = $derived.by(() => {
		if (smoothData.length === 0) return [];
		const count = Math.min(BUCKET_COUNT, smoothData.length);
		const result: { avg: number; xMid: number }[] = [];
		for (let b = 0; b < count; b++) {
			const start = Math.floor((b / count) * smoothData.length);
			const end = Math.floor(((b + 1) / count) * smoothData.length);
			let sum = 0, n = 0;
			for (let i = start; i < end; i++) {
				if (smoothData[i] > 0) { sum += smoothData[i]; n++; }
			}
			const mid = Math.floor((start + end) / 2);
			result.push({ avg: n > 0 ? sum / n : 0, xMid: trimXData[mid] ?? 0 });
		}
		return result;
	});

	let yBounds = $derived.by(() => {
		const vals = buckets.map((b) => b.avg).filter((v) => v > 0);
		if (vals.length === 0) return { yMin: 0, yMax: 1 };
		return { yMin: 0, yMax: Math.max(...vals) * 1.1 };
	});

	let yMax = $derived(yBounds.yMax);

	let xMin = $derived(trimXData[0] ?? 0);
	let xMax = $derived(trimXData[trimXData.length - 1] ?? 1);

	function toX(xVal: number): number {
		return PAD_LEFT + ((xVal - xMin) / (xMax - xMin)) * chartW;
	}

	let barStep = $derived(buckets.length > 0 ? chartW / buckets.length : 0);
	let barWidth = $derived(
		buckets.length > 1 ? Math.max(2, barStep * 0.7) : chartW * 0.5,
	);

	function barX(i: number): number {
		return PAD_LEFT + barStep * (i + 0.5);
	}

	let tooltipValue = $derived(
		crosshairIndex != null && smoothData[crosshairIndex] != null
			? smoothData[crosshairIndex] : null,
	);

	function resolveIndex(e: MouseEvent): number | null {
		if (!svgEl) return null;
		const rect = svgEl.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		return findClosestIndex(mouseX, trimXData.map((x) => toX(x)));
	}

	function handleMouseMove(e: MouseEvent) {
		const idx = resolveIndex(e);
		if (idx != null) oncrosshairmove?.(idx);
	}

	function handleClick(e: MouseEvent) {
		const idx = resolveIndex(e);
		if (idx != null) oncrosshairclick?.(idx);
	}

	function handleMouseLeave() {
		oncrosshairleave?.();
	}

	let highlightPixels = $derived.by((): { x1: number; x2: number } | null => {
		if (!highlightRange || !distanceData || buckets.length === 0) return null;
		let si = 0, ei = buckets.length - 1;
		for (let i = 0; i < buckets.length; i++) {
			if (buckets[i].xMid >= highlightRange.start) { si = i; break; }
		}
		for (let i = buckets.length - 1; i >= 0; i--) {
			if (buckets[i].xMid <= highlightRange.end) { ei = i; break; }
		}
		return { x1: barX(si) - barStep / 2, x2: barX(ei) + barStep / 2 };
	});

	let xLabels = $derived.by(() => {
		if (buckets.length < 2) return [];
		const bucketIndices = [0, Math.floor(buckets.length / 2), buckets.length - 1];
		return bucketIndices.map((bi) => ({
			x: barX(bi),
			label: formatXLabelShort(buckets[bi].xMid, xAxis, units),
		}));
	});
</script>

<div class="relative w-full h-full flex flex-col" style="min-height: 0;">
	<div class="flex items-baseline justify-end px-2 py-1 shrink-0">
		<span class="text-[12px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums;">
			{#if tooltipValue != null}
				{fmt(tooltipValue)}
			{:else}
				{fmt(yBounds.yMin)}–{fmt(yMax)}
			{/if}
		</span>
	</div>

	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<svg
		bind:this={svgEl}
		class="flex-1 w-full"
		style="display: block; min-height: 0;"
		preserveAspectRatio="none"
		viewBox="0 0 {svgWidth} {svgHeight}"
		role="img"
		aria-label="{label} bar chart"
		onmousemove={handleMouseMove}
		onclick={handleClick}
		onmouseleave={handleMouseLeave}
	>
		{#if highlightPixels}
			<rect
				x={highlightPixels.x1}
				y={PAD_TOP}
				width={Math.max(2, highlightPixels.x2 - highlightPixels.x1)}
				height={chartH}
				fill="var(--term-text-bright)"
				fill-opacity="0.1"
			/>
		{/if}

		{#each buckets as bucket, i (i)}
			{@const bx = barX(i)}
			{@const h = yMax > 0 ? (bucket.avg / yMax) * chartH : 0}
			{@const intensity = yMax > 0 ? 0.3 + (bucket.avg / yMax) * 0.7 : 0.3}
			<rect
				x={bx - barWidth / 2}
				y={PAD_TOP + chartH - h}
				width={barWidth}
				height={h}
				fill={color}
				fill-opacity={intensity}
				rx="1"
			/>
		{/each}

		{#if crosshairIndex != null && trimXData[crosshairIndex] != null}
			{@const cx = toX(trimXData[crosshairIndex])}
			<line x1={cx} y1={PAD_TOP} x2={cx} y2={PAD_TOP + chartH}
				stroke="var(--term-crosshair)" stroke-width="1" stroke-dasharray={crosshairLocked ? undefined : '3,2'} />
		{/if}

		{#each xLabels as lbl, i (i)}
			<text x={lbl.x} y={svgHeight - 4}
				text-anchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
				fill="var(--term-text-muted)" font-size="10" font-family="'Geist Mono', monospace"
			>{lbl.label}</text>
		{/each}
	</svg>
</div>
