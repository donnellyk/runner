<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/state";

    // eslint-disable-next-line svelte/no-navigation-without-resolve -- same-page query param links
    function navigatePeriod(period: string) { goto(`${page.url.pathname}?sport=${data.filters.sport}&period=${period}`); }
    import {
        formatDistance,
        formatElevation,
        formatPace,
        type Units,
    } from "$lib/format";

    let { data } = $props();
    const units = $derived(data.user.distanceUnit as Units);

    type StatMode = "avg" | "median" | "max" | "min" | "total" | "p25" | "p75";

    let statMode = $state<StatMode>("avg");

    const statModes: { value: StatMode; label: string }[] = [
        { value: "avg", label: "Average" },
        { value: "median", label: "Median" },
        { value: "p25", label: "P25" },
        { value: "p75", label: "P75" },
        { value: "max", label: "Max" },
        { value: "min", label: "Min" },
        { value: "total", label: "Total" },
    ];

    interface ChartDef {
        label: string;
        getValue: (row: (typeof data.stats)[number]) => number;
        format: (v: number) => string;
        invertY?: boolean;
    }

    let charts = $derived.by((): ChartDef[] => {
        const m = statMode;
        const paceLabel =
            m === "total"
                ? "Avg Pace"
                : `${statModes.find((s) => s.value === m)?.label} Pace`;
        const distLabel =
            m === "total"
                ? "Total Distance"
                : `${statModes.find((s) => s.value === m)?.label} Distance`;
        const hrLabel =
            m === "total"
                ? "Avg HR"
                : `${statModes.find((s) => s.value === m)?.label} HR`;

        return [
            {
                label: paceLabel,
                getValue: (r) => {
                    switch (m) {
                        case "median":
                            return r.medianSpeed;
                        case "max":
                            return r.maxSpeed;
                        case "min":
                            return r.minSpeed;
                        case "p25":
                            return r.p25Speed;
                        case "p75":
                            return r.p75Speed;
                        default:
                            return r.avgSpeed;
                    }
                },
                format: (v) => formatPace(v, units),
                invertY: true,
            },
            {
                label: hrLabel,
                getValue: (r) => {
                    switch (m) {
                        case "median":
                            return r.medianHeartrate;
                        case "max":
                            return r.maxHeartrate;
                        default:
                            return r.avgHeartrate;
                    }
                },
                format: (v) => (v > 0 ? `${Math.round(v)} bpm` : "—"),
            },
            {
                label: distLabel,
                getValue: (r) => {
                    switch (m) {
                        case "total":
                            return r.totalDistance;
                        case "median":
                            return r.medianDistance;
                        case "p25":
                            return r.p25Distance;
                        case "p75":
                            return r.p75Distance;
                        case "max":
                            return r.maxDistance;
                        case "min":
                            return r.p25Distance; // no minDistance, use p25
                        default:
                            return r.avgDistance;
                    }
                },
                format: (v) => formatDistance(v, units),
            },
            {
                label: m === "total" ? "Total Elevation" : "Total Elevation",
                getValue: (r) => r.totalElevationGain,
                format: (v) => formatElevation(v, units),
            },
            {
                label: "Activities",
                getValue: (r) => r.count,
                format: (v) => String(Math.round(v)),
            },
        ];
    });

    function formatMonth(ym: string): string {
        const [year, month] = ym.split("-");
        return new Date(Number(year), Number(month) - 1).toLocaleDateString(
            "en-US",
            {
                month: "short",
                year: "2-digit",
            },
        );
    }

    function periodLabel(p: string): string {
        return data.filters.period === "year" ? p : formatMonth(p);
    }

    function sportLabel(s: string): string {
        return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // SVG chart dimensions
    const W = 600;
    const H = 160;
    const PAD = { top: 20, right: 10, bottom: 24, left: 50 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    // Per-chart hover state
    let hoverIndices: Record<string, number | null> = $state({});

    function handleChartMouse(
        e: MouseEvent,
        chartKey: string,
        pointCount: number,
    ) {
        const svg = (e.currentTarget as Element).closest("svg");
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * W;
        const relX = (mouseX - PAD.left) / chartW;
        const idx = Math.round(relX * (pointCount - 1));
        hoverIndices[chartKey] = Math.max(0, Math.min(pointCount - 1, idx));
    }

    function handleChartLeave(chartKey: string) {
        hoverIndices[chartKey] = null;
    }
</script>

<div class="mb-6">
    <h1 class="font-serif text-4xl font-semibold text-zinc-900 mb-6">Stats</h1>

    <div class="flex flex-wrap gap-3 items-center mb-4">
        <form method="GET" class="flex gap-3 items-center">
            <input type="hidden" name="period" value={data.filters.period} />
            <select
                name="sport"
                onchange={(e) =>
                    (e.currentTarget.form as HTMLFormElement).requestSubmit()}
                class="border border-zinc-200 rounded px-2.5 py-1.5 text-sm bg-white text-zinc-700"
            >
                {#each data.sportTypes as s (s)}
                    <option value={s} selected={data.filters.sport === s}
                        >{sportLabel(s)}</option
                    >
                {/each}
            </select>
        </form>

        <div class="flex border border-zinc-200 rounded overflow-hidden">
            <button
                onclick={() => navigatePeriod('month')}
                class="px-3 py-1.5 text-sm {data.filters.period === 'month'
                    ? 'bg-zinc-100 font-medium text-zinc-900'
                    : 'text-zinc-500 hover:bg-zinc-50'}">Month</button
            >
            <button
                onclick={() => navigatePeriod('year')}
                class="px-3 py-1.5 text-sm {data.filters.period === 'year'
                    ? 'bg-zinc-100 font-medium text-zinc-900'
                    : 'text-zinc-500 hover:bg-zinc-50'}">Year</button
            >
        </div>

        <div class="flex border border-zinc-200 rounded overflow-hidden">
            {#each statModes as mode (mode.value)}
                <button
                    class="px-2.5 py-1.5 text-xs {statMode === mode.value
                        ? 'bg-zinc-100 font-medium text-zinc-900'
                        : 'text-zinc-500 hover:bg-zinc-50'}"
                    onclick={() => (statMode = mode.value)}>{mode.label}</button
                >
            {/each}
        </div>
    </div>
</div>

{#if data.stats.length === 0}
    <p class="text-sm text-zinc-400">
        No activities found for {sportLabel(data.filters.sport)}.
    </p>
{:else}
    <div class="space-y-6">
        {#each charts as chart (chart.label)}
            {@const values = data.stats.map((r) => chart.getValue(r))}
            {@const nonZero = values.filter((v) => v > 0)}
            {#if nonZero.length > 0}
                {@const rawMin = Math.min(...nonZero)}
                {@const rawMax = Math.max(...values)}
                {@const pad = (rawMax - rawMin) * 0.15 || rawMax * 0.1 || 1}
                {@const yMin = Math.max(0, rawMin - pad)}
                {@const yMax = rawMax + pad}
                {@const yRange = yMax - yMin || 1}

                {@const hIdx = hoverIndices[chart.label] ?? null}
                <div class="border border-zinc-100 rounded-lg p-4">
                    <div
                        class="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2"
                    >
                        {chart.label}
                    </div>
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <svg
                        viewBox="0 0 {W} {H}"
                        class="w-full"
                        style="cursor: crosshair;"
                        preserveAspectRatio="xMidYMid meet"
                        onmousemove={(e) =>
                            handleChartMouse(e, chart.label, values.length)}
                        onmouseleave={() => handleChartLeave(chart.label)}
                    >
                        <!-- Y grid lines -->
                        {#each [0, 0.25, 0.5, 0.75, 1] as t (t)}
                            {@const yVal = chart.invertY
                                ? yMin + t * yRange
                                : yMax - t * yRange}
                            {@const y = PAD.top + t * chartH}
                            <line
                                x1={PAD.left}
                                y1={y}
                                x2={PAD.left + chartW}
                                y2={y}
                                stroke="#f4f4f5"
                                stroke-width="1"
                            />
                            <text
                                x={PAD.left - 6}
                                y={y + 3}
                                text-anchor="end"
                                fill="#a1a1aa"
                                font-size="9"
                                font-family="'Geist Mono', monospace"
                            >
                                {chart.format(yVal)}
                            </text>
                        {/each}

                        <!-- Line -->
                        <polyline
                            points={values
                                .map((v, i) => {
                                    const x =
                                        PAD.left +
                                        (values.length === 1
                                            ? chartW / 2
                                            : (i / (values.length - 1)) *
                                              chartW);
                                    const norm = (v - yMin) / yRange;
                                    const y = chart.invertY
                                        ? PAD.top + norm * chartH
                                        : PAD.top + (1 - norm) * chartH;
                                    return `${x},${y}`;
                                })
                                .join(" ")}
                            fill="none"
                            stroke="#18181b"
                            stroke-width="1.5"
                            stroke-linejoin="round"
                            stroke-linecap="round"
                        />

                        <!-- Dots -->
                        {#each values as v, i (i)}
                            {@const x =
                                PAD.left +
                                (values.length === 1
                                    ? chartW / 2
                                    : (i / (values.length - 1)) * chartW)}
                            {@const norm = (v - yMin) / yRange}
                            {@const y = chart.invertY
                                ? PAD.top + norm * chartH
                                : PAD.top + (1 - norm) * chartH}
                            <circle
                                cx={x}
                                cy={y}
                                r={hIdx === i ? 5 : 3}
                                fill="#18181b"
                            />
                        {/each}

                        <!-- Hover tooltip -->
                        {#if hIdx != null}
                            {@const hv = values[hIdx]}
                            {@const hx =
                                PAD.left +
                                (values.length === 1
                                    ? chartW / 2
                                    : (hIdx / (values.length - 1)) * chartW)}
                            {@const hnorm = (hv - yMin) / yRange}
                            {@const hy = chart.invertY
                                ? PAD.top + hnorm * chartH
                                : PAD.top + (1 - hnorm) * chartH}
                            {@const above = hy > PAD.top + chartH / 2}
                            {@const tooltipW = 84}
                            {@const tooltipX = Math.max(
                                0,
                                Math.min(W - tooltipW, hx - tooltipW / 2),
                            )}
                            {@const textX = tooltipX + tooltipW / 2}
                            <rect
                                x={tooltipX}
                                y={above ? hy - 34 : hy + 10}
                                width={tooltipW}
                                height="22"
                                rx="4"
                                fill="#18181b"
                            />
                            <text
                                x={textX}
                                y={above ? hy - 19 : hy + 25}
                                text-anchor="middle"
                                fill="white"
                                font-size="10"
                                font-weight="500"
                                font-family="'Geist Mono', monospace"
                                >{chart.format(hv)}</text
                            >
                        {/if}

                        <!-- X labels -->
                        {#each data.stats as row, i (row.period)}
                            {@const x =
                                PAD.left +
                                (data.stats.length === 1
                                    ? chartW / 2
                                    : (i / (data.stats.length - 1)) * chartW)}
                            {#if data.stats.length <= 12 || i % Math.ceil(data.stats.length / 10) === 0 || i === data.stats.length - 1}
                                <text
                                    {x}
                                    y={H - 4}
                                    text-anchor="middle"
                                    fill={hIdx === i ? "#18181b" : "#a1a1aa"}
                                    font-weight={hIdx === i ? "600" : "normal"}
                                    font-size="9"
                                    font-family="'Geist Mono', monospace"
                                    >{periodLabel(row.period)}</text
                                >
                            {/if}
                        {/each}
                    </svg>
                </div>
            {/if}
        {/each}
    </div>
{/if}
