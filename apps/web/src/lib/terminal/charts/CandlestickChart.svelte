<script lang="ts">
	import type { CandleData } from '../candlestick';
	import type { Units } from '$lib/format';
	import { formatPaceDisplay } from '$lib/format';
	import { findClosestIndex, TERM_PAD_WIDE } from '../shared/chart-utils';
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

	const PAD_TOP = TERM_PAD_WIDE.top;
	const PAD_BOTTOM = TERM_PAD_WIDE.bottom;
	const PAD_LEFT = TERM_PAD_WIDE.left;
	const PAD_RIGHT = TERM_PAD_WIDE.right;

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
		return PAD_TOP + t * chartH;
	}

	function fromY(px: number): number {
		const t = (px - PAD_TOP) / chartH;
		return yMin + t * yRange;
	}

	let candleWidth = $derived(
		candles.length > 0 ? Math.max(4, (chartW / candles.length) * 0.6) : 10,
	);

	function candleX(i: number): number {
		if (candles.length <= 1) return PAD_LEFT + chartW / 2;
		return PAD_LEFT + (i / (candles.length - 1)) * (chartW - candleWidth) + candleWidth / 2;
	}

	let tooltipCandle = $derived(
		crosshairIndex != null && candles[crosshairIndex] ? candles[crosshairIndex] : null,
	);

	// Track mouse Y for horizontal crosshair
	let mouseY = $state<number | null>(null);

	let crosshairYValue = $derived.by(() => {
		if (mouseY == null) return null;
		const clamped = Math.max(PAD_TOP, Math.min(PAD_TOP + chartH, mouseY));
		return fromY(clamped);
	});

	let crosshairYPx = $derived(
		mouseY != null ? Math.max(PAD_TOP, Math.min(PAD_TOP + chartH, mouseY)) : null,
	);

	function handleMouseMove(e: MouseEvent) {
		if (!svgEl || candles.length === 0) return;
		const rect = svgEl.getBoundingClientRect();
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
		if (!svgEl || candles.length === 0) return;
		const rect = svgEl.getBoundingClientRect();
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
</script>

<div class="relative w-full h-full flex flex-col" style="min-height: 0;">
	<div class="flex items-baseline justify-end px-2 py-1 shrink-0">
		<span class="text-[12px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums;">
			{#if tooltipCandle}
				O:{formatPaceDisplay(tooltipCandle.open, units)} C:{formatPaceDisplay(tooltipCandle.close, units)}
			{:else if candles.length > 0}
				{candles.length} {mode}
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
		aria-label="Pace candlestick chart"
		onmousemove={handleMouseMove}
		onclick={handleClick}
		onmouseleave={handleMouseLeave}
	>
		{#each yLabels as lbl, i (i)}
			<line x1={PAD_LEFT} y1={lbl.y} x2={PAD_LEFT + chartW} y2={lbl.y}
				stroke="var(--term-grid)" stroke-width="1" />
			<text x={PAD_LEFT + chartW + 4} y={lbl.y + 3} text-anchor="start"
				fill="var(--term-text-muted)" font-size="10" font-family="'Geist Mono', monospace"
			>{formatPaceDisplay(lbl.value, units)}</text>
		{/each}

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

		{#if crosshairIndex != null && candles[crosshairIndex]}
			{@const cx = candleX(crosshairIndex)}
			{@const dashStyle = crosshairLocked ? undefined : '3,2'}
			<line x1={cx} y1={PAD_TOP} x2={cx} y2={PAD_TOP + chartH}
				stroke="var(--term-crosshair)" stroke-width="1" stroke-dasharray={dashStyle} />
		{/if}

		{#if crosshairYPx != null}
			{@const dashStyle = crosshairLocked ? undefined : '3,2'}
			<line x1={PAD_LEFT} y1={crosshairYPx} x2={PAD_LEFT + chartW} y2={crosshairYPx}
				stroke="var(--term-crosshair)" stroke-width="1" stroke-dasharray={dashStyle} />

			{#if crosshairYValue != null}
				{@const labelText = formatPaceDisplay(crosshairYValue, units)}
				{@const labelW = labelText.length * 6 + 4}
				<rect x={PAD_LEFT + chartW + 2} y={crosshairYPx - 7} width={labelW} height={14}
					rx="2" fill="var(--term-pace)" fill-opacity="0.85" />
				<text x={PAD_LEFT + chartW + 4} y={crosshairYPx + 3} text-anchor="start"
					fill="var(--term-text-bright)" font-size="10" font-weight="500"
					font-family="'Geist Mono', monospace">{labelText}</text>
			{/if}
		{/if}

		{#each candles as candle, i (i)}
			{#if i % Math.max(1, Math.floor(candles.length / 8)) === 0 || i === candles.length - 1}
				<text x={candleX(i)} y={svgHeight - 4} text-anchor="middle"
					fill="var(--term-text-muted)" font-size="10" font-family="'Geist Mono', monospace"
				>{candle.label}</text>
			{/if}
		{/each}
	</svg>

	{#if tooltipCandle}
		{@const c = tooltipCandle}
		{@const isGreen = c.close <= c.open}
		<ChartOverlay left={PAD_LEFT + 2}>
			<div style="color: var(--term-text-muted); margin-bottom: 3px;">
				{c.label}
			</div>
			<div style="color: var(--term-text-bright); line-height: 1.6;">
				<div><span style="color: var(--term-text-muted);">Open </span>{formatPaceDisplay(c.open, units)}</div>
				<div><span style="color: {isGreen ? '#22c55e' : '#ef4444'};">High </span>{formatPaceDisplay(c.high, units)}</div>
				<div><span style="color: {isGreen ? '#ef4444' : '#22c55e'};">Low  </span>{formatPaceDisplay(c.low, units)}</div>
				<div><span style="color: var(--term-text-muted);">Close</span> {formatPaceDisplay(c.close, units)}</div>
			</div>
		</ChartOverlay>
	{/if}
</div>
