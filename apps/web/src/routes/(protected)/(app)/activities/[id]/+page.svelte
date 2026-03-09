<script lang="ts">
    import { resolve } from "$app/paths";
    import RouteMap from "$lib/components/RouteMap.svelte";
    import ActivityChart from "$lib/components/ActivityChart.svelte";
    import LapsChart from "$lib/components/LapsChart.svelte";
    import StatCard from "$lib/components/StatCard.svelte";
    import { sportColor, workoutBadge } from "$lib/activity-colors";
    import {
        formatDistance,
        formatPace,
        formatElevation,
        formatDurationClock,
        formatPaceValue,
        formatDistancePrecise,
        type Units,
    } from "$lib/format";

    let { data } = $props();
    const units = data.user.distanceUnit as Units;
    const a = data.activity;
    const { streamMap, paceZones, hrZones } = data;

    let crosshairIndex = $state<number | null>(null);
    let xAxis = $state<"distance" | "time">("distance");

    const KM_TO_MI_PACE = 1.60934;
    const M_TO_FT = 3.28084;

    function getStream(type: string): number[] | null {
        const s = streamMap[type];
        return Array.isArray(s) && s.length > 0 ? s : null;
    }

    const PAUSE_VELOCITY_MS = 0.3; // m/s — below this is considered paused/stationary

    const velocityStream = $derived(getStream("velocity_smooth"));

    const paceStream = $derived.by(() => {
        if (!velocityStream) return null;
        const secPerKm = velocityStream.map((ms) => (ms > 0 ? 1000 / ms : 0));
        return units === "imperial"
            ? secPerKm.map((s) => s * KM_TO_MI_PACE)
            : secPerKm;
    });

    const pausedMask = $derived(
        velocityStream ? velocityStream.map((ms) => ms < PAUSE_VELOCITY_MS) : null,
    );

    const paceZonesDisplay = $derived(
        units === "imperial"
            ? paceZones.map((z) => ({
                  ...z,
                  paceMin: z.paceMin != null ? z.paceMin * KM_TO_MI_PACE : null,
                  paceMax: z.paceMax != null ? z.paceMax * KM_TO_MI_PACE : null,
              }))
            : paceZones,
    );
    const hrStream = $derived(getStream("heartrate"));
    const altStream = $derived.by(() => {
        const s = getStream("altitude");
        if (!s) return null;
        return units === "imperial" ? s.map((m) => m * M_TO_FT) : s;
    });
    const cadStream = $derived(getStream("cadence"));
    const distStream = $derived(getStream("distance"));
    const timeStream = $derived(getStream("time"));

    // Downsample all streams at shared indices so crosshair sync stays consistent
    const MAX_CHART_POINTS = 500;

    const chartIndices = $derived.by(() => {
        const len = distStream?.length ?? paceStream?.length ?? 0;
        if (len <= MAX_CHART_POINTS) return null;
        const stride = len / MAX_CHART_POINTS;
        return Array.from({ length: MAX_CHART_POINTS }, (_, i) =>
            Math.round(i * stride),
        );
    });

    function sample<T>(stream: T[] | null): T[] | null {
        if (!stream || !chartIndices) return stream;
        return chartIndices.map((i) => stream[i]);
    }

    const chartPace = $derived(sample(paceStream));
    const chartHr = $derived(sample(hrStream));
    const chartAlt = $derived(sample(altStream));
    const chartCad = $derived(sample(cadStream));
    const chartDist = $derived(sample(distStream));
    const chartTime = $derived(sample(timeStream));
    const chartPausedMask = $derived(sample(pausedMask));

    function getRouteCoords(): [number, number][] | null {
        if (a.routeGeoJson) {
            try {
                const geo = JSON.parse(a.routeGeoJson);
                return geo.coordinates;
            } catch {
                return null;
            }
        }
        const latlng = getStream("latlng");
        if (latlng) {
            return (latlng as unknown as [number, number][]).map(
                ([lat, lng]) => [lng, lat],
            );
        }
        return null;
    }

    const routeCoords = $derived(getRouteCoords());

    // Map marker: find the latlng at the crosshair's original stream index
    const latlngStream = $derived(
        Array.isArray(streamMap["latlng"]) && streamMap["latlng"].length > 0
            ? (streamMap["latlng"] as unknown as [number, number][])
            : null,
    );
    const markerCoord = $derived.by((): [number, number] | null => {
        if (crosshairIndex == null || !latlngStream) return null;
        const origIdx = chartIndices ? chartIndices[crosshairIndex] : crosshairIndex;
        const pt = latlngStream[origIdx];
        if (!pt) return null;
        return [pt[1], pt[0]]; // latlng stream is [lat, lng]; RouteMap wants [lng, lat]
    });

    const avgPace = $derived(
        a.averageSpeed ? formatPace(a.averageSpeed, units) : null,
    );

    const accentColor = $derived(sportColor(a.sportType));
    const badge = $derived(workoutBadge(a.workoutType));

    // Lap heatmap: map each lap's speed to a green→red color
    const lapSpeedRange = $derived.by(() => {
        const speeds = data.laps
            .map((l) => l.averageSpeed ?? 0)
            .filter((s) => s > 0);
        if (speeds.length < 2) return null;
        return { min: Math.min(...speeds), max: Math.max(...speeds) };
    });

    function lapHeatColor(speed: number | null): string {
        if (!speed || !lapSpeedRange) return "transparent";
        const t =
            (lapSpeedRange.max - speed) /
            (lapSpeedRange.max - lapSpeedRange.min);
        return `hsl(${Math.round(120 * (1 - t))}, 60%, 92%)`;
    }

    function formatPaceSec(sec: number): string {
        const mins = Math.floor(sec / 60);
        const secs = Math.round(sec % 60);
        const unit = units === "imperial" ? "/mi" : "/km";
        return `${mins}:${String(secs).padStart(2, "0")} ${unit}`;
    }
