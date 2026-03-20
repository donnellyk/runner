<script lang="ts">
    import type { ZoneDefinition } from '@web-runner/shared';
    import type { Units } from '$lib/format';
    import ActivityChart, { type ActivityNoteRef } from '$lib/components/ActivityChart.svelte';

    interface Props {
        chartPace: number[] | null;
        chartHr: number[] | null;
        chartAlt: number[] | null;
        chartCad: number[] | null;
        chartDist: number[] | null;
        chartTime: number[] | null;
        chartPausedMask: boolean[] | null;
        xAxis: 'distance' | 'time';
        units: Units;
        crosshairIndex: number | null;
        notes: ActivityNoteRef[];
        showNotes: boolean;
        highlightedNoteId: number | null;
        paceZonesDisplay: ZoneDefinition[];
        hrZones: ZoneDefinition[];
        isAdmin: boolean;
        smoothingWindow: number;
        formatPaceSec: (sec: number) => string;
        exportPaceJson: () => void;
        oncrosshairindexchange: (index: number | null) => void;
        onxaxischange: (axis: 'distance' | 'time') => void;
        onshownoteschange: (show: boolean) => void;
    }

    let {
        chartPace,
        chartHr,
        chartAlt,
        chartCad,
        chartDist,
        chartTime,
        chartPausedMask,
        xAxis,
        units,
        crosshairIndex,
        notes,
        showNotes,
        highlightedNoteId = $bindable(),
        paceZonesDisplay,
        hrZones,
        isAdmin,
        smoothingWindow,
        formatPaceSec,
        exportPaceJson,
        oncrosshairindexchange,
        onxaxischange,
        onshownoteschange,
    }: Props = $props();
</script>

{#if chartPace || chartHr || chartAlt}
    <div class="mb-8">
        <div class="flex items-center justify-between mb-4">
            <h2
                class="text-xs font-semibold uppercase tracking-wide text-zinc-400"
            >
                Charts
            </h2>
            <div class="flex items-center gap-3">
                {#if notes.length > 0}
                    <label class="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
                        <input type="checkbox" checked={showNotes} onchange={() => onshownoteschange(!showNotes)} class="rounded border-zinc-300" />
                        Notes
                    </label>
                    <div class="w-px h-3 bg-zinc-200"></div>
                {/if}
                {#if chartPace && isAdmin}
                    <button
                        onclick={exportPaceJson}
                        class="px-2 py-1 text-xs rounded text-zinc-400 hover:bg-zinc-100 font-mono"
                        title="Download pace chart data as JSON"
                        >JSON ↓</button
                    >
                    <div class="w-px h-3 bg-zinc-200"></div>
                {/if}
                <div class="flex gap-1">
                    <button
                        onclick={() => onxaxischange("distance")}
                        class="px-2.5 py-1 text-xs rounded {xAxis === 'distance'
                            ? 'bg-zinc-900 text-white'
                            : 'text-zinc-500 hover:bg-zinc-100'}"
                    >
                        Distance
                    </button>
                    <button
                        onclick={() => onxaxischange("time")}
                        class="px-2.5 py-1 text-xs rounded {xAxis === 'time'
                            ? 'bg-zinc-900 text-white'
                            : 'text-zinc-500 hover:bg-zinc-100'}"
                    >
                        Time
                    </button>
                </div>
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
                showPauseGaps={true}
                {smoothingWindow}
                invertY={true}
                zones={paceZonesDisplay}
                zoneMetric="pace"
                {crosshairIndex}
                oncrosshairmove={(i) => oncrosshairindexchange(i)}
                {notes} {showNotes} {highlightedNoteId}
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
                oncrosshairmove={(i) => oncrosshairindexchange(i)}
                {notes} {showNotes} {highlightedNoteId}
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
                oncrosshairmove={(i) => oncrosshairindexchange(i)}
                {notes} {showNotes} {highlightedNoteId}
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
                oncrosshairmove={(i) => oncrosshairindexchange(i)}
                {notes} {showNotes} {highlightedNoteId}
            />
        {/if}
    </div>
{/if}
