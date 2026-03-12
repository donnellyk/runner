<script lang="ts">
    import type { ZoneDefinition } from "@web-runner/shared";
    import type { Units } from "$lib/format";
    import {
        smoothStream,
        computeYBounds,
        trimLeadingZeros,
        computePauseSegments,
        formatXLabel,
        formatXLabelShort,
    } from "../shared/axes";
    import { findClosestIndex, TERM_PAD } from "../shared/chart-utils";
    import {
        computeHorizontalStats,
        computeVerticalStats,
        type Selection,
        type SelectionStats,
    } from "../shared/selection-stats";

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
        lineGlow?: number;
        glowOpacity?: number;
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
        lineGlow = 3,
        glowOpacity = 0.4,
    }: Props = $props();

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

    // --- Region selection ---

    const DRAG_THRESHOLD = 5;

    let dragOrigin = $state<{
        clientX: number;
        clientY: number;
        svgX: number;
        svgY: number;
    } | null>(null);
    let dragMode = $state<"horizontal" | "vertical" | null>(null);
    let selection = $state<Selection | null>(null);
    let justFinishedDrag = $state(false);

    let selectionStats = $derived.by((): SelectionStats | null => {
        if (!selection) return null;
        if (selection.mode === "horizontal") {
            return computeHorizontalStats(
                smoothData,
                trimXData,
                selection.startIdx,
                selection.endIdx,
                trimPausedMask,
            );
        }
        return computeVerticalStats(
            smoothData,
            selection.lowValue,
            selection.highValue,
            trimPausedMask,
        );
    });

    function clearSelection() {
        selection = null;
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

    // --- Chart geometry ---

    const PAD_TOP = TERM_PAD.top;
    const PAD_BOTTOM = TERM_PAD.bottom;
    const PAD_LEFT = TERM_PAD.left;
    const PAD_RIGHT = TERM_PAD.right;

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
        xAxis === "distance" && distanceData
            ? distanceData
            : (timeData ?? data.map((_, i) => i)),
    );

    let startIdx = $derived(trimLeadingZeros(data));
    let trimData = $derived(startIdx > 0 ? data.slice(startIdx) : data);
    let trimXData = $derived(startIdx > 0 ? xData.slice(startIdx) : xData);
    let trimPausedMask = $derived(
        pausedMask
            ? startIdx > 0
                ? pausedMask.slice(startIdx)
                : pausedMask
            : null,
    );

    let xMin = $derived(trimXData[0] ?? 0);
    let xMax = $derived(trimXData[trimXData.length - 1] ?? 1);
    let xRange = $derived(xMax - xMin || 1);

    function toX(xVal: number): number {
        return PAD_LEFT + ((xVal - xMin) / xRange) * chartW;
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
        return invertY ? PAD_TOP + t * chartH : PAD_TOP + chartH - t * chartH;
    }

    function fromY(px: number): number {
        const t = invertY
            ? (px - PAD_TOP) / chartH
            : (PAD_TOP + chartH - px) / chartH;
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

        const bands = zones
            .map((z) => {
                const lo = zoneMetric === "pace" ? z.paceMin : z.hrMin;
                const hi = zoneMetric === "pace" ? z.paceMax : z.hrMax;
                const rawLo = lo ?? yMin;
                const rawHi = hi ?? yMax;
                const y1 = Math.min(toY(rawLo), toY(rawHi));
                const y2 = Math.max(toY(rawLo), toY(rawHi));
                const bandY = Math.max(y1, PAD_TOP);
                const bandH = Math.min(y2, PAD_TOP + chartH) - bandY;
                return { color: z.color, y: bandY, h: bandH };
            })
            .filter((b) => b.h > 0);

        if (bands.length === 0) return [];

        const totalTop = Math.min(...bands.map((b) => b.y));
        const totalBottom = Math.max(...bands.map((b) => b.y + b.h));
        const totalH = totalBottom - totalTop;
        const DOT_SPACING = 8;
        const cols = Math.max(1, Math.floor(chartW / DOT_SPACING));
        const totalRows = Math.max(1, Math.floor(totalH / DOT_SPACING));
        const hSpace = chartW / cols;
        const vSpace = totalH / totalRows;

        function isCorner(globalRow: number): boolean {
            const edge = Math.min(globalRow, totalRows - 1 - globalRow);
            return edge === 0;
        }

        return bands.map((band) => {
            const dots: { cx: number; cy: number }[] = [];
            for (let gr = 0; gr < totalRows; gr++) {
                const cy = totalTop + vSpace * (gr + 0.5);
                if (cy < band.y || cy >= band.y + band.h) continue;

                const skip = isCorner(gr) ? 1 : 0;
                for (let c = skip; c < cols - skip; c++) {
                    dots.push({ cx: PAD_LEFT + hSpace * (c + 0.5), cy });
                }
            }
            return { color: band.color, dots };
        });
    });

    // --- Crosshair ---

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

    // --- Mouse event handlers ---

    function resolveIndex(e: MouseEvent): number | null {
        if (!svgEl) return null;
        const rect = svgEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        return findClosestIndex(
            mouseX,
            trimXData.map((x) => toX(x)),
        );
    }

    function resolveSvgPos(e: MouseEvent): { x: number; y: number } | null {
        if (!svgEl) return null;
        const rect = svgEl.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function handleMouseDown(e: MouseEvent) {
        // Don't start selection drag if ref line drag is active
        if (draggingRefIdx != null) return;
        const pos = resolveSvgPos(e);
        if (!pos) return;
        // Only start in chart area
        if (
            pos.x < PAD_LEFT ||
            pos.x > PAD_LEFT + chartW ||
            pos.y < PAD_TOP ||
            pos.y > PAD_TOP + chartH
        )
            return;
        dragOrigin = {
            clientX: e.clientX,
            clientY: e.clientY,
            svgX: pos.x,
            svgY: pos.y,
        };
        dragMode = null;
        justFinishedDrag = false;
    }

    function handleMouseMove(e: MouseEvent) {
        // Ref line drag takes priority
        if (draggingRefIdx != null) {
            if (!svgEl) return;
            const rect = svgEl.getBoundingClientRect();
            const mouseY = e.clientY - rect.top;
            const clamped = Math.max(
                PAD_TOP,
                Math.min(PAD_TOP + chartH, mouseY),
            );
            const val = fromY(clamped);
            refLines = refLines.map((r, i) =>
                i === draggingRefIdx
                    ? { value: val, label: fmtShort(val) }
                    : r,
            );
            return;
        }

        // Selection drag
        if (dragOrigin) {
            const dx = Math.abs(e.clientX - dragOrigin.clientX);
            const dy = Math.abs(e.clientY - dragOrigin.clientY);

            if (dragMode == null) {
                if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
                dragMode = dx >= dy ? "horizontal" : "vertical";
            }

            const pos = resolveSvgPos(e);
            if (!pos) return;

            if (dragMode === "horizontal") {
                const xPositions = trimXData.map((x) => toX(x));
                const si = findClosestIndex(dragOrigin.svgX, xPositions);
                const ei = findClosestIndex(pos.x, xPositions);
                if (si != null && ei != null) {
                    const lo = Math.min(si, ei);
                    const hi = Math.max(si, ei);
                    selection = {
                        mode: "horizontal",
                        startIdx: lo,
                        endIdx: hi,
                    };
                }
            } else {
                const clampedOriginY = Math.max(
                    PAD_TOP,
                    Math.min(PAD_TOP + chartH, dragOrigin.svgY),
                );
                const clampedCurrentY = Math.max(
                    PAD_TOP,
                    Math.min(PAD_TOP + chartH, pos.y),
                );
                const v1 = fromY(clampedOriginY);
                const v2 = fromY(clampedCurrentY);
                selection = {
                    mode: "vertical",
                    lowValue: Math.min(v1, v2),
                    highValue: Math.max(v1, v2),
                };
            }
            return;
        }

        // Normal crosshair
        const idx = resolveIndex(e);
        if (idx != null) oncrosshairmove?.(idx);
    }

    function handleMouseUp() {
        if (draggingRefIdx != null) {
            draggingRefIdx = null;
            return;
        }
        if (dragOrigin && dragMode != null) {
            // Drag completed — keep selection, prevent click from firing
            dragOrigin = null;
            dragMode = null;
            justFinishedDrag = true;
            return;
        }
        // Click without drag — reset
        dragOrigin = null;
        dragMode = null;
    }

    function handleClick(e: MouseEvent) {
        if (justFinishedDrag) {
            justFinishedDrag = false;
            return;
        }
        // Click clears selection if one exists
        if (selection) {
            clearSelection();
            return;
        }
        const idx = resolveIndex(e);
        if (idx != null) oncrosshairclick?.(idx);
    }

    function handleMouseLeave() {
        if (draggingRefIdx != null) {
            draggingRefIdx = null;
            return;
        }
        if (dragOrigin) {
            dragOrigin = null;
            dragMode = null;
            return;
        }
        oncrosshairleave?.();
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape" && selection) {
            e.stopPropagation();
            clearSelection();
        }
    }

    // --- Selection overlay geometry ---

    let selectionRect = $derived.by(
        (): {
            x: number;
            y: number;
            width: number;
            height: number;
        } | null => {
            if (!selection) return null;
            if (selection.mode === "horizontal") {
                const x1 = toX(trimXData[selection.startIdx]);
                const x2 = toX(trimXData[selection.endIdx]);
                return {
                    x: x1,
                    y: PAD_TOP,
                    width: Math.max(1, x2 - x1),
                    height: chartH,
                };
            }
            const y1 = toY(selection.highValue);
            const y2 = toY(selection.lowValue);
            const top = Math.min(y1, y2);
            const bottom = Math.max(y1, y2);
            return {
                x: PAD_LEFT,
                y: top,
                width: chartW,
                height: Math.max(1, bottom - top),
            };
        },
    );

    // Stats overlay positioning (pixel coords relative to wrapper div)
    let statsPosition = $derived.by(
        (): { left: string; top: string } | null => {
            if (!selectionRect || !selectionStats) return null;
            if (selectionStats.mode === "horizontal") {
                const cx = selectionRect.x + selectionRect.width / 2;
                // Account for the header bar height (~28px)
                return { left: `${cx}px`, top: `${PAD_TOP + 28 + 8}px` };
            }
            const cy =
                selectionRect.y + selectionRect.height / 2 + 28; // 28 for header
            return { left: `${PAD_LEFT + chartW / 2}px`, top: `${cy}px` };
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
        const baseY = PAD_TOP + chartH;
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

    // --- Cursor ---

    let cursorStyle = $derived.by(() => {
        if (draggingRefIdx != null) return "ns-resize";
        if (dragMode === "horizontal") return "col-resize";
        if (dragMode === "vertical") return "row-resize";
        if (dragOrigin) return "crosshair";
        return "";
    });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="relative w-full h-full flex flex-col"
    style="min-height: 0;"
    role="group"
    tabindex="-1"
    onkeydown={handleKeyDown}
>
    <div class="flex items-baseline justify-end px-2 py-1 shrink-0">
        <span
            class="text-[12px]"
            style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums;"
        >
            {#if tooltipPaused}
                <span style="color: var(--term-text-muted);">PAUSED</span>
            {:else if tooltipValue != null}
                {fmt(tooltipValue)}
            {:else}
                {fmt(yMin)}–{fmt(yMax)}
            {/if}
        </span>
    </div>

    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <svg
        bind:this={svgEl}
        class="flex-1 w-full"
        preserveAspectRatio="none"
        viewBox="0 0 {svgWidth} {svgHeight}"
        role="img"
        aria-label="{label} chart"
        style="display: block; min-height: 0;{cursorStyle ? ` cursor: ${cursorStyle};` : ''}"
        onmousedown={handleMouseDown}
        onmousemove={handleMouseMove}
        onmouseup={handleMouseUp}
        onclick={handleClick}
        onmouseleave={handleMouseLeave}
    >
        <defs>
            <clipPath id={clipId}>
                <rect x={PAD_LEFT} y={PAD_TOP} width={chartW} height={chartH} />
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

        {#each yLabels as lbl, i (i)}
            <line
                x1={PAD_LEFT}
                y1={lbl.y}
                x2={PAD_LEFT + chartW}
                y2={lbl.y}
                stroke="var(--term-grid)"
                stroke-width="1"
            />
            <text
                x={PAD_LEFT + chartW + 4}
                y={lbl.y + 3}
                text-anchor="start"
                fill="var(--term-text-muted)"
                font-size="10"
                font-family="'Geist Mono', monospace"
                >{fmtShort(lbl.value)}</text
            >
        {/each}

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
                y={PAD_TOP}
                width={Math.max(2, highlightPixels.x2 - highlightPixels.x1)}
                height={chartH}
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
                    y1={PAD_TOP}
                    x2={mx}
                    y2={PAD_TOP + chartH}
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

        <!-- Selection overlay -->
        {#if selectionRect}
            <rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                fill="var(--term-selection)"
                clip-path="url(#{clipId})"
            />
            {#if selection?.mode === "horizontal"}
                <line
                    x1={selectionRect.x}
                    y1={PAD_TOP}
                    x2={selectionRect.x}
                    y2={PAD_TOP + chartH}
                    stroke="var(--term-selection-border)"
                    stroke-width="1"
                />
                <line
                    x1={selectionRect.x + selectionRect.width}
                    y1={PAD_TOP}
                    x2={selectionRect.x + selectionRect.width}
                    y2={PAD_TOP + chartH}
                    stroke="var(--term-selection-border)"
                    stroke-width="1"
                />
            {:else}
                <line
                    x1={PAD_LEFT}
                    y1={selectionRect.y}
                    x2={PAD_LEFT + chartW}
                    y2={selectionRect.y}
                    stroke="var(--term-selection-border)"
                    stroke-width="1"
                />
                <line
                    x1={PAD_LEFT}
                    y1={selectionRect.y + selectionRect.height}
                    x2={PAD_LEFT + chartW}
                    y2={selectionRect.y + selectionRect.height}
                    stroke="var(--term-selection-border)"
                    stroke-width="1"
                />
            {/if}
        {/if}

        {#each refLines as ref, ri (ri)}
            {@const ry = toY(ref.value)}
            {#if ry >= PAD_TOP && ry <= PAD_TOP + chartH}
                <line
                    x1={PAD_LEFT}
                    y1={ry}
                    x2={PAD_LEFT + chartW}
                    y2={ry}
                    stroke={color}
                    stroke-width="1"
                    stroke-opacity="0.6"
                />
                <!-- invisible wide hit target for dragging -->
                <rect
                    x={PAD_LEFT}
                    y={ry - 5}
                    width={chartW}
                    height={10}
                    fill="transparent"
                    style="cursor: ns-resize;"
                    onmousedown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        draggingRefIdx = ri;
                    }}
                />
                {@const rlw = ref.label.length * 6 + 16}
                <rect
                    x={PAD_LEFT + chartW + 2}
                    y={ry - 7}
                    width={rlw}
                    height={14}
                    rx="2"
                    fill={color}
                    fill-opacity="0.5"
                    style="cursor: ns-resize;"
                    onmousedown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        draggingRefIdx = ri;
                    }}
                />
                <text
                    x={PAD_LEFT + chartW + 4}
                    y={ry + 3}
                    text-anchor="start"
                    fill="var(--term-text-bright)"
                    font-size="10"
                    font-weight="500"
                    font-family="'Geist Mono', monospace"
                    style="cursor: ns-resize;"
                    onmousedown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        draggingRefIdx = ri;
                    }}>{ref.label}</text
                >
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <text
                    x={PAD_LEFT + chartW + 4 + ref.label.length * 6 + 4}
                    y={ry + 3}
                    text-anchor="start"
                    fill="var(--term-text-bright)"
                    font-size="10"
                    font-weight="bold"
                    font-family="'Geist Mono', monospace"
                    role="button"
                    tabindex="-1"
                    style="cursor: pointer; outline: none;"
                    onclick={(e) => {
                        e.stopPropagation();
                        removeRefLine(ri);
                    }}>×</text
                >
            {/if}
        {/each}

        {#if crosshairX != null}
            {@const dashStyle = crosshairLocked ? undefined : "3,2"}
            <line
                x1={crosshairX}
                y1={PAD_TOP}
                x2={crosshairX}
                y2={PAD_TOP + chartH}
                stroke="var(--term-crosshair)"
                stroke-width="1"
                stroke-dasharray={dashStyle}
            />
            {#if crosshairY != null && !tooltipPaused}
                <line
                    x1={PAD_LEFT}
                    y1={crosshairY}
                    x2={PAD_LEFT + chartW}
                    y2={crosshairY}
                    stroke="var(--term-crosshair)"
                    stroke-width="1"
                    stroke-dasharray={dashStyle}
                />
                {#if tooltipValue != null}
                    {@const isExisting = crosshairRefMatch >= 0}
                    {@const btnLabel = isExisting ? "x" : "+"}
                    {@const labelText = fmtShort(tooltipValue)}
                    {@const labelW =
                        labelText.length * 6 + (crosshairLocked ? 16 : 4)}
                    <rect
                        x={PAD_LEFT + chartW + 2}
                        y={crosshairY - 7}
                        width={labelW}
                        height={14}
                        rx="2"
                        fill={color}
                        fill-opacity="0.85"
                    />
                    <text
                        x={PAD_LEFT + chartW + 4}
                        y={crosshairY + 3}
                        text-anchor="start"
                        fill="var(--term-text-bright)"
                        font-size="10"
                        font-weight="500"
                        font-family="'Geist Mono', monospace">{labelText}</text
                    >
                    {#if crosshairLocked}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <text
                            x={PAD_LEFT + chartW + 4 + labelText.length * 6 + 4}
                            y={crosshairY + 3}
                            text-anchor="start"
                            fill="var(--term-text-bright)"
                            font-size="10"
                            font-weight="bold"
                            font-family="'Geist Mono', monospace"
                            role="button"
                            tabindex="-1"
                            style="cursor: pointer; outline: none;"
                            onclick={(e) => {
                                e.stopPropagation();
                                if (isExisting)
                                    removeRefLine(crosshairRefMatch);
                                else addRefLine();
                            }}>{btnLabel}</text
                        >
                    {/if}
                {/if}
            {/if}
        {/if}

        {#each xLabels as lbl, i (i)}
            <text
                x={lbl.x}
                y={svgHeight - 4}
                text-anchor={i === 0
                    ? "start"
                    : i === xLabels.length - 1
                      ? "end"
                      : "middle"}
                fill="var(--term-text-muted)"
                font-size="10"
                font-family="'Geist Mono', monospace">{lbl.label}</text
            >
        {/each}

        {#if crosshairX != null && crosshairXLabel != null}
            {@const lw = crosshairXLabel.length * 6 + 8}
            {@const lx = Math.min(
                Math.max(crosshairX, PAD_LEFT + lw / 2),
                PAD_LEFT + chartW - lw / 2,
            )}
            <rect
                x={lx - lw / 2}
                y={svgHeight - 17}
                width={lw}
                height={15}
                rx="2"
                fill={color}
                fill-opacity="0.85"
            />
            <text
                x={lx}
                y={svgHeight - 5}
                text-anchor="middle"
                fill="var(--term-text-bright)"
                font-size="10"
                font-weight="500"
                font-family="'Geist Mono', monospace">{crosshairXLabel}</text
            >
        {/if}
    </svg>

    <!-- Selection stats overlay -->
    {#if selectionStats && statsPosition && !dragOrigin}
        <div
            class="absolute pointer-events-none"
            style="
                left: {statsPosition.left};
                top: {statsPosition.top};
                transform: translate(-50%, 0);
                background: var(--term-surface);
                backdrop-filter: blur(12px);
                border: 1px solid var(--term-border);
                border-radius: 4px;
                padding: 6px 10px;
                font-family: 'Geist Mono', monospace;
                font-size: 10px;
                font-variant-numeric: tabular-nums;
                z-index: 10;
                white-space: nowrap;
            "
        >
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
        </div>
    {/if}
</div>
