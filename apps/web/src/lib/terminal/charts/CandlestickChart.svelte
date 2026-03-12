<script lang="ts">
	import type { CandleData } from '../candlestick';
	import type { Units } from '$lib/format';
	import { formatPaceDisplay } from '$lib/format';
	import { findClosestIndex, TERM_PAD_WIDE } from '../shared/chart-utils';
	import { createChartDimensions } from '../shared/chart-dimensions.svelte';
	import ChartShell from './ChartShell.svelte';
	import YGridLines from './YGridLines.svelte';
	import XAxisLabels from './XAxisLabels.svelte';
	import CrosshairLine from './CrosshairLine.svelte';
	import ChartOverlay from './ChartOverlay.svelte';

	interface Props {
		candles: CandleData[];
		units?: Units;
		crosshairIndex?: number | null;
		crosshairLocked?: boolean;
		oncrosshairmove?: (index: number | null) => void;
		oncrosshairclick?: (index: number | null) => void;
		oncrosshairleave?: () => void;
		mode?: 'splits' | 'laps';
	}

	let {
		candles,
		units = 'metric',
		crosshairIndex = null,
		crosshairLocked = false,
		oncrosshairmove,
		oncrosshairclick,
		oncrosshairleave,
		mode = 'splits',
	}: Props = $props();

	const dims = createChartDimensions(TERM_PAD_WIDE);
	const P = TERM_PAD_WIDE;

	let yBounds = $derived.by(() => {
		if (candles.length === 0) return { yMin: 0, yMax: 1 };
		const allVals = candles.flatMap((c) => [c.high, c.low, c.open, c.close]);
		const valid = allVals.filter((v) => v > 0);
		if (valid.length === 0) return { yMin: 0, yMax: 1 };
		const lo = Math.min(...valid);
		const hi = Math.max(...valid);
		const pad = (hi - lo) * 0.1;
		return { yMin: Math.max(0, lo - pad), yMax: hi + pad };
	});

	let yMin = $derived(yBounds.yMin);
	let yMax = $derived(yBounds.yMax);
	let yRange = $derived(yMax - yMin || 1);

	function toY(v: number): number {
		const t = (v - yMin) / yRange;
		return P.top + t * dims.chartH;
	}

	function fromY(px: number): number {
		const t = (px - P.top) / dims.chartH;
		return yMin + t * yRange;
	}

	let candleWidth = $derived(
		candles.length > 0 ? Math.max(4, (dims.chartW / candles.length) * 0.6) : 10,
	);

	function candleX(i: number): number {
		if (candles.length <= 1) return P.left + dims.chartW / 2;
		return P.left + (i / (candles.length - 1)) * (dims.chartW - candleWidth) + candleWidth / 2;
	}

	let tooltipCandle = $derived(
		crosshairIndex != null && candles[crosshairIndex] ? candles[crosshairIndex] : null,
	);

	let mouseY = $state<number | null>(null);

	let crosshairYValue = $derived.by(() => {
		if (mouseY == null) return null;
		const clamped = Math.max(P.top, Math.min(P.top + dims.chartH, mouseY));
		return fromY(clamped);
	});

	let crosshairYPx = $derived(
		mouseY != null ? Math.max(P.top, Math.min(P.top + dims.chartH, mouseY)) : null,
	);

	function handleMouseMove(e: MouseEvent) {
		if (!dims.svgEl || candles.length === 0) return;
		const rect = dims.svgEl.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		if (!crosshairLocked) {
			mouseY = my;
		}

		const idx = findClosestIndex(mx, candles.map((_, i) => candleX(i)));
		if (crosshairLocked) return;
		oncrosshairmove?.(idx);
	}

	function handleClick(e: MouseEvent) {
		if (!dims.svgEl || candles.length === 0) return;
		const rect = dims.svgEl.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const idx = findClosestIndex(mx, candles.map((_, i) => candleX(i)));

		if (crosshairLocked) {
			mouseY = my;
		}

		oncrosshairclick?.(idx);
	}

	function handleMouseLeave() {
		if (crosshairLocked) return;
		mouseY = null;
		oncrosshairleave?.();
	}

	let yLabels = $derived.by(() => {
		const top = yMin;
		const mid = (yMin + yMax) / 2;
		const bottom = yMax;
		return [
			{ value: top, y: toY(top) },
			{ value: mid, y: toY(mid) },
			{ value: bottom, y: toY(bottom) },
		];
	});

	let crosshairX = $derived(
		crosshairIndex != null && candles[crosshairIndex] ? candleX(crosshairIndex) : null,
	);

	let xLabels = $derived.by(() => {
		if (candles.length === 0) return [];
		const result: { x: number; label: string }[] = [];
		const step = Math.max(1, Math.floor(candles.length / 8));
		for (let i = 0; i < candles.length; i++) {
			if (i % step === 0 || i === candles.length - 1) {
				result.push({ x: candleX(i), label: candles[i].label });
			}
		}
		return result;
	});
