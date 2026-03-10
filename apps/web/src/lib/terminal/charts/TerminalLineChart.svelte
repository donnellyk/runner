<script lang="ts">
	import type { ZoneDefinition } from '@web-runner/shared';
	import type { Units } from '$lib/format';
	import { smoothStream, computeYBounds, trimLeadingZeros, computePauseSegments, formatXLabel, formatXLabelShort } from '../shared/axes';

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
		pausedMask?: boolean[];
		showPauseGaps?: boolean;
		invertY?: boolean;
		smoothingWindow?: number;
		zones?: ZoneDefinition[];
		zoneMetric?: 'pace' | 'heartrate';
		crosshairIndex?: number | null;
		oncrosshairmove?: (index: number | null) => void;
		showZones?: boolean;
		filled?: boolean;
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
		pausedMask,
		showPauseGaps = true,
		invertY = false,
		smoothingWindow = 2,
		zones,
		zoneMetric,
		crosshairIndex = null,
		oncrosshairmove,
		showZones = true,
		filled = false,
	}: Props = $props();

	function fmt(v: number): string {
		return formatValue ? formatValue(v) : `${v.toFixed(0)}${unit}`;
	}

	const PAD_TOP = 6;
	const PAD_BOTTOM = 18;
	const PAD_LEFT = 46;
	const PAD_RIGHT = 4;

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
	let trimPausedMask = $derived(
		pausedMask ? (startIdx > 0 ? pausedMask.slice(startIdx) : pausedMask) : null,
	);

	let xMin = $derived(trimXData[0] ?? 0);
	let xMax = $derived(trimXData[trimXData.length - 1] ?? 1);

	function toX(xVal: number): number {
		return PAD_LEFT + ((xVal - xMin) / (xMax - xMin)) * chartW;
	}

	let smoothData = $derived(smoothStream(trimData, smoothingWindow, trimPausedMask));

	let yBounds = $derived(computeYBounds(smoothData, trimPausedMask));
	let yMin = $derived(yBounds.yMin);
	let yMax = $derived(yBounds.yMax);
	let yRange = $derived(yMax - yMin || 1);

	function toY(yVal: number): number {
		const t = (yVal - yMin) / yRange;
		return invertY ? PAD_TOP + t * chartH : PAD_TOP + chartH - t * chartH;
	}

	let pauseResult = $derived.by(() => {
		if (!trimPausedMask) return null;
		const { segs } = computePauseSegments(trimPausedMask);
		const gaps = segs.slice(0, -1).map((seg, i) => ({
			x1: toX(trimXData[seg.endIdx]),
			x2: toX(trimXData[segs[i + 1].startIdx]),
		}));
		return { segs, gaps };
	});

	let zoneBands = $derived.by(() => {
		if (!zones || !zoneMetric || !showZones) return [];
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
			? toX(trimXData[crosshairIndex]) : null,
	);
	let crosshairY = $derived(
		crosshairIndex != null && smoothData[crosshairIndex] != null
			? toY(smoothData[crosshairIndex]) : null,
	);
	let crosshairXLabel = $derived.by(() => {
		if (crosshairIndex == null || trimXData[crosshairIndex] == null) return null;
		return formatXLabel(trimXData[crosshairIndex], xAxis, units);
	});

	let tooltipValue = $derived(crosshairIndex != null ? smoothData[crosshairIndex] : null);
	let tooltipPaused = $derived(
		crosshairIndex != null && (trimPausedMask?.[crosshairIndex] ?? false),
	);

	let xLabels = $derived.by(() => {
		if (trimXData.length < 2) return [];
		const indices = [0, Math.floor(trimXData.length / 2), trimXData.length - 1];
		return indices.map((i) => ({
			x: toX(trimXData[i]),
			label: formatXLabelShort(trimXData[i], xAxis, units),
		}));
	});

	let yLabels = $derived.by(() => {
		const mid = (yMin + yMax) / 2;
		const top = invertY ? yMin : yMax;
		const bottom = invertY ? yMax : yMin;
		return [
			{ value: top, y: toY(top) },
			{ value: mid, y: toY(mid) },
			{ value: bottom, y: toY(bottom) },
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
			if (d < minDist) { minDist = d; closest = i; }
		}
		oncrosshairmove?.(closest);
	}

	function handleMouseLeave() {
		oncrosshairmove?.(null);
	}

	let polylinePoints = $derived(
		smoothData.map((v, i) => `${toX(trimXData[i])},${toY(v)}`).join(' '),
	);

	let areaPath = $derived.by(() => {
		if (!filled || smoothData.length === 0) return '';
		const baseY = PAD_TOP + chartH;
		let d = `M${toX(trimXData[0])},${baseY}`;
		for (let i = 0; i < smoothData.length; i++) {
			d += ` L${toX(trimXData[i])},${toY(smoothData[i])}`;
		}
		d += ` L${toX(trimXData[trimXData.length - 1])},${baseY} Z`;
		return d;
	});

	const clipId = `term-clip-${Math.random().toString(36).slice(2)}`;
</script>

<div class="relative w-full h-full flex flex-col" style="min-height: 0;">
	<div class="flex items-baseline justify-between px-2 py-1 shrink-0">
		<span class="text-[10px] uppercase tracking-widest" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">{label}</span>
		<span class="text-[11px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums;">
			{#if tooltipPaused}
				<span style="color: var(--term-text-muted);">PAUSED</span>
			{:else if tooltipValue != null}
				{fmt(tooltipValue)}
			{:else}
				{fmt(yMin)}–{fmt(yMax)}
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
		aria-label="{label} chart"
		onmousemove={handleMouseMove}
		onmouseleave={handleMouseLeave}
	>
		<defs>
			<clipPath id={clipId}>
				<rect x={PAD_LEFT} y={PAD_TOP} width={chartW} height={chartH} />
			</clipPath>
		</defs>

		{#each yLabels as lbl, i (i)}
			<line x1={PAD_LEFT} y1={lbl.y} x2={PAD_LEFT + chartW} y2={lbl.y}
				stroke="var(--term-grid)" stroke-width="1" />
			<text x={PAD_LEFT - 4} y={lbl.y + 3} text-anchor="end"
				fill="var(--term-text-muted)" font-size="9" font-family="'Geist Mono', monospace"
			>{fmt(lbl.value)}</text>
		{/each}

		{#each zoneBands as band, i (i)}
			<rect x={PAD_LEFT} y={band.y} width={chartW} height={band.h}
				fill={band.color} fill-opacity="0.2" />
		{/each}

		{#if filled && areaPath}
			<path d={areaPath} fill={color} fill-opacity="0.15" clip-path="url(#{clipId})" />
		{/if}

		{#if showPauseGaps && pauseResult}
			{#each pauseResult.segs as seg, i (i)}
				<polyline
					points={smoothData.slice(seg.startIdx, seg.endIdx + 1).map((v, j) => `${toX(trimXData[seg.startIdx + j])},${toY(v)}`).join(' ')}
					fill="none" stroke={color} stroke-width="1.5"
					stroke-linejoin="round" stroke-linecap="round"
					clip-path="url(#{clipId})"
				/>
			{/each}
			{#each pauseResult.gaps as gap, i (i)}
				{@const mx = (gap.x1 + gap.x2) / 2}
				<line x1={mx} y1={PAD_TOP} x2={mx} y2={PAD_TOP + chartH}
					stroke="var(--term-border)" stroke-width="1" stroke-dasharray="3,3" />
			{/each}
		{:else}
			<polyline points={polylinePoints} fill="none" stroke={color}
				stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"
				clip-path="url(#{clipId})" />
		{/if}

		{#if crosshairX != null}
			<line x1={crosshairX} y1={PAD_TOP} x2={crosshairX} y2={PAD_TOP + chartH}
				stroke="var(--term-crosshair)" stroke-width="1" stroke-dasharray="3,2" />
			{#if crosshairY != null && !tooltipPaused}
				<line x1={PAD_LEFT} y1={crosshairY} x2={PAD_LEFT + chartW} y2={crosshairY}
					stroke="var(--term-crosshair)" stroke-width="1" stroke-dasharray="3,2" />
				{#if tooltipValue != null}
					{@const labelText = fmt(tooltipValue)}
					{@const labelW = labelText.length * 5.5 + 8}
					<rect x={PAD_LEFT - labelW - 2} y={crosshairY - 7} width={labelW} height={14}
						rx="2" fill="var(--term-crosshair-label-bg)" />
					<text x={PAD_LEFT - 4} y={crosshairY + 3} text-anchor="end"
						fill="var(--term-text-bright)" font-size="9" font-weight="500"
						font-family="'Geist Mono', monospace">{labelText}</text>
				{/if}
			{/if}
			{#if crosshairXLabel != null}
				{@const lw = crosshairXLabel.length * 5.5 + 8}
				{@const lx = Math.min(Math.max(crosshairX, PAD_LEFT + lw / 2), PAD_LEFT + chartW - lw / 2)}
				<rect x={lx - lw / 2} y={svgHeight - 16} width={lw} height={14}
					rx="2" fill="var(--term-crosshair-label-bg)" />
				<text x={lx} y={svgHeight - 5} text-anchor="middle"
					fill="var(--term-text-bright)" font-size="9" font-weight="500"
					font-family="'Geist Mono', monospace">{crosshairXLabel}</text>
			{/if}
		{/if}

		{#each xLabels as lbl, i (i)}
			<text x={lbl.x} y={svgHeight - 3}
				text-anchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
				fill="var(--term-text-muted)" font-size="9" font-family="'Geist Mono', monospace"
			>{lbl.label}</text>
		{/each}
	</svg>
</div>
