<script lang="ts">
	import type { Units } from '$lib/format';
	import { smoothStream, formatXLabelShort } from '../shared/axes';
	import { resolveMouseIndex, trimChartData, TERM_PAD } from '../shared/chart-utils';
	import { createChartDimensions } from '../shared/chart-dimensions.svelte';
	import ChartShell from './ChartShell.svelte';
	import XAxisLabels from './XAxisLabels.svelte';
	import CrosshairLine from './CrosshairLine.svelte';

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

	const dims = createChartDimensions(TERM_PAD);
	const BUCKET_COUNT = 60;

	let xData = $derived(
		xAxis === 'distance' && distanceData
			? distanceData
			: timeData ?? data.map((_, i) => i),
	);

	let trimmed = $derived(trimChartData(data, xData));
	let trimData = $derived(trimmed.trimData);
	let trimXData = $derived(trimmed.trimXData);

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
		return dims.padding.left + ((xVal - xMin) / (xMax - xMin)) * dims.chartW;
	}

	let barStep = $derived(buckets.length > 0 ? dims.chartW / buckets.length : 0);
	let barWidth = $derived(
		buckets.length > 1 ? Math.max(2, barStep * 0.7) : dims.chartW * 0.5,
	);

	function barX(i: number): number {
		return dims.padding.left + barStep * (i + 0.5);
	}

	let tooltipValue = $derived(
		crosshairIndex != null && smoothData[crosshairIndex] != null
			? smoothData[crosshairIndex] : null,
	);

	let xPositions = $derived(trimXData.map((x) => toX(x)));

	function handleMouseMove(e: MouseEvent) {
		const idx = resolveMouseIndex(dims.svgEl, e, xPositions);
		if (idx != null) oncrosshairmove?.(idx);
	}

	function handleClick(e: MouseEvent) {
		const idx = resolveMouseIndex(dims.svgEl, e, xPositions);
		if (idx != null) oncrosshairclick?.(idx);
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

	let crosshairX = $derived(
		crosshairIndex != null && trimXData[crosshairIndex] != null
			? toX(trimXData[crosshairIndex]) : null,
	);
</script>

<ChartShell
	{dims}
	label="{label} bar chart"
	onmousemove={handleMouseMove}
	onclick={handleClick}
	onmouseleave={() => oncrosshairleave?.()}
	onkeydown={(e) => { if (e.key === 'Escape') oncrosshairleave?.(); }}
>
	{#snippet header()}
		{#if tooltipValue != null}
			{fmt(tooltipValue)}
		{:else}
			{fmt(yBounds.yMin)}–{fmt(yMax)}
		{/if}
	{/snippet}

	{#snippet content()}
		{#if highlightPixels}
			<rect
				x={highlightPixels.x1}
				y={dims.padding.top}
				width={Math.max(2, highlightPixels.x2 - highlightPixels.x1)}
				height={dims.chartH}
				fill="var(--term-text-bright)"
				fill-opacity="0.1"
			/>
		{/if}

		{#each buckets as bucket, i (i)}
			{@const bx = barX(i)}
			{@const h = yMax > 0 ? (bucket.avg / yMax) * dims.chartH : 0}
			{@const intensity = yMax > 0 ? 0.3 + (bucket.avg / yMax) * 0.7 : 0.3}
			<rect
				x={bx - barWidth / 2}
				y={dims.padding.top + dims.chartH - h}
				width={barWidth}
				height={h}
				fill={color}
				fill-opacity={intensity}
				rx="1"
			/>
		{/each}

		<CrosshairLine
			x={crosshairX}
			locked={crosshairLocked}
			padTop={dims.padding.top}
			chartH={dims.chartH}
		/>

		<XAxisLabels labels={xLabels} svgHeight={dims.svgHeight} />
	{/snippet}
</ChartShell>
