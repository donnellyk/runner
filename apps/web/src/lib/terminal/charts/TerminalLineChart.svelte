<script lang="ts">
    import type { ZoneDefinition } from "@web-runner/shared";
    import type { Units } from "$lib/format";
    import {
        smoothStream,
        computeYBounds,
        computePauseSegments,
        formatXLabel,
        formatXLabelShort,
    } from "../shared/axes";
    import {
        trimChartData,
        TERM_PAD,
    } from "../shared/chart-utils";
    import {
        computeHorizontalStats,
        computeVerticalStats,
        type SelectionStats,
    } from "../shared/selection-stats";
    import { createChartDimensions } from "../shared/chart-dimensions.svelte";
    import { createChartInteraction } from "../shared/chart-interaction.svelte";
    import { computeZoneDotGrid } from "../shared/zone-dots";
    import ChartShell from "./ChartShell.svelte";
    import YGridLines from "./YGridLines.svelte";
    import XAxisLabels from "./XAxisLabels.svelte";
    import CrosshairLine from "./CrosshairLine.svelte";
    import CrosshairXBadge from "./CrosshairXBadge.svelte";
    import CrosshairYBadge from "./CrosshairYBadge.svelte";
    import SelectionOverlay from "./SelectionOverlay.svelte";
    import RefLines from "./RefLines.svelte";
    import ChartOverlay from "./ChartOverlay.svelte";

    interface Props {
        data: number[];
        distanceData?: number[];
        timeData?: number[];
        xAxis?: "distance" | "time";
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
        zoneMetric?: "pace" | "heartrate";
        crosshairIndex?: number | null;
        crosshairLocked?: boolean;
        highlightRange?: { start: number; end: number } | null;
        oncrosshairmove?: (index: number | null) => void;
        oncrosshairclick?: (index: number | null) => void;
        oncrosshairleave?: () => void;
        showZones?: boolean;
        filled?: boolean;
    }

    let {
        data,
        distanceData,
        timeData,
        xAxis = "distance",
        units = "metric",
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
        crosshairLocked = false,
        highlightRange = null,
        oncrosshairmove,
        oncrosshairclick,
        oncrosshairleave,
        showZones = true,
        filled = false,
    }: Props = $props();

    const lineGlow = 3;
    const glowOpacity = 0.4;

    const dims = createChartDimensions(TERM_PAD);
    const P = TERM_PAD;

    // --- Reference lines ---

    interface RefLine {
        value: number;
        label: string;
    }

    let refLines = $state<RefLine[]>([]);
    let draggingRefIdx = $state<number | null>(null);

    let crosshairRefMatch = $derived.by(() => {
        if (tooltipValue == null || !crosshairLocked) return -1;
        return refLines.findIndex(
            (r) => Math.abs(r.value - tooltipValue!) < yRange * 0.005,
        );
    });

    function addRefLine() {
        if (tooltipValue == null) return;
        refLines = [
            ...refLines,
            { value: tooltipValue, label: fmtShort(tooltipValue) },
        ];
    }

    function removeRefLine(index: number) {
        refLines = refLines.filter((_, i) => i !== index);
    }

    // --- Formatting ---

    function fmt(v: number): string {
        return formatValue ? formatValue(v) : `${v.toFixed(0)}${unit}`;
    }

    function fmtShort(v: number): string {
        if (formatValue) {
            return formatValue(v).replace(/\s*\/\w+$/, "");
        }
        return v.toFixed(0);
    }

    // --- Chart data ---

    let xData = $derived(
        xAxis === "distance" && distanceData
            ? distanceData
            : (timeData ?? data.map((_, i) => i)),
    );

    let trimmed = $derived(trimChartData(data, xData, pausedMask));
    let startIdx = $derived(trimmed.startIdx);
    let trimData = $derived(trimmed.trimData);
    let trimXData = $derived(trimmed.trimXData);
    let trimPausedMask = $derived(trimmed.trimPausedMask);

    let xMin = $derived(trimXData[0] ?? 0);
    let xMax = $derived(trimXData[trimXData.length - 1] ?? 1);
    let xRange = $derived(xMax - xMin || 1);

    function toX(xVal: number): number {
        return P.left + ((xVal - xMin) / xRange) * dims.chartW;
    }

    let smoothData = $derived(
        smoothStream(trimData, smoothingWindow, trimPausedMask),
    );

    let yBounds = $derived(computeYBounds(smoothData, trimPausedMask));
    let yMin = $derived(yBounds.yMin);
    let yMax = $derived(yBounds.yMax);
    let yRange = $derived(yMax - yMin || 1);

    function toY(yVal: number): number {
        const t = (yVal - yMin) / yRange;
        return invertY ? P.top + t * dims.chartH : P.top + dims.chartH - t * dims.chartH;
    }

    function fromY(px: number): number {
        const t = invertY
            ? (px - P.top) / dims.chartH
            : (P.top + dims.chartH - px) / dims.chartH;
        return yMin + t * yRange;
    }

    // --- Pause segments ---

    let pauseResult = $derived.by(() => {
        if (!trimPausedMask) return null;
        const { segs } = computePauseSegments(trimPausedMask);
        const gaps = segs.slice(0, -1).map((seg, i) => ({
            x1: toX(trimXData[seg.endIdx]),
            x2: toX(trimXData[segs[i + 1].startIdx]),
        }));
        return { segs, gaps };
    });

    // --- Zone dot grid ---

    let zoneDotGrid = $derived.by(() => {
        if (!zones || !zoneMetric || !showZones) return [];
        return computeZoneDotGrid({
            zones,
            zoneMetric,
            yMin,
            yMax,
            toY,
            padTop: P.top,
            padLeft: P.left,
            chartW: dims.chartW,
            chartH: dims.chartH,
        });
    });

    // --- Crosshair ---

    let xPositions = $derived(trimXData.map((x) => toX(x)));

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
        if (crosshairIndex == null || trimXData[crosshairIndex] == null)
            return null;
        return formatXLabel(trimXData[crosshairIndex], xAxis, units);
    });

    let tooltipValue = $derived(
        crosshairIndex != null ? smoothData[crosshairIndex] : null,
    );
    let tooltipPaused = $derived(
        crosshairIndex != null && (trimPausedMask?.[crosshairIndex] ?? false),
    );

    // --- Axis labels ---

    let xLabels = $derived.by(() => {
        if (trimXData.length < 2) return [];
        const indices = [
            0,
            Math.floor(trimXData.length / 2),
            trimXData.length - 1,
        ];
        return indices.map((i) => ({
            x: toX(trimXData[i]),
            label: formatXLabelShort(trimXData[i], xAxis, units),
        }));
    });

    let yLabels = $derived.by(() => {
        const steps = 5;
        const labels: { value: number; y: number }[] = [];
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            const value = invertY ? yMin + t * yRange : yMax - t * yRange;
            labels.push({ value, y: toY(value) });
        }
        return labels;
    });

    // --- Interaction state machine ---

    const interaction = createChartInteraction({
        dims,
        padding: P,
        getXPositions: () => xPositions,
        fromY,
        getDraggingRefIdx: () => draggingRefIdx,
        setDraggingRefIdx: (v) => { draggingRefIdx = v; },
        onRefLineDrag(value) {
            refLines = refLines.map((r, i) =>
                i === draggingRefIdx
                    ? { value, label: fmtShort(value) }
                    : r,
            );
        },
        onCrosshairMove(idx) { oncrosshairmove?.(idx); },
        onCrosshairClick(idx) { oncrosshairclick?.(idx); },
        onCrosshairLeave() { oncrosshairleave?.(); },
    });

    // --- Selection stats ---

    let selectionStats = $derived.by((): SelectionStats | null => {
        const sel = interaction.selection;
        if (!sel) return null;
        if (sel.mode === "horizontal") {
            return computeHorizontalStats(
                smoothData,
                trimXData,
                sel.startIdx,
                sel.endIdx,
                trimPausedMask,
            );
        }
        return computeVerticalStats(
            smoothData,
            sel.lowValue,
            sel.highValue,
            trimPausedMask,
        );
    });

    // --- Selection overlay geometry ---

    let selectionRect = $derived.by(
        (): {
            x: number;
            y: number;
            width: number;
            height: number;
        } | null => {
            const sel = interaction.selection;
            if (!sel) return null;
            if (sel.mode === "horizontal") {
                const x1 = toX(trimXData[sel.startIdx]);
                const x2 = toX(trimXData[sel.endIdx]);
                return {
                    x: x1,
                    y: P.top,
                    width: Math.max(1, x2 - x1),
                    height: dims.chartH,
                };
            }
            const y1 = toY(sel.highValue);
            const y2 = toY(sel.lowValue);
            const top = Math.min(y1, y2);
            const bottom = Math.max(y1, y2);
            return {
                x: P.left,
                y: top,
                width: dims.chartW,
                height: Math.max(1, bottom - top),
            };
        },
    );

    // --- Polyline + area ---

    let polylinePoints = $derived(
        smoothData.map((v, i) => `${toX(trimXData[i])},${toY(v)}`).join(" "),
    );

    let highlightPixels = $derived.by((): { x1: number; x2: number } | null => {
        if (!highlightRange || !distanceData) return null;
        const dist = startIdx > 0 ? distanceData.slice(startIdx) : distanceData;
        let si = 0,
            ei = dist.length - 1;
        for (let i = 0; i < dist.length; i++) {
            if (dist[i] >= highlightRange.start) {
                si = i;
                break;
            }
        }
        for (let i = dist.length - 1; i >= 0; i--) {
            if (dist[i] <= highlightRange.end) {
                ei = i;
                break;
            }
        }
        return { x1: toX(trimXData[si]), x2: toX(trimXData[ei]) };
    });

    let areaPath = $derived.by(() => {
        if (!filled || smoothData.length === 0) return "";
        const baseY = P.top + dims.chartH;
        let d = `M${toX(trimXData[0])},${baseY}`;
        for (let i = 0; i < smoothData.length; i++) {
            d += ` L${toX(trimXData[i])},${toY(smoothData[i])}`;
        }
        d += ` L${toX(trimXData[trimXData.length - 1])},${baseY} Z`;
        return d;
    });

    const uid = Math.random().toString(36).slice(2);
    const clipId = `term-clip-${uid}`;
    const glowId = `term-glow-${uid}`;

    // Svelte action for pointer-only drag inside aria-hidden SVG
    function refLineDrag(node: SVGElement, idx: number) {
        let currentIdx = idx;
        function onMouseDown(e: MouseEvent) {
            e.preventDefault();
            e.stopPropagation();
            draggingRefIdx = currentIdx;
        }
        node.addEventListener("mousedown", onMouseDown);
        return {
            update(newIdx: number) {
                currentIdx = newIdx;
            },
            destroy() {
                node.removeEventListener("mousedown", onMouseDown);
            },
        };
    }