</script>

<div class="mb-6 flex items-center justify-between">
    <a
        href={resolve("/activities")}
        class="text-sm text-zinc-400 hover:text-zinc-700">&larr; Activities</a
    >
    {#if a.source === 'strava'}
        <a
            href="https://www.strava.com/activities/{a.externalId}"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-zinc-400 hover:text-zinc-700"
        >Strava &nearr;</a>
    {/if}
</div>

<div class="mb-8">
    <div class="flex items-baseline justify-between gap-4 flex-wrap">
        <div class="flex items-baseline gap-3 min-w-0">
            <h1 class="font-serif text-4xl font-semibold text-zinc-900">
                {a.name}
            </h1>
            {#if badge}
                <span
                    class="shrink-0 text-xs font-semibold px-2 py-0.5 rounded"
                    style="background: {badge.bg}; color: {badge.fg};"
                    >{badge.label}</span
                >
            {/if}
        </div>
        <span
            class="font-mono text-sm text-zinc-400 shrink-0"
            style="font-variant-numeric: tabular-nums;"
        >
            {new Date(a.startDate).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
            })}
            ·
            {new Date(a.startDate).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
            })}
        </span>
    </div>
    <div class="h-1 mt-1 rounded-full" style="background: {accentColor};"></div>
</div>