</script>

<ChartShell
	{dims}
	label="Pace candlestick chart"
	onmousemove={handleMouseMove}
	onclick={handleClick}
	onmouseleave={handleMouseLeave}
	onkeydown={(e) => { if (e.key === 'Escape') oncrosshairleave?.(); }}
>
	{#snippet header()}
		{#if candles.length > 0}
			{candles.length} {mode}
		{/if}
	{/snippet}

	{#snippet content()}
		<YGridLines
			labels={yLabels}
			formatLabel={(v) => formatPaceDisplay(v, units).replace(/\s*\/\w+$/, '')}
			padLeft={P.left}
			chartW={dims.chartW}
		/>

		{#each candles as candle, i (i)}
			{@const cx = candleX(i)}
			{@const bodyTop = Math.min(toY(candle.open), toY(candle.close))}
			{@const bodyBot = Math.max(toY(candle.open), toY(candle.close))}
			{@const bodyH = Math.max(1, bodyBot - bodyTop)}
			{@const isGreen = candle.close <= candle.open}
			{@const bodyColor = isGreen ? '#22c55e' : '#ef4444'}

			<line x1={cx} y1={toY(candle.high)} x2={cx} y2={toY(candle.low)}
				stroke={bodyColor} stroke-width="1" />
			<rect x={cx - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyH}
				fill={bodyColor} rx="1" />
		{/each}

		<CrosshairLine
			x={crosshairX}
			locked={crosshairLocked}
			padTop={P.top}
			chartH={dims.chartH}
			y={crosshairYPx}
			padLeft={P.left}
			chartW={dims.chartW}
			badgeLabel={crosshairYValue != null ? formatPaceDisplay(crosshairYValue, units).replace(/\s*\/\w+$/, '') : null}
			badgeColor="var(--term-pace)"
		/>

		<XAxisLabels labels={xLabels} svgHeight={dims.svgHeight} />
	{/snippet}

	{#snippet overlay()}
		{#if tooltipCandle}
			{@const c = tooltipCandle}
			{@const isGreen = c.close <= c.open}
			<ChartOverlay left={P.left + 2}>
				<div style="color: var(--term-text-bright); line-height: 1.6; display: grid; grid-template-columns: auto auto; column-gap: 6px;">
					<span style="color: var(--term-text-muted);">Start</span><span>{formatPaceDisplay(c.open, units)}</span>
					<span style="color: {isGreen ? '#22c55e' : '#ef4444'};">High</span><span>{formatPaceDisplay(c.high, units)}</span>
					<span style="color: {isGreen ? '#ef4444' : '#22c55e'};">Low</span><span>{formatPaceDisplay(c.low, units)}</span>
					<span style="color: var(--term-text-muted);">End</span><span>{formatPaceDisplay(c.close, units)}</span>
				</div>
			</ChartOverlay>
		{/if}
	{/snippet}
</ChartShell>
