<script lang="ts">
	import { smoothStream, formatXLabelShort } from '../shared/axes';
	import { resolveMouseIndex, trimChartData, TERM_PAD } from '../shared/chart-utils';
	import { createChartDimensions } from '../shared/chart-dimensions.svelte';
	import { formatYValue } from '../shared/chart-formatting';
	import type { CrosshairCallbacks, ChartDataProps, ChartLabelProps } from '../shared/chart-props';
	import type { OverlaySeries } from '../types';
	import type { ChartZoom } from '../terminal-state.svelte';
	import { createWheelHandler } from '../shared/chart-gesture';
	import ChartShell from './ChartShell.svelte';
	import XAxisLabels from './XAxisLabels.svelte';
	import CrosshairLine from './CrosshairLine.svelte';

	export interface BarEntry {
		avg: number;
		xMid: number;
		label?: string;
	}

	interface Props extends ChartDataProps, ChartLabelProps, CrosshairCallbacks {
		data: number[];
		smoothingWindow?: number;
		precomputedBars?: BarEntry[];
		overlayData?: OverlaySeries[];
		zoom?: ChartZoom;
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
		precomputedBars,
		oncrosshairmove,
		oncrosshairclick,
		oncrosshairleave,
		overlayData,
		zoom,
	}: Props = $props();

	function fmt(v: number): string {
		return formatYValue(v, unit, formatValue);
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

	let buckets = $derived.by((): BarEntry[] => {
		if (precomputedBars) return precomputedBars;
		if (smoothData.length === 0) return [];
		const count = Math.min(BUCKET_COUNT, smoothData.length);
		const result: BarEntry[] = [];
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

	// Compute overlay buckets for each overlay series
	let overlayBuckets = $derived.by((): { buckets: BarEntry[]; color: string; label: string }[] => {
		if (!overlayData || overlayData.length === 0 || buckets.length === 0) return [];
		return overlayData.map((o) => {
			const smoothed = smoothStream(o.data, smoothingWindow, null);
			const count = Math.min(BUCKET_COUNT, smoothed.length);
			const result: BarEntry[] = [];
			for (let b = 0; b < count; b++) {
				const start = Math.floor((b / count) * smoothed.length);
				const end = Math.floor(((b + 1) / count) * smoothed.length);
				let sum = 0, n = 0;
				for (let i = start; i < end; i++) {
					if (smoothed[i] > 0) { sum += smoothed[i]; n++; }
				}
				result.push({ avg: n > 0 ? sum / n : 0, xMid: 0 });
			}
			return { buckets: result, color: o.color, label: o.label };
		});
	});

	let yBounds = $derived.by(() => {
		const vals = buckets.map((b) => b.avg).filter((v) => v > 0);
		const allVals = [...vals];
		for (const ob of overlayBuckets) {
			for (const b of ob.buckets) {
				if (b.avg > 0) allVals.push(b.avg);
			}
		}
		if (allVals.length === 0) return { yMin: 0, yMax: 1 };
		return { yMin: 0, yMax: Math.max(...allVals) * 1.1 };
	});

	let yMax = $derived(yBounds.yMax);

	let xMin = $derived(trimXData[0] ?? 0);
	let xMax = $derived(trimXData[trimXData.length - 1] ?? 1);

	let visibleX = $derived.by(() => {
		if (!zoom || zoom.locked) return { min: xMin, max: xMax };
		return zoom.applyXRange(xMin, xMax);
	});
	let vxMin = $derived(visibleX.min);
	let vxMax = $derived(visibleX.max);

	let visibleYMax = $derived.by(() => {
		if (!zoom || zoom.locked) return yMax;
		return zoom.applyYRange(0, yMax).max;
	});

	function toX(xVal: number): number {
		return dims.padding.left + ((xVal - vxMin) / (vxMax - vxMin)) * dims.chartW;
	}

	let barStep = $derived(buckets.length > 0 ? dims.chartW / buckets.length : 0);
	let barWidth = $derived(
		buckets.length > 1 ? Math.max(2, barStep * 0.7) : dims.chartW * 0.5,
	);

	function barX(i: number): number {
		return dims.padding.left + barStep * (i + 0.5);
	}

	let crosshairBarIdx = $derived.by((): number | null => {
		if (crosshairIndex == null || buckets.length === 0) return null;
		if (precomputedBars) {
			// For precomputed bars, find closest bar by xMid distance
			const dist = distanceData?.[crosshairIndex] ?? crosshairIndex;
			let closest = 0;
			let minD = Infinity;
			for (let i = 0; i < buckets.length; i++) {
				const d = Math.abs(buckets[i].xMid - dist);
				if (d < minD) { minD = d; closest = i; }
			}
			return closest;
		}
		// For stream buckets, map stream index to bucket index
		const bucketIdx = Math.floor((crosshairIndex / smoothData.length) * buckets.length);
		return Math.max(0, Math.min(buckets.length - 1, bucketIdx));
	});

	let tooltipValue = $derived(
		crosshairBarIdx != null ? buckets[crosshairBarIdx]?.avg ?? null : null,
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
		crosshairBarIdx != null ? barX(crosshairBarIdx) : null,
	);

	let wheelHandler = $derived(zoom ? createWheelHandler(() => zoom, () => dims, dims.padding) : undefined);
</script>

<ChartShell
	{dims}
	label="{label} bar chart"
	onmousemove={handleMouseMove}
	onclick={handleClick}
	onmouseleave={() => oncrosshairleave?.()}
	onkeydown={(e) => { if (e.key === 'Escape') oncrosshairleave?.(); }}
	onwheel={wheelHandler}
>
	{#snippet header()}
		{#if tooltipValue != null}
			{fmt(tooltipValue)}
		{:else}
			{fmt(yBounds.yMin)}–{fmt(visibleYMax)}
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
			{@const h = visibleYMax > 0 ? (bucket.avg / visibleYMax) * dims.chartH : 0}
			{@const intensity = visibleYMax > 0 ? 0.3 + (bucket.avg / visibleYMax) * 0.7 : 0.3}
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

		{#each overlayBuckets as overlay, oi (oi)}
			{#each overlay.buckets as bucket, i (i)}
				{@const bx = barX(i)}
				{@const h = visibleYMax > 0 ? (bucket.avg / visibleYMax) * dims.chartH : 0}
				<rect
					x={bx - barWidth / 2}
					y={dims.padding.top + dims.chartH - h}
					width={barWidth}
					height={h}
					fill={overlay.color}
					fill-opacity="0.5"
					rx="1"
				/>
			{/each}
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
