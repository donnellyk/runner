<script lang="ts">
    import { resolve } from "$app/paths";
    import { invalidateAll } from "$app/navigation";
    import RouteMap from "$lib/components/RouteMap.svelte";
    import type { NoteMarker } from "$lib/components/RouteMap.svelte";
    import StatCard from "$lib/components/StatCard.svelte";
    import TerminalEntryCard from "$lib/terminal/TerminalEntryCard.svelte";
    import { sportColor, workoutBadge } from "$lib/activity-colors";
    import { bucketAvgIndices } from "$lib/sampling";
    import { findIndexAtDistance } from "$lib/streams";
    import {
        formatDistance,
        formatPace,
        formatElevation,
        formatDurationClock,
        toMeters,
        type Units,
    } from "$lib/format";
    import { isLatLngArray, isNumberArray } from "$lib/terminal/types";
    import ChartSection from "./ChartSection.svelte";
    import NotesSection from "./NotesSection.svelte";
    import LapsSection from "./LapsSection.svelte";
    import SegmentsSection from "./SegmentsSection.svelte";

    let { data } = $props();
    const units = $derived(data.user.distanceUnit as Units);
    const a = $derived(data.activity);
    const streamMap = $derived(data.streamMap);
    const paceZones = $derived(data.paceZones);
    const hrZones = $derived(data.hrZones);

    let crosshairIndex = $state<number | null>(null);
    let xAxis = $state<"distance" | "time">("distance");
    let showNotes = $state(true);
    let highlightedNoteId = $state<number | null>(null);
    const SMOOTHING_WINDOW = 2;
    const PAUSE_THRESHOLD = 1.0; // m/s
    const SAMPLE_POINTS = 500;

    const KM_TO_MI_PACE = 1.60934;
    const M_TO_FT = 3.28084;

    function getStream(type: string): number[] | null {
        const s = streamMap[type];
        return isNumberArray(s) && s.length > 0 ? s : null;
    }

    const velocityStream = $derived(getStream("velocity_smooth"));

    const paceStream = $derived.by(() => {
        if (!velocityStream) return null;
        const secPerKm = velocityStream.map((ms) => (ms > 0 ? 1000 / ms : 0));
        return units === "imperial"
            ? secPerKm.map((s) => s * KM_TO_MI_PACE)
            : secPerKm;
    });

    const pausedMask = $derived(
        velocityStream
            ? velocityStream.map((ms) => ms < PAUSE_THRESHOLD)
            : null,
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

    // Downsample all streams at shared indices so crosshair sync stays consistent.
    // Uses bucket averaging: divides into samplePoints buckets and picks the point
    // closest to each bucket's mean, diluting spikes without a separate smoothing pass.
    const chartIndices = $derived.by(() => {
        const len = velocityStream?.length ?? distStream?.length ?? 0;
        if (len <= SAMPLE_POINTS) return null;
        return bucketAvgIndices(velocityStream ?? Array.from({ length: len }, () => 0), SAMPLE_POINTS);
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
        const latlng = streamMap["latlng"];
        if (isLatLngArray(latlng) && latlng.length > 0) {
            return latlng.map(
                ([lat, lng]) => [lng, lat],
            );
        }
        return null;
    }

    const routeCoords = $derived(getRouteCoords());

    // Map marker: find the latlng at the crosshair's original stream index
    const latlngStream = $derived(
        isLatLngArray(streamMap["latlng"]) && streamMap["latlng"].length > 0
            ? streamMap["latlng"]
            : null,
    );
    const markerCoord = $derived.by((): [number, number] | null => {
        if (crosshairIndex == null || !latlngStream) return null;
        const origIdx = chartIndices
            ? chartIndices[crosshairIndex]
            : crosshairIndex;
        const pt = latlngStream[origIdx];
        if (!pt) return null;
        return [pt[1], pt[0]]; // latlng stream is [lat, lng]; RouteMap wants [lng, lat]
    });

    const noteMarkers = $derived.by((): NoteMarker[] => {
        if (!data.notes.length || !distStream || !latlngStream) return [];
        return data.notes.map((note) => {
            const startIdx = findIndexAtDistance(distStream, note.distanceStart);
            const pt = latlngStream[startIdx];
            const point: [number, number] = pt ? [pt[1], pt[0]] : [0, 0];

            let range: [number, number][] | undefined;
            if (note.distanceEnd != null) {
                const endIdx = findIndexAtDistance(distStream, note.distanceEnd);
                range = latlngStream
                    .slice(startIdx, endIdx + 1)
                    .map(([lat, lng]) => [lng, lat] as [number, number]);
            }

            return { id: note.id, content: note.content, point, range };
        });
    });

    const notes = $derived(data.notes);

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

    const handleNoteSubmit: import('@sveltejs/kit').SubmitFunction = async ({ formData, cancel }) => {
        const repeatStr = formData.get('repeatEvery') as string;
        const repeatEvery = repeatStr ? parseFloat(repeatStr) : null;
        const startStr = formData.get('distanceStart') as string;
        const start = parseFloat(startStr);
        const endStr = formData.get('distanceEnd') as string;
        const content = formData.get('content') as string;

        if (repeatEvery && repeatEvery > 0 && a.distance && !isNaN(start)) {
            cancel();

            const startMeters = toMeters(start, units);
            const intervalMeters = toMeters(repeatEvery, units);
            const endMeters = endStr ? toMeters(parseFloat(endStr), units) : null;
            const rangeWidth = endMeters != null ? endMeters - startMeters : null;

            for (let dist = startMeters; dist <= a.distance; dist += intervalMeters) {
                const body = new FormData();
                body.set('distanceStart', String(dist));
                if (rangeWidth != null) body.set('distanceEnd', String(dist + rangeWidth));
                body.set('content', content);
                await fetch('?/createNote', { method: 'POST', body });
            }

            await invalidateAll();
            return;
        }

        if (!isNaN(start)) formData.set('distanceStart', String(toMeters(start, units)));
        if (endStr) {
            const endVal = parseFloat(endStr);
            if (!isNaN(endVal)) formData.set('distanceEnd', String(toMeters(endVal, units)));
        }
        formData.delete('repeatEvery');

        return async () => { await invalidateAll(); };
    };

    function exportPaceJson() {
        const payload = {
            activityId: a.id,
            exportedAt: new Date().toISOString(),
            settings: { smoothingWindow: SMOOTHING_WINDOW, pauseThreshold: PAUSE_THRESHOLD, samplePoints: SAMPLE_POINTS, units },
            chartData: {
                pace: chartPace,
                distance: chartDist,
                time: chartTime,
                pausedMask: chartPausedMask,
            },
            rawStreams: {
                velocity_smooth: velocityStream,
                distance: distStream,
                time: timeStream,
            },
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `activity-${a.id}-pace.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="mb-6 flex items-center justify-between">
    <a
        href={resolve("/activities")}
        class="text-sm text-zinc-400 hover:text-zinc-700">&larr; Activities</a
    >
    {#if a.source === "strava"}
        <a
            href="https://www.strava.com/activities/{a.externalId}"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-zinc-400 hover:text-zinc-700">Strava &nearr;</a
        >
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
    <TerminalEntryCard activityId={a.id} />
</div>

{#if data.matchedWorkout}
    {@const w = data.matchedWorkout}
    <div class="mb-6 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-2.5">
        <span class="text-[10px] font-semibold uppercase tracking-wide text-blue-400 shrink-0">Plan</span>
        <span class="text-sm font-medium text-zinc-800">{w.workoutName}</span>
        {#if w.targetDistanceMin}
            <span class="text-xs text-zinc-500 font-mono">{formatDistance(w.targetDistanceMin, units)}{w.targetDistanceMax && w.targetDistanceMax !== w.targetDistanceMin ? `–${formatDistance(w.targetDistanceMax, units)}` : ''}</span>
        {/if}
        {#if w.effort}
            <span class="text-xs text-zinc-400 italic">{w.effort}</span>
        {/if}
        <span class="text-[10px] text-zinc-400">Week {w.weekNumber} · {w.phase}</span>
        <a
            href={resolve(`/plans/${w.instanceId}`)}
            class="ml-auto text-xs text-blue-500 hover:text-blue-700 font-medium shrink-0"
        >
            {w.planName} &rarr;
        </a>
    </div>
{/if}

{#if routeCoords}
    <div class="mb-8">
        <RouteMap coordinates={routeCoords} marker={markerCoord} darkMap={data.darkMap}
            {noteMarkers} {showNotes} {highlightedNoteId} />
    </div>
{/if}

<ChartSection
    {chartPace}
    {chartHr}
    {chartAlt}
    {chartCad}
    {chartDist}
    {chartTime}
    {chartPausedMask}
    {xAxis}
    {units}
    {crosshairIndex}
    {notes}
    {showNotes}
    bind:highlightedNoteId
    {paceZonesDisplay}
    {hrZones}
    isAdmin={data.user.isAdmin}
    smoothingWindow={SMOOTHING_WINDOW}
    {formatPaceSec}
    {exportPaceJson}
    oncrosshairindexchange={(i) => (crosshairIndex = i)}
    onxaxischange={(axis) => (xAxis = axis)}
    onshownoteschange={(show) => (showNotes = show)}
/>

<NotesSection
    {notes}
    {units}
    bind:highlightedNoteId
    {handleNoteSubmit}
/>

<LapsSection
    laps={data.laps}
    {units}
    {accentColor}
    {lapHeatColor}
/>

<SegmentsSection
    segments={data.segments}
    {units}
/>
