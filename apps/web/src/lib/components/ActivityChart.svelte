<script lang="ts">
	import type { ZoneDefinition } from '@web-runner/shared';

	import type { Units } from '$lib/format';

	interface Props {
		data: number[];
		distanceData?: number[];
		timeData?: number[];
		xAxis?: 'distance' | 'time';
		label: string;
		color: string;
		unit: string;
		units?: Units;
		zones?: ZoneDefinition[];
		zoneMetric?: 'pace' | 'heartrate';
		crosshairIndex?: number | null;
		oncrosshairmove?: (index: number | null) => void;
		formatValue?: (v: number) => string;
		/** Clamp yMax to this percentile (0–1) to suppress outlier spikes */
		yMaxPercentile?: number;
		/** Center yMin/yMax symmetrically around the average, ignoring zeros */
		yAvgCenter?: boolean;
		/** Detect pauses and render gaps with vertical bookend markers */
		showPauseGaps?: boolean;
	}

	let {
		data,
		distanceData,
		timeData,
		xAxis = 'distance',
		label,
		color,
		unit,
		units = 'metric',
		zones,
		zoneMetric,
		crosshairIndex = null,
		oncrosshairmove,
		formatValue,
		yMaxPercentile = 1,
		yAvgCenter = false,
		showPauseGaps = false,
	}: Props = $props();

	function fmt(v: number): string {
		return formatValue ? formatValue(v) : `${v.toFixed(0)}${unit}`;
	}

	const PAD_TOP = 8;
	const PAD_BOTTOM = 20;
	const PAD_LEFT = 54;
	const PAD_RIGHT = 0;

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

	const CHART_H = 160;
	let chartW = $derived(svgWidth - PAD_LEFT - PAD_RIGHT);
	let chartH = $derived(CHART_H - PAD_TOP - PAD_BOTTOM);

	let xData = $derived(
		xAxis === 'distance' && distanceData
			? distanceData
			: timeData ?? data.map((_, i) => i),
	);

	// Drop leading zero data points (e.g. HR/pace sensor not yet active)
	let startIdx = $derived(data.findIndex((v) => v !== 0));
	let trimData = $derived(startIdx > 0 ? data.slice(startIdx) : data);
	let trimXData = $derived(startIdx > 0 ? xData.slice(startIdx) : xData);

	let xMin = $derived(trimXData[0] ?? 0);
	let xMax = $derived(trimXData[trimXData.length - 1] ?? 1);

	let yBounds = $derived.by(() => {
		const sorted = [...trimData].filter((v) => v > 0).sort((a, b) => a - b);

		if (!yAvgCenter || sorted.length === 0) {
			const yMaxVal =
				yMaxPercentile >= 1
					? Math.max(...trimData)
					: sorted[Math.min(Math.floor(sorted.length * yMaxPercentile), sorted.length - 1)] ?? 1;
			return { yMin: Math.min(...trimData), yMax: yMaxVal };
		}

		// yMax: percentile of raw values (clips slow outliers / pauses)
		const yMaxVal = sorted[Math.min(Math.floor(sorted.length * yMaxPercentile), sorted.length - 1)];
		// avg: only from values within the cap so avg is always ≤ yMax
		const capped = sorted.filter((v) => v <= yMaxVal);
		const avg = capped.reduce((a, b) => a + b, 0) / capped.length;
		// Mirror symmetrically: avg sits exactly at midline
		return { yMin: Math.max(0, 2 * avg - yMaxVal), yMax: yMaxVal };
	});
	let yMin = $derived(yBounds.yMin);
	let yMax = $derived(yBounds.yMax);
	let yRange = $derived(yMax - yMin || 1);

	function toX(xVal: number): number {
		return PAD_LEFT + ((xVal - xMin) / (xMax - xMin)) * chartW;
	}

	function toY(yVal: number): number {
		return PAD_TOP + chartH - ((yVal - yMin) / yRange) * chartH;
	}

	// Simple moving average — used for all charts
	let smoothData = $derived.by(() => {
		const w = 5;
		return trimData.map((_, i) => {
			const lo = Math.max(0, i - w);
			const hi = Math.min(trimData.length - 1, i + w);
			let sum = 0;
			for (let j = lo; j <= hi; j++) sum += trimData[j];
			return sum / (hi - lo + 1);
		});
	});

	// Pause gap logic — only used when showPauseGaps is true (pace chart)
	let pauseResult = $derived.by(() => {
		if (!showPauseGaps) return null;
		const w = 5;
		const medians = trimData.map((_, i) => {
			const lo = Math.max(0, i - w);
			const hi = Math.min(trimData.length - 1, i + w);
			const win = trimData.slice(lo, hi + 1).sort((a, b) => a - b);
			return win[Math.floor(win.length / 2)];
		});
		const isOutlier = trimData.map((v, i) => v > medians[i] * 2);
		// Segments: consecutive non-outlier runs
		const rawSegs: { startIdx: number; endIdx: number }[] = [];
		let start = -1;
		for (let i = 0; i <= isOutlier.length; i++) {
			const out = i >= isOutlier.length || isOutlier[i];
			if (!out && start === -1) start = i;
			if (out && start !== -1) { rawSegs.push({ startIdx: start, endIdx: i - 1 }); start = -1; }
		}
		// Extend gaps: trim points where the rendered (smoothed) line would clip
		// the chart top. The gap bookend starts exactly where the line goes out of range.
		const segs = rawSegs.map((seg) => {
			let { startIdx, endIdx } = seg;
			while (endIdx > startIdx && smoothData[endIdx] > yMax) endIdx--;
			while (startIdx < endIdx && smoothData[startIdx] > yMax) startIdx++;
			return { startIdx, endIdx };
		}).filter((seg) => seg.startIdx <= seg.endIdx);
		// Gaps between consecutive segments: x at end of seg N and start of seg N+1
		const gaps = segs.slice(0, -1).map((seg, i) => ({
			x1: toX(trimXData[seg.endIdx]),
			x2: toX(trimXData[segs[i + 1].startIdx]),
		}));
		// Any index not covered by a trimmed segment is considered paused
		const isPaused = trimData.map((_, i) =>
			!segs.some((seg) => i >= seg.startIdx && i <= seg.endIdx),
		);
		return { isOutlier, segs, gaps, isPaused };
	});

	let zoneBands = $derived.by(() => {
		if (!zones || !zoneMetric) return [];
		return zones.map((z) => {
			const lo = zoneMetric === 'pace' ? z.paceMin : z.hrMin;
			const hi = zoneMetric === 'pace' ? z.paceMax : z.hrMax;
			const rawLo = lo ?? yMin;
			const rawHi = hi ?? yMax;
			const y1 = Math.min(toY(rawLo), toY(rawHi));
			const y2 = Math.max(toY(rawLo), toY(rawHi));
			const bandY = Math.max(y1, PAD_TOP);
			const bandH = Math.min(y2, PAD_TOP + chartH) - bandY;
			return { color: z.color, y: bandY, h: Math.max(0, bandH) };
		});
	});

	let crosshairX = $derived(
		crosshairIndex != null && trimXData[crosshairIndex] != null
			? toX(trimXData[crosshairIndex])
			: null,
	);

	let crosshairY = $derived(
		crosshairIndex != null && smoothData[crosshairIndex] != null
			? toY(smoothData[crosshairIndex])
			: null,
	);

	let crosshairXLabel = $derived.by(() => {
		if (crosshairIndex == null || trimXData[crosshairIndex] == null) return null;
		const v = trimXData[crosshairIndex];
		return xAxis === 'distance'
			? units === 'imperial'
				? `${(v / 1609.34).toFixed(2)} mi`
				: `${(v / 1000).toFixed(2)} km`
			: `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
	});

	let tooltipValue = $derived(crosshairIndex != null ? trimData[crosshairIndex] : null);
	let tooltipPaused = $derived(
		showPauseGaps && crosshairIndex != null && (pauseResult?.isPaused[crosshairIndex] ?? false)
	);

	let xLabels = $derived.by(() => {
		if (trimXData.length < 2) return [];
		const indices = [0, Math.floor(trimXData.length / 2), trimXData.length - 1];
		return indices.map((i) => ({
			x: toX(trimXData[i]),
			label:
				xAxis === 'distance'
					? units === 'imperial'
						? `${(trimXData[i] / 1609.34).toFixed(1)} mi`
						: `${(trimXData[i] / 1000).toFixed(1)} km`
					: `${Math.floor(trimXData[i] / 60)}m`,
		}));
	});

	let yLabels = $derived.by(() => {
		const mid = (yMin + yMax) / 2;
		return [
			{ value: yMax, y: toY(yMax) },
			{ value: mid,  y: toY(mid)  },
			{ value: yMin, y: toY(yMin) },
		];
	});

	function handleMouseMove(e: MouseEvent) {
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		let closest = 0;
		let minDist = Infinity;
		for (let i = 0; i < trimXData.length; i++) {
			const d = Math.abs(toX(trimXData[i]) - mouseX);
			if (d < minDist) {
				minDist = d;
				closest = i;
			}
		}
		oncrosshairmove?.(closest);
	}

	function handleMouseLeave() {
		oncrosshairmove?.(null);
	}

	const clipId = `chart-clip-${Math.random().toString(36).slice(2)}`;
</script>

<div class="mb-6">
	<div class="flex items-baseline justify-between mb-1.5">
		<span class="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>
		{#if tooltipPaused}
			<span class="font-mono text-xs text-zinc-400 tracking-widest uppercase">paused</span>
		{:else if tooltipValue != null}
			<span class="font-mono text-xs text-zinc-700" style="font-variant-numeric: tabular-nums;">
				{fmt(tooltipValue)}
			</span>
		{:else}
			<span class="font-mono text-xs text-zinc-400" style="font-variant-numeric: tabular-nums;">
				{fmt(yMin)}–{fmt(yMax)}
			</span>
		{/if}
	</div>

	<svg
		bind:this={svgEl}
		width="100%"
		viewBox="0 0 {svgWidth} {CHART_H}"
		style="height: {CHART_H}px; display: block;"
		role="img"
		aria-label="{label} chart"
		onmousemove={handleMouseMove}
		onmouseleave={handleMouseLeave}
	>
		<defs>
			<clipPath id={clipId}>
				<rect x={PAD_LEFT} y={PAD_TOP} width={chartW} height={chartH} />
			</clipPath>
		</defs>

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
			>{fmt(lbl.value)}</text>
		{/each}

		{#each zoneBands as band}
			<rect
				x={PAD_LEFT}
				y={band.y}
				width={chartW}
				height={band.h}
				fill={band.color}
				fill-opacity="0.14"
			/>
		{/each}

		{#if showPauseGaps && pauseResult}
			{#each pauseResult.segs as seg}
				<polyline
					points={smoothData.slice(seg.startIdx, seg.endIdx + 1).map((v, j) => `${toX(trimXData[seg.startIdx + j])},${toY(v)}`).join(' ')}
					fill="none"
					stroke={color}
					stroke-width="1.5"
					stroke-linejoin="round"
					stroke-linecap="round"
					clip-path="url(#{clipId})"
				/>
			{/each}
			{#each pauseResult.gaps as gap}
				<line x1={gap.x1} y1={PAD_TOP} x2={gap.x1} y2={PAD_TOP + chartH}
					stroke="#d4d4d8" stroke-width="1.5" stroke-dasharray="3,3" />
				<line x1={gap.x2} y1={PAD_TOP} x2={gap.x2} y2={PAD_TOP + chartH}
					stroke="#d4d4d8" stroke-width="1.5" stroke-dasharray="3,3" />
			{/each}
		{:else}
			<polyline
				points={smoothData.map((v, i) => `${toX(trimXData[i])},${toY(v)}`).join(' ')}
				fill="none"
				stroke={color}
				stroke-width="1.5"
				stroke-linejoin="round"
				stroke-linecap="round"
				clip-path="url(#{clipId})"
			/>
		{/if}

		{#if crosshairX != null && crosshairY != null}
			<!-- Vertical line -->
			<line
				x1={crosshairX}
				y1={PAD_TOP}
				x2={crosshairX}
				y2={PAD_TOP + chartH}
				stroke="#a1a1aa"
				stroke-width="1"
				stroke-dasharray="3,2"
			/>
			<!-- Horizontal line + Y label -->
			{#if !tooltipPaused}
				<line
					x1={PAD_LEFT}
					y1={crosshairY}
					x2={PAD_LEFT + chartW}
					y2={crosshairY}
					stroke="#a1a1aa"
					stroke-width="1"
					stroke-dasharray="3,2"
				/>
				{#if tooltipValue != null}
					{@const labelText = fmt(tooltipValue)}
					{@const labelW = labelText.length * 5.5 + 8}
					<foreignObject x={PAD_LEFT - labelW - 2} y={crosshairY - 7} width={labelW} height={13}>
						<div style="width:100%;height:100%;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);background:rgba(255,255,255,0.5);border-radius:2px;"></div>
					</foreignObject>
					<text
						x={PAD_LEFT - 6}
						y={crosshairY + 3}
						text-anchor="end"
						fill="#3f3f46"
						font-size="9"
						font-weight="500"
						font-family="'Geist Mono', monospace"
					>{labelText}</text>
				{/if}
			{/if}
			<!-- X label -->
			{#if crosshairXLabel != null}
				{@const lw = crosshairXLabel.length * 5.5 + 8}
				{@const lx = Math.min(Math.max(crosshairX, PAD_LEFT + lw / 2), PAD_LEFT + chartW - lw / 2)}
				<foreignObject x={lx - lw / 2} y={CHART_H - 16} width={lw} height={13}>
					<div style="width:100%;height:100%;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);background:rgba(255,255,255,0.5);border-radius:2px;"></div>
				</foreignObject>
				<text
					x={lx}
					y={CHART_H - 6}
					text-anchor="middle"
					fill="#3f3f46"
					font-size="9"
					font-weight="500"
					font-family="'Geist Mono', monospace"
				>{crosshairXLabel}</text>
			{/if}
		{/if}

		{#each xLabels as lbl, i}
			<text
				x={lbl.x}
				y={CHART_H - 4}
				text-anchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
				fill="#a1a1aa"
				font-size="9"
				font-family="'Geist Mono', monospace"
			>
				{lbl.label}
			</text>
		{/each}
	</svg>
</div>