<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
    {#if a.distance}
        <StatCard label="Distance" value={formatDistance(a.distance, units)} />
    {/if}
    {#if a.movingTime}
        <StatCard label="Time" value={formatDurationClock(a.movingTime)} />
    {/if}
    {#if avgPace}
        <StatCard label="Avg Pace" value={avgPace} />
    {/if}
    {#if a.averageHeartrate}
        <StatCard
            label="Avg HR"
            value="{Math.round(a.averageHeartrate)} bpm"
            sub={a.maxHeartrate
                ? `max ${Math.round(a.maxHeartrate)}`
                : undefined}
        />
    {/if}
    {#if a.totalElevationGain && a.totalElevationGain > 0}
        <StatCard
            label="Elevation"
            value="+{formatElevation(a.totalElevationGain, units)}"
        />
    {/if}
    {#if a.averageCadence}
        <StatCard
            label="Cadence"
            value="{Math.round(a.averageCadence * 2)} spm"
        />
    {/if}
</div>

{#if routeCoords}
    <div class="mb-8">
        <RouteMap coordinates={routeCoords} marker={markerCoord} />
    </div>
{/if}

{#if chartPace || chartHr || chartAlt}
    <div class="mb-8">
        <div class="flex items-center justify-between mb-4">
            <h2
                class="text-xs font-semibold uppercase tracking-wide text-zinc-400"
            >
                Charts
            </h2>
            <div class="flex gap-1">
                <button
                    onclick={() => (xAxis = "distance")}
                    class="px-2.5 py-1 text-xs rounded {xAxis === 'distance'
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-500 hover:bg-zinc-100'}"
                >
                    Distance
                </button>
                <button
                    onclick={() => (xAxis = "time")}
                    class="px-2.5 py-1 text-xs rounded {xAxis === 'time'
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-500 hover:bg-zinc-100'}"
                >
                    Time
                </button>
            </div>
        </div>

        {#if chartPace}
            <ActivityChart
                data={chartPace}
                distanceData={chartDist ?? undefined}
                timeData={chartTime ?? undefined}
                {xAxis}
                {units}
                label="Pace"
                color="var(--color-stream-pace)"
                unit=""
                formatValue={formatPaceSec}
                pausedMask={chartPausedMask ?? undefined}
                invertY={true}
                zones={paceZonesDisplay}
                zoneMetric="pace"
                {crosshairIndex}
                oncrosshairmove={(i) => (crosshairIndex = i)}
            />
        {/if}

        {#if chartHr}
            <ActivityChart
                data={chartHr}
                distanceData={chartDist ?? undefined}
                timeData={chartTime ?? undefined}
                {xAxis}
                {units}
                label="Heart Rate"
                color="var(--color-stream-heartrate)"
                unit=" bpm"
                zones={hrZones}
                zoneMetric="heartrate"
                {crosshairIndex}
                oncrosshairmove={(i) => (crosshairIndex = i)}
            />
        {/if}

        {#if chartAlt}
            <ActivityChart
                data={chartAlt}
                distanceData={chartDist ?? undefined}
                timeData={chartTime ?? undefined}
                {xAxis}
                {units}
                label="Elevation"
                color="var(--color-stream-elevation)"
                unit={units === "imperial" ? " ft" : " m"}
                {crosshairIndex}
                oncrosshairmove={(i) => (crosshairIndex = i)}
            />
        {/if}

        {#if chartCad}
            <ActivityChart
                data={chartCad}
                distanceData={chartDist ?? undefined}
                timeData={chartTime ?? undefined}
                {xAxis}
                {units}
                label="Cadence"
                color="var(--color-stream-cadence)"
                unit=" rpm"
                {crosshairIndex}
                oncrosshairmove={(i) => (crosshairIndex = i)}
            />
        {/if}
    </div>
{/if}

{#if data.laps.length > 0}
    <div class="mb-8">
        <h2
            class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3"
        >
            Laps ({data.laps.length})
        </h2>
        <LapsChart laps={data.laps} {units} color={accentColor} />
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="border-b border-zinc-200 text-left">
                        <th class="py-2 pr-6 text-xs font-medium text-zinc-400"
                            >#</th
                        >
                        <th class="py-2 pr-6 text-xs font-medium text-zinc-400"
                            >Distance</th
                        >
                        <th class="py-2 pr-6 text-xs font-medium text-zinc-400"
                            >Time</th
                        >
                        <th class="py-2 pr-6 text-xs font-medium text-zinc-400"
                            >Pace</th
                        >
                        <th class="py-2 pr-6 text-xs font-medium text-zinc-400"
                            >HR</th
                        >
                        <th class="py-2 pr-6 text-xs font-medium text-zinc-400"
                            >Cadence</th
                        >
                    </tr>
                </thead>
                <tbody>
                    {#each data.laps as lap (lap.id)}
                        <tr class="border-b border-zinc-50">
                            <td
                                class="py-2 pr-6 font-mono text-zinc-500"
                                style="font-variant-numeric: tabular-nums;"
                                >{lap.lapIndex + 1}</td
                            >
                            <td
                                class="py-2 pr-6 font-mono text-zinc-700"
                                style="font-variant-numeric: tabular-nums;"
                                >{formatDistancePrecise(
                                    lap.distance,
                                    units,
                                )}</td
                            >
                            <td
                                class="py-2 pr-6 font-mono text-zinc-700"
                                style="font-variant-numeric: tabular-nums;"
                                >{formatDurationClock(lap.movingTime)}</td
                            >
                            <td
                                class="py-2 pr-6 font-mono text-zinc-700 rounded px-2"
                                style="font-variant-numeric: tabular-nums; background: {lapHeatColor(
                                    lap.averageSpeed,
                                )};">{formatPace(lap.averageSpeed, units)}</td
                            >
                            <td
                                class="py-2 pr-6 font-mono text-zinc-500"
                                style="font-variant-numeric: tabular-nums;"
                                >{lap.averageHeartrate
                                    ? Math.round(lap.averageHeartrate)
                                    : "—"}</td
                            >
                            <td
                                class="py-2 pr-6 font-mono text-zinc-500"
                                style="font-variant-numeric: tabular-nums;"
                                >{lap.averageCadence
                                    ? Math.round(lap.averageCadence * 2)
                                    : "—"}</td
                            >
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
{/if}

{#if data.segments.length > 0}
    <div class="mb-8">
        <h2
            class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3"
        >
            Splits ({data.segments.length})
        </h2>
        <div class="overflow-x-auto">
            <table class="text-sm whitespace-nowrap">
                <thead>
                    <tr class="border-b border-zinc-200 text-left">
                        <th class="py-2 pr-5 text-xs font-medium text-zinc-400"
                            >#</th
                        >
                        <th class="py-2 pr-5 text-xs font-medium text-zinc-400"
                            >Pace</th
                        >
                        <th class="py-2 pr-5 text-xs font-medium text-zinc-400"
                            >HR</th
                        >
                        <th class="py-2 pr-5 text-xs font-medium text-zinc-400"
                            >Cadence</th
                        >
                        <th class="py-2 pr-5 text-xs font-medium text-zinc-400"
                            >Elev</th
                        >
                    </tr>
                </thead>
                <tbody>
                    {#each data.segments as seg (seg.id)}
                        <tr class="border-b border-zinc-50">
                            <td
                                class="py-1.5 pr-5 font-mono text-zinc-500"
                                style="font-variant-numeric: tabular-nums;"
                                >{seg.segmentIndex + 1}</td
                            >
                            <td
                                class="py-1.5 pr-5 font-mono text-zinc-700"
                                style="font-variant-numeric: tabular-nums;"
                                >{formatPaceValue(seg.avgPace, units)}</td
                            >
                            <td
                                class="py-1.5 pr-5 font-mono text-zinc-500"
                                style="font-variant-numeric: tabular-nums;"
                                >{seg.avgHeartrate
                                    ? Math.round(seg.avgHeartrate)
                                    : "—"}</td
                            >
                            <td
                                class="py-1.5 pr-5 font-mono text-zinc-500"
                                style="font-variant-numeric: tabular-nums;"
                                >{seg.avgCadence
                                    ? Math.round(seg.avgCadence * 2)
                                    : "—"}</td
                            >
                            <td
                                class="py-1.5 pr-5 font-mono text-zinc-500"
                                style="font-variant-numeric: tabular-nums;"
                            >
                                {#if seg.elevationGain && seg.elevationGain > 0}+{formatElevation(
                                        seg.elevationGain,
                                        units,
                                    )}{:else}—{/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
{/if}
