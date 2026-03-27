<script lang="ts">
    import type { ZoneDefinition } from "@web-runner/shared";
    import { findOverlayCrosshairIndex } from "../compare-state.svelte";
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
    import { formatYValue, formatYValueShort } from "../shared/chart-formatting";
    import { createYAxisScaling } from "../shared/chart-scaling";
    import { createWheelHandler } from "../shared/chart-gesture";
    import type { CrosshairCallbacks, ChartDataProps, ChartLabelProps } from "../shared/chart-props";
    import type { ChartZoom } from "../terminal-state.svelte";
    import type { OverlaySeries } from "../types";
    import ChartShell from "./ChartShell.svelte";
    import YGridLines from "./YGridLines.svelte";
    import XAxisLabels from "./XAxisLabels.svelte";
    import CrosshairLine from "./CrosshairLine.svelte";
    import CrosshairXBadge from "./CrosshairXBadge.svelte";
    import CrosshairYBadge from "./CrosshairYBadge.svelte";
    import SelectionOverlay from "./SelectionOverlay.svelte";
    import RefLines from "./RefLines.svelte";
    import ChartOverlay from "./ChartOverlay.svelte";

    interface Props extends ChartDataProps, ChartLabelProps, CrosshairCallbacks {
        data: number[];
        pausedMask?: boolean[];
        showPauseGaps?: boolean;
        invertY?: boolean;
        smoothingWindow?: number;
        zones?: ZoneDefinition[];
        zoneMetric?: "pace" | "heartrate";
        showZones?: boolean;
        planZones?: ZoneDefinition[];
        showPlanZones?: boolean;
        filled?: boolean;
        overlayData?: OverlaySeries[];
        zoom?: ChartZoom;
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
        planZones,
        showPlanZones = false,
        filled = false,
        overlayData,
        zoom,
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

    /** Prevent the browser's click event (fired after mouseup) from reaching chart-interaction */
    function swallowNextClick() {
        window.addEventListener("click", (e) => e.stopPropagation(), { capture: true, once: true });
    }

    // --- Badge drag (vertical adjust for ref lines) ---

    let badgeDragging = $state(false);
    let badgeDragY = $state<number | null>(null);

    function handleBadgeDrag(e: MouseEvent) {
        const startY = e.clientY;
        let didDrag = false;
        const wasExistingRef = crosshairRefMatch >= 0;
        const matchIdx = crosshairRefMatch;

        const handleMove = (moveE: MouseEvent) => {
            const dy = Math.abs(moveE.clientY - startY);
            if (!didDrag && dy < 3) return;
            if (!didDrag) document.body.style.cursor = "ns-resize";
            didDrag = true;
            badgeDragging = true;

            if (!dims.svgEl) return;
            const rect = dims.svgEl.getBoundingClientRect();
            const mouseY = moveE.clientY - rect.top;
            badgeDragY = Math.max(P.top, Math.min(P.top + dims.chartH, mouseY));
        };

        const handleUp = () => {
            document.body.style.cursor = "";
            if (didDrag && badgeDragY != null) {
                const value = fromY(badgeDragY);
                if (wasExistingRef) {
                    refLines = refLines.map((r, i) =>
                        i === matchIdx
                            ? { value, label: fmtShort(value) }
                            : r,
                    );
                } else {
                    refLines = [...refLines, { value, label: fmtShort(value) }];
                }
            } else {
                if (wasExistingRef) {
                    removeRefLine(matchIdx);
                } else {
                    addRefLine();
                }
            }
            badgeDragging = false;
            badgeDragY = null;
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
            swallowNextClick();
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
    }

    // --- Formatting ---

    function fmt(v: number): string {
        return formatYValue(v, unit, formatValue);
    }

    function fmtShort(v: number): string {
        return formatYValueShort(v, formatValue);
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

    let xBounds = $derived.by(() => {
        let min = trimXData[0] ?? 0;
        let max = trimXData[trimXData.length - 1] ?? 1;
        if (overlayData) {
            for (const o of overlayData) {
                if (o.xData.length > 0) {
                    const oMin = o.xData[0];
                    const oMax = o.xData[o.xData.length - 1];
                    if (oMin < min) min = oMin;
                    if (oMax > max) max = oMax;
                }
            }
        }
        return { min, max };
    });
    let xMin = $derived(xBounds.min);
    let xMax = $derived(xBounds.max);

    let visibleX = $derived.by(() => {
        if (!zoom || zoom.locked) return { min: xMin, max: xMax };
        return zoom.applyXRange(xMin, xMax);
    });
    let vxMin = $derived(visibleX.min);
    let vxMax = $derived(visibleX.max);
    let vxRange = $derived(vxMax - vxMin || 1);

    function toX(xVal: number): number {
        return P.left + ((xVal - vxMin) / vxRange) * dims.chartW;
    }

    let smoothData = $derived(
        smoothStream(trimData, smoothingWindow, trimPausedMask),
    );

    // Smooth overlay series
    let smoothedOverlays = $derived.by(() => {
        if (!overlayData || overlayData.length === 0) return [];
        return overlayData.map((o) => ({
            ...o,
            smoothed: smoothStream(o.data, smoothingWindow, null),
        }));
    });


    let yBounds = $derived.by(() => {
        const primary = computeYBounds(smoothData, trimPausedMask);
        if (smoothedOverlays.length === 0) return primary;
        let { yMin, yMax } = primary;
        for (const o of smoothedOverlays) {
            const ob = computeYBounds(o.smoothed, null);
            if (ob.yMin < yMin) yMin = ob.yMin;
            if (ob.yMax > yMax) yMax = ob.yMax;
        }
        return { yMin, yMax };
    });
    let yMin = $derived(yBounds.yMin);
    let yMax = $derived(yBounds.yMax);

    let visibleY = $derived.by(() => {
        if (!zoom || zoom.locked) return { min: yMin, max: yMax };
        return zoom.applyYRange(yMin, yMax);
    });
    let vyMin = $derived(visibleY.min);
    let vyMax = $derived(visibleY.max);
    let yRange = $derived(vyMax - vyMin || 1);

    let yScaling = $derived(createYAxisScaling(vyMin, vyMax, P.top, dims.chartH, invertY));

    function toY(yVal: number): number {
        return yScaling.toY(yVal);
    }

    function fromY(px: number): number {
        return yScaling.fromY(px);
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
            yMin: vyMin,
            yMax: vyMax,
            toY,
            padTop: P.top,
            padLeft: P.left,
            chartW: dims.chartW,
            chartH: dims.chartH,
        });
    });

    let planZoneDotGrid = $derived.by(() => {
        if (!planZones || !showPlanZones || !zoneMetric) return [];
        return computeZoneDotGrid({
            zones: planZones,
            zoneMetric: 'pace',
            yMin: vyMin,
            yMax: vyMax,
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

    // --- Overlay crosshairs & stacked badges ---

    let overlayCrosshairs = $derived.by(() => {
        if (crosshairIndex == null || smoothedOverlays.length === 0) return [];
        return smoothedOverlays.flatMap((overlay) => {
            const oIdx = findOverlayCrosshairIndex(trimXData, overlay.xData, crosshairIndex);
            if (oIdx == null) return [];
            const oVal = overlay.smoothed[oIdx];
            if (oVal == null) return [];
            return [{ y: toY(oVal), value: oVal, color: overlay.color, label: fmtShort(oVal) }];
        });
    });

    const BADGE_H = 20;
    const BADGE_MIN_GAP = 2;

    let stackedBadges = $derived.by(() => {
        if (crosshairX == null) return [];
        const badges: { y: number; stackedY: number; color: string; label: string; isPrimary: boolean }[] = [];

        if (crosshairY != null && !tooltipPaused && tooltipValue != null) {
            const effectiveY = badgeDragY ?? crosshairY;
            const effectiveValue = badgeDragY != null ? fromY(badgeDragY) : tooltipValue;
            badges.push({ y: effectiveY, stackedY: effectiveY, color, label: fmtShort(effectiveValue), isPrimary: true });
        }

        for (const oc of overlayCrosshairs) {
            badges.push({ y: oc.y, stackedY: oc.y, color: oc.color, label: oc.label, isPrimary: false });
        }

        if (badges.length < 2) return badges;

        // Sort by natural Y position, then nudge apart
        badges.sort((a, b) => a.y - b.y);
        for (let i = 1; i < badges.length; i++) {
            const minY = badges[i - 1].stackedY + BADGE_H + BADGE_MIN_GAP;
            if (badges[i].stackedY < minY) {
                badges[i].stackedY = minY;
            }
        }
        return badges;
    });

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
            const value = invertY ? vyMin + t * yRange : vyMax - t * yRange;
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

    // --- Wheel handler for zoom/pan ---

    let wheelHandler = $derived(zoom ? createWheelHandler(
        () => zoom,
        () => dims,
        P,
    ) : undefined);

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

    let overlaySelectionStats = $derived.by((): { color: string; label: string; stats: SelectionStats }[] => {
        const sel = interaction.selection;
        if (!sel || smoothedOverlays.length === 0) return [];
        return smoothedOverlays.flatMap((overlay) => {
            let stats: SelectionStats | null = null;
            if (sel.mode === "horizontal") {
                const xStart = trimXData[Math.min(sel.startIdx, sel.endIdx)];
                const xEnd = trimXData[Math.max(sel.startIdx, sel.endIdx)];
                if (xStart == null || xEnd == null) return [];
                let oStartIdx = 0;
                let oEndIdx = overlay.xData.length - 1;
                for (let i = 0; i < overlay.xData.length; i++) {
                    if (overlay.xData[i] >= xStart) { oStartIdx = i; break; }
                }
                for (let i = overlay.xData.length - 1; i >= 0; i--) {
                    if (overlay.xData[i] <= xEnd) { oEndIdx = i; break; }
                }
                stats = computeHorizontalStats(overlay.smoothed, overlay.xData, oStartIdx, oEndIdx, null);
            } else {
                stats = computeVerticalStats(overlay.smoothed, sel.lowValue, sel.highValue, null);
            }
            if (!stats) return [];
            return [{ color: overlay.color, label: overlay.label, stats }];
        });
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

    function handleRefMousedown(refIdx: number, e: MouseEvent) {
        const startY = e.clientY;
        let didDrag = false;

        const handleMove = (moveE: MouseEvent) => {
            const dy = Math.abs(moveE.clientY - startY);
            if (!didDrag && dy < 3) return;
            if (!didDrag) document.body.style.cursor = "ns-resize";
            didDrag = true;

            if (!dims.svgEl) return;
            const rect = dims.svgEl.getBoundingClientRect();
            const mouseY = moveE.clientY - rect.top;
            const clamped = Math.max(P.top, Math.min(P.top + dims.chartH, mouseY));
            const value = fromY(clamped);
            refLines = refLines.map((r, i) =>
                i === refIdx ? { value, label: fmtShort(value) } : r,
            );
        };

        const handleUp = () => {
            document.body.style.cursor = "";
            if (!didDrag) {
                removeRefLine(refIdx);
            }
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
            swallowNextClick();
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
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
    onwheel={wheelHandler}
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

        {#each planZoneDotGrid as band, i (i)}
            {#each band.dots as dot, j (j)}
                <circle
                    cx={dot.cx}
                    cy={dot.cy}
                    r="1.5"
                    fill="none"
                    stroke={band.color}
                    stroke-width="0.75"
                    stroke-opacity="0.5"
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

        {#each smoothedOverlays as overlay, oi (oi)}
            <polyline
                points={overlay.smoothed.map((v, i) => {
                    const xVal = overlay.xData[i] ?? overlay.xData[overlay.xData.length - 1];
                    return `${toX(xVal)},${toY(v)}`;
                }).join(" ")}
                fill="none"
                stroke={overlay.color}
                stroke-width="1.5"
                stroke-linejoin="round"
                stroke-linecap="round"
                clip-path="url(#{clipId})"
                filter={lineGlow > 0 ? `url(#${glowId})` : undefined}
            />
        {/each}

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
            color={color}
            onrefmousedown={handleRefMousedown}
        />

        <CrosshairLine
            x={crosshairX}
            locked={crosshairLocked}
            padTop={P.top}
            chartH={dims.chartH}
            y={badgeDragY ?? (crosshairY != null && !tooltipPaused ? crosshairY : null)}
            padLeft={P.left}
            chartW={dims.chartW}
        />

        {#each overlayCrosshairs as oc (oc.color)}
            {#if crosshairX != null}
                <line
                    x1={P.left}
                    y1={oc.y}
                    x2={P.left + dims.chartW}
                    y2={oc.y}
                    stroke="var(--term-crosshair)"
                    stroke-width="1"
                    stroke-dasharray="3,2"
                />
            {/if}
        {/each}

        {#each stackedBadges as badge, bi (bi)}
            {#if badge.isPrimary}
                <CrosshairYBadge
                    y={badge.stackedY}
                    padLeft={P.left}
                    chartW={dims.chartW}
                    color={badge.color}
                    label={badge.label}
                    locked={crosshairLocked}
                    isExistingRef={crosshairRefMatch >= 0}
                    dragging={badgeDragging}
                    onbadgemousedown={handleBadgeDrag}
                />
            {:else}
                <CrosshairYBadge
                    y={badge.stackedY}
                    padLeft={P.left}
                    chartW={dims.chartW}
                    color={badge.color}
                    label={badge.label}
                    locked={false}
                    isExistingRef={false}
                    dragging={false}
                />
            {/if}
        {/each}

        <XAxisLabels labels={xLabels} svgHeight={dims.svgHeight} />

        {#if crosshairX != null && crosshairXLabel != null}
            <CrosshairXBadge
                x={crosshairX}
                label={crosshairXLabel}
                color={color}
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
                    <div class="flex gap-4" style={overlaySelectionStats.length > 0 ? `color: ${color};` : ''}>
                        <div>
                            <span style="color: var(--term-text-muted);">Avg</span>
                            <span style={overlaySelectionStats.length > 0 ? '' : 'color: var(--term-text-bright);'}>{fmt(selectionStats.avg)}</span>
                        </div>
                        <div>
                            <span style="color: var(--term-text-muted);">Hi</span>
                            <span style={overlaySelectionStats.length > 0 ? '' : 'color: var(--term-text-bright);'}>{fmt(invertY ? selectionStats.min : selectionStats.max)}</span>
                        </div>
                        <div>
                            <span style="color: var(--term-text-muted);">Lo</span>
                            <span style={overlaySelectionStats.length > 0 ? '' : 'color: var(--term-text-bright);'}>{fmt(invertY ? selectionStats.max : selectionStats.min)}</span>
                        </div>
                    </div>
                    {#each overlaySelectionStats as os (os.color)}
                        {#if os.stats.mode === "horizontal"}
                            <div class="flex gap-4" style="color: {os.color}; margin-top: 2px;">
                                <div>
                                    <span style="color: var(--term-text-muted);">Avg</span>
                                    <span>{fmt(os.stats.avg)}</span>
                                </div>
                                <div>
                                    <span style="color: var(--term-text-muted);">Hi</span>
                                    <span>{fmt(invertY ? os.stats.min : os.stats.max)}</span>
                                </div>
                                <div>
                                    <span style="color: var(--term-text-muted);">Lo</span>
                                    <span>{fmt(invertY ? os.stats.max : os.stats.min)}</span>
                                </div>
                            </div>
                        {/if}
                    {/each}
                {:else}
                    <div style="color: var(--term-text-muted); margin-bottom: 3px;">
                        {fmt(selectionStats.lowValue)} – {fmt(selectionStats.highValue)}
                    </div>
                    <div class="flex gap-4" style={overlaySelectionStats.length > 0 ? `color: ${color};` : ''}>
                        <div>
                            <span style="color: var(--term-text-muted);">Pts</span>
                            <span style={overlaySelectionStats.length > 0 ? '' : 'color: var(--term-text-bright);'}>{selectionStats.points}</span>
                        </div>
                        <div>
                            <span style="color: var(--term-text-muted);">of</span>
                            <span style={overlaySelectionStats.length > 0 ? '' : 'color: var(--term-text-bright);'}>{selectionStats.totalPoints}</span>
                        </div>
                        <div>
                            <span style={overlaySelectionStats.length > 0 ? '' : 'color: var(--term-text-bright);'}>{selectionStats.pct.toFixed(1)}%</span>
                        </div>
                    </div>
                    {#each overlaySelectionStats as os (os.color)}
                        {#if os.stats.mode === "vertical"}
                            <div class="flex gap-4" style="color: {os.color}; margin-top: 2px;">
                                <div>
                                    <span style="color: var(--term-text-muted);">Pts</span>
                                    <span>{os.stats.points}</span>
                                </div>
                                <div>
                                    <span style="color: var(--term-text-muted);">of</span>
                                    <span>{os.stats.totalPoints}</span>
                                </div>
                                <div>
                                    <span>{os.stats.pct.toFixed(1)}%</span>
                                </div>
                            </div>
                        {/if}
                    {/each}
                {/if}
            </ChartOverlay>
        {/if}
    {/snippet}
</ChartShell>
