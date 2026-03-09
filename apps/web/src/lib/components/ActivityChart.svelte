<script lang="ts">
	import type { ZoneDefinition } from '@web-runner/shared';
	import { type Units, MI_TO_M } from '$lib/format';
	import { findIndexAtDistance } from '$lib/streams';

	interface ActivityNoteRef {
		id: number;
		distanceStart: number;
		distanceEnd: number | null;
		content: string;
	}

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
		pausedMask?: boolean[];
		showPauseGaps?: boolean;
		invertY?: boolean;
		smoothingWindow?: number;
		notes?: ActivityNoteRef[];
		showNotes?: boolean;
		highlightedNoteId?: number | null;
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
		pausedMask,
		showPauseGaps = true,
		invertY = false,
		smoothingWindow = 5,
		notes,
		showNotes = true,
		highlightedNoteId = null,
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

	const CHART_H = 240;
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
	let trimPausedMask = $derived(
		pausedMask ? (startIdx > 0 ? pausedMask.slice(startIdx) : pausedMask) : null,
	);

	let xMin = $derived(trimXData[0] ?? 0);
	let xMax = $derived(trimXData[trimXData.length - 1] ?? 1);

	function toX(xVal: number): number {
		return PAD_LEFT + ((xVal - xMin) / (xMax - xMin)) * chartW;
	}

	// Moving average — skips paused points so they don't bleed into transitions
	let smoothData = $derived.by(() => {
		if (smoothingWindow === 0) return trimData.slice();
		const w = smoothingWindow;
		const mask = trimPausedMask;
		return trimData.map((_, i) => {
			const lo = Math.max(0, i - w);
			const hi = Math.min(trimData.length - 1, i + w);
			let sum = 0, count = 0;
			for (let j = lo; j <= hi; j++) {
				if (!mask || !mask[j]) {
					sum += trimData[j];
					count++;
				}
			}
			return count > 0 ? sum / count : trimData[i];
		});
	});

	let yBounds = $derived.by(() => {
		if (trimPausedMask) {
			// Restrict y-axis to non-paused smoothed values only
			const vals = smoothData.filter((v, i) => v > 0 && !trimPausedMask![i]);
			if (vals.length === 0) return { yMin: 0, yMax: 1 };
			const lo = Math.min(...vals);
			const hi = Math.max(...vals);
			const pad = Math.max((hi - lo) * 0.05, 5);
			return { yMin: Math.max(0, lo - pad), yMax: hi + pad };
		}
		const vals = trimData.filter((v) => v > 0);
		if (vals.length === 0) return { yMin: 0, yMax: 1 };
		return { yMin: Math.min(...vals), yMax: Math.max(...vals) };
	});
	let yMin = $derived(yBounds.yMin);
	let yMax = $derived(yBounds.yMax);
	let yRange = $derived(yMax - yMin || 1);

	function toY(yVal: number): number {
		const t = (yVal - yMin) / yRange;
		return invertY
			? PAD_TOP + t * chartH               // higher value → lower on screen (fast pace at top)
			: PAD_TOP + chartH - t * chartH;     // higher value → higher on screen (default)
	}

	// Pause gap rendering — derived from trimPausedMask when provided
	let pauseResult = $derived.by(() => {
		if (!trimPausedMask) return null;
		const rawSegs: { startIdx: number; endIdx: number }[] = [];
		let start = -1;
		for (let i = 0; i <= trimPausedMask.length; i++) {
			const paused = i >= trimPausedMask.length || trimPausedMask[i];
			if (!paused && start === -1) start = i;
			if (paused && start !== -1) {
				rawSegs.push({ startIdx: start, endIdx: i - 1 });
				start = -1;
			}
		}
		const segs = rawSegs.filter((seg) => seg.startIdx <= seg.endIdx);
		const gaps = segs.slice(0, -1).map((seg, i) => ({
			x1: toX(trimXData[seg.endIdx]),
			x2: toX(trimXData[segs[i + 1].startIdx]),
		}));
		return { segs, gaps };
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
				? `${(v / MI_TO_M).toFixed(2)} mi`
				: `${(v / 1000).toFixed(2)} km`
			: `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
	});

	// Use smoothed value so label matches the rendered line
	let tooltipValue = $derived(crosshairIndex != null ? smoothData[crosshairIndex] : null);
	let tooltipPaused = $derived(
		crosshairIndex != null && (trimPausedMask?.[crosshairIndex] ?? false),
	);

	let xLabels = $derived.by(() => {
		if (trimXData.length < 2) return [];
		const indices = [0, Math.floor(trimXData.length / 2), trimXData.length - 1];
		return indices.map((i) => ({
			x: toX(trimXData[i]),
			label:
				xAxis === 'distance'
					? units === 'imperial'
						? `${(trimXData[i] / MI_TO_M).toFixed(1)} mi`
						: `${(trimXData[i] / 1000).toFixed(1)} km`
					: `${Math.floor(trimXData[i] / 60)}m`,
		}));
	});

	let yLabels = $derived.by(() => {
		const mid = (yMin + yMax) / 2;
		// When inverted, yMin (fastest pace) is at top — label order stays visually top→bottom
		const top    = invertY ? yMin : yMax;
		const bottom = invertY ? yMax : yMin;
		return [
			{ value: top,    y: toY(top)    },
			{ value: mid,    y: toY(mid)    },
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

	function noteToX(note: ActivityNoteRef, which: 'start' | 'end'): number | null {
		const dist = which === 'start' ? note.distanceStart : note.distanceEnd;
		if (dist == null || !distanceData) return null;
		if (xAxis === 'distance') return toX(dist);
		if (!timeData) return null;
		const idx = findIndexAtDistance(distanceData, dist);
		const time = timeData[idx];
		return time != null ? toX(time) : null;
	}

	let activeNote = $derived.by(() => {
		if (!notes || !showNotes || crosshairIndex == null) return null;
		let dist: number;
		if (xAxis === 'distance' && distanceData) {
			dist = trimXData[crosshairIndex];
		} else if (distanceData) {
			const origIdx = crosshairIndex + (startIdx > 0 ? startIdx : 0);
			dist = distanceData[origIdx] ?? 0;
		} else {
			return null;
		}
		const tolerance = distanceData
			? (distanceData[distanceData.length - 1] - distanceData[0]) * 0.01
			: 0;
		return notes.find(n =>
			n.distanceEnd
				? dist >= n.distanceStart && dist <= n.distanceEnd
				: Math.abs(dist - n.distanceStart) < tolerance
		) ?? null;
	});

	const clipId = `chart-clip-${Math.random().toString(36).slice(2)}`;
</script>

<div class="mb-6">
	<div class="flex items-baseline justify-between mb-1.5 gap-2">
		<span class="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>
		<div class="flex items-baseline gap-2 min-w-0">
			{#if activeNote}
				<span class="text-xs text-amber-600 truncate max-w-48">{activeNote.content}</span>
			{/if}
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

		{#if showNotes && notes}
			{#each notes as note (note.id)}
				{@const nx = noteToX(note, 'start')}
				{#if nx != null}
					{#if note.distanceEnd == null}
						<line
							x1={nx} y1={PAD_TOP} x2={nx} y2={PAD_TOP + chartH}
							stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3"
							opacity={highlightedNoteId === note.id ? 1 : 0.6}
							clip-path="url(#{clipId})"
						/>
						<polygon
							points="{nx},{PAD_TOP + 2} {nx + 4},{PAD_TOP + 6} {nx},{PAD_TOP + 10} {nx - 4},{PAD_TOP + 6}"
							fill="#f59e0b"
							opacity={highlightedNoteId === note.id ? 1 : 0.7}
						/>
					{:else}
						{@const nx2 = noteToX(note, 'end')}
						{#if nx2 != null}
							<rect
								x={Math.min(nx, nx2)} y={PAD_TOP}
								width={Math.abs(nx2 - nx)} height={chartH}
								fill="#f59e0b"
								fill-opacity={highlightedNoteId === note.id ? 0.2 : 0.1}
								clip-path="url(#{clipId})"
							/>
							<line x1={nx} y1={PAD_TOP} x2={nx} y2={PAD_TOP + chartH}
								stroke="#f59e0b" stroke-width="1" opacity="0.4"
								clip-path="url(#{clipId})" />
							<line x1={nx2} y1={PAD_TOP} x2={nx2} y2={PAD_TOP + chartH}
								stroke="#f59e0b" stroke-width="1" opacity="0.4"
								clip-path="url(#{clipId})" />
						{/if}
					{/if}
				{/if}
			{/each}
		{/if}

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
				{#if xAxis === 'time'}
					<line x1={gap.x1} y1={PAD_TOP} x2={gap.x1} y2={PAD_TOP + chartH}
						stroke="#d4d4d8" stroke-width="1.5" stroke-dasharray="3,3" />
					<line x1={gap.x2} y1={PAD_TOP} x2={gap.x2} y2={PAD_TOP + chartH}
						stroke="#d4d4d8" stroke-width="1.5" stroke-dasharray="3,3" />
				{:else}
					{@const mx = (gap.x1 + gap.x2) / 2}
					<line x1={mx} y1={PAD_TOP} x2={mx} y2={PAD_TOP + chartH}
						stroke="#d4d4d8" stroke-width="1.5" stroke-dasharray="3,3" />
				{/if}
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
	{#if zones && zones.length > 0}
		<div class="flex items-center justify-end gap-3 mt-1" style="padding-left: {PAD_LEFT}px;">
			{#each zones as zone}
				<div class="flex items-center gap-1">
					<span class="inline-block w-1.5 h-1.5 rounded-full" style="background: {zone.color};"></span>
					<span class="text-[9px] text-zinc-400" style="font-family: 'Geist Mono', monospace;">{zone.name}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>
