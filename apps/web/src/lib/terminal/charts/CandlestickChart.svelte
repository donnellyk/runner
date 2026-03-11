<script lang="ts">
	import type { CandleData } from '../candlestick';
	import type { Units } from '$lib/format';
	import { formatPaceDisplay } from '$lib/format';

	interface Props {
		candles: CandleData[];
		units?: Units;
		crosshairIndex?: number | null;
		oncrosshairmove?: (index: number | null) => void;
		mode?: 'splits' | 'laps';
	}

	let {
		candles,
		units = 'metric',
		crosshairIndex = null,
		oncrosshairmove,
		mode = 'splits',
	}: Props = $props();

	const PAD_TOP = 6;
	const PAD_BOTTOM = 20;
	const PAD_LEFT = 4;
	const PAD_RIGHT = 56;

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

	function handleMouseMove(e: MouseEvent) {
		if (!svgEl || candles.length === 0) return;
		const rect = svgEl.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		let closest = 0;
		let minDist = Infinity;
		for (let i = 0; i < candles.length; i++) {
			const d = Math.abs(candleX(i) - mouseX);
			if (d < minDist) { minDist = d; closest = i; }
		}
		oncrosshairmove?.(closest);
	}

	function handleMouseLeave() {
		oncrosshairmove?.(null);
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

	<svg
		bind:this={svgEl}
		class="flex-1 w-full"
		style="display: block; min-height: 0;"
		preserveAspectRatio="none"
		viewBox="0 0 {svgWidth} {svgHeight}"
		role="img"
		aria-label="Pace candlestick chart"
		onmousemove={handleMouseMove}
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
			<line x1={cx} y1={PAD_TOP} x2={cx} y2={PAD_TOP + chartH}
				stroke="var(--term-crosshair)" stroke-width="1" stroke-dasharray="3,2" />
		{/if}

		{#each candles as candle, i (i)}
			{#if i % Math.max(1, Math.floor(candles.length / 8)) === 0 || i === candles.length - 1}
				<text x={candleX(i)} y={svgHeight - 4} text-anchor="middle"
					fill="var(--term-text-muted)" font-size="10" font-family="'Geist Mono', monospace"
				>{candle.label}</text>
			{/if}
		{/each}
	</svg>
</div>