</script>

<ChartShell
    {dims}
    label="{label} chart"
    cursorStyle={interaction.cursorStyle}
    onmousedown={interaction.handleMouseDown}
    onmousemove={interaction.handleMouseMove}
    onmouseup={interaction.handleMouseUp}
    onclick={interaction.handleClick}
    onmouseleave={interaction.handleMouseLeave}
    onkeydown={interaction.handleKeyDown}
>
    {#snippet header()}
        {#if tooltipPaused}
            <span style="color: var(--term-text-muted);">PAUSED</span>
        {:else if tooltipValue != null}
            {fmt(tooltipValue)}
        {:else}
            {fmt(yMin)}–{fmt(yMax)}
        {/if}
    {/snippet}

    {#snippet content()}
        <defs>
            <clipPath id={clipId}>
                <rect x={P.left} y={P.top} width={dims.chartW} height={dims.chartH} />
            </clipPath>
            {#if lineGlow > 0}
                <filter id={glowId}>
                    <feGaussianBlur
                        in="SourceGraphic"
                        stdDeviation={lineGlow}
                        result="blur"
                    />
                    <feComponentTransfer in="blur" result="dimBlur">
                        <feFuncA type="linear" slope={glowOpacity} />
                    </feComponentTransfer>
                    <feMerge>
                        <feMergeNode in="dimBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            {/if}
        </defs>

        <YGridLines
            labels={yLabels}
            formatLabel={fmtShort}
            padLeft={P.left}
            chartW={dims.chartW}
        />

        {#each zoneDotGrid as band, i (i)}
            {#each band.dots as dot, j (j)}
                <circle
                    cx={dot.cx}
                    cy={dot.cy}
                    r="1.25"
                    fill={band.color}
                    fill-opacity="0.35"
                />
            {/each}
        {/each}

        {#if highlightPixels}
            <rect
                x={highlightPixels.x1}
                y={P.top}
                width={Math.max(2, highlightPixels.x2 - highlightPixels.x1)}
                height={dims.chartH}
                fill="var(--term-text-bright)"
                fill-opacity="0.1"
            />
        {/if}

        {#if filled && areaPath}
            <path
                d={areaPath}
                fill={color}
                fill-opacity="0.15"
                clip-path="url(#{clipId})"
            />
        {/if}

        {#if showPauseGaps && pauseResult}
            {#each pauseResult.segs as seg, i (i)}
                <polyline
                    points={smoothData
                        .slice(seg.startIdx, seg.endIdx + 1)
                        .map(
                            (v, j) =>
                                `${toX(trimXData[seg.startIdx + j])},${toY(v)}`,
                        )
                        .join(" ")}
                    fill="none"
                    stroke={color}
                    stroke-width="1.5"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                    clip-path="url(#{clipId})"
                    filter={lineGlow > 0 ? `url(#${glowId})` : undefined}
                />
            {/each}
            {#each pauseResult.gaps as gap, i (i)}
                {@const mx = (gap.x1 + gap.x2) / 2}
                <line
                    x1={mx}
                    y1={P.top}
                    x2={mx}
                    y2={P.top + dims.chartH}
                    stroke="var(--term-border)"
                    stroke-width="1"
                    stroke-dasharray="3,3"
                />
            {/each}
        {:else}
            <polyline
                points={polylinePoints}
                fill="none"
                stroke={color}
                stroke-width="1.5"
                stroke-linejoin="round"
                stroke-linecap="round"
                clip-path="url(#{clipId})"
                filter={lineGlow > 0 ? `url(#${glowId})` : undefined}
            />
        {/if}

        {#if selectionRect && interaction.selection}
            <SelectionOverlay
                rect={selectionRect}
                mode={interaction.selection.mode}
                padTop={P.top}
                padLeft={P.left}
                chartW={dims.chartW}
                chartH={dims.chartH}
                clipPath="url(#{clipId})"
            />
        {/if}

        <RefLines
            {refLines}
            {toY}
            padTop={P.top}
            padLeft={P.left}
            chartW={dims.chartW}
            chartH={dims.chartH}
            {color}
            onremove={removeRefLine}
            {refLineDrag}
        />

        <CrosshairLine
            x={crosshairX}
            locked={crosshairLocked}
            padTop={P.top}
            chartH={dims.chartH}
            y={crosshairY != null && !tooltipPaused ? crosshairY : null}
            padLeft={P.left}
            chartW={dims.chartW}
        />

        {#if crosshairX != null && crosshairY != null && !tooltipPaused && tooltipValue != null}
            <CrosshairYBadge
                y={crosshairY}
                padLeft={P.left}
                chartW={dims.chartW}
                {color}
                label={fmtShort(tooltipValue)}
                locked={crosshairLocked}
                isExistingRef={crosshairRefMatch >= 0}
                onaddref={addRefLine}
                onremoveref={() => removeRefLine(crosshairRefMatch)}
            />
        {/if}

        <XAxisLabels labels={xLabels} svgHeight={dims.svgHeight} />

        {#if crosshairX != null && crosshairXLabel != null}
            <CrosshairXBadge
                x={crosshairX}
                label={crosshairXLabel}
                {color}
                padLeft={P.left}
                chartW={dims.chartW}
                svgHeight={dims.svgHeight}
            />
        {/if}
    {/snippet}

    {#snippet overlay()}
        {#if selectionStats && !interaction.dragOrigin}
            <ChartOverlay left={P.left + 2}>
                {#if selectionStats.mode === "horizontal"}
                    <div style="color: var(--term-text-muted); margin-bottom: 3px;">
                        {formatXLabel(selectionStats.xStart, xAxis, units)} – {formatXLabel(selectionStats.xEnd, xAxis, units)}
                    </div>
                    <div class="flex gap-4">
                        <div>
                            <span style="color: var(--term-text-muted);">Avg</span>
                            <span style="color: var(--term-text-bright);">{fmt(selectionStats.avg)}</span>
                        </div>
                        <div>
                            <span style="color: var(--term-text-muted);">Hi</span>
                            <span style="color: var(--term-text-bright);">{fmt(invertY ? selectionStats.min : selectionStats.max)}</span>
                        </div>
                        <div>
                            <span style="color: var(--term-text-muted);">Lo</span>
                            <span style="color: var(--term-text-bright);">{fmt(invertY ? selectionStats.max : selectionStats.min)}</span>
                        </div>
                    </div>
                {:else}
                    <div style="color: var(--term-text-muted); margin-bottom: 3px;">
                        {fmt(selectionStats.lowValue)} – {fmt(selectionStats.highValue)}
                    </div>
                    <div class="flex gap-4">
                        <div>
                            <span style="color: var(--term-text-muted);">Pts</span>
                            <span style="color: var(--term-text-bright);">{selectionStats.points}</span>
                        </div>
                        <div>
                            <span style="color: var(--term-text-muted);">of</span>
                            <span style="color: var(--term-text-bright);">{selectionStats.totalPoints}</span>
                        </div>
                        <div>
                            <span style="color: var(--term-text-bright);">{selectionStats.pct.toFixed(1)}%</span>
                        </div>
                    </div>
                {/if}
            </ChartOverlay>
        {/if}
    {/snippet}
</ChartShell>
