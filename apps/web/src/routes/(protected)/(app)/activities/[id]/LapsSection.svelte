<script lang="ts">
    import LapsChart from "$lib/components/LapsChart.svelte";
    import {
        formatPace,
        formatDistancePrecise,
        formatDurationClock,
        type Units,
    } from "$lib/format";

    interface Lap {
        id: number;
        lapIndex: number;
        distance: number | null;
        movingTime: number | null;
        averageSpeed: number | null;
        averageHeartrate: number | null;
        averageCadence: number | null;
    }

    interface Props {
        laps: Lap[];
        units: Units;
        accentColor: string;
        lapHeatColor: (speed: number | null) => string;
    }

    let {
        laps,
        units,
        accentColor,
        lapHeatColor,
    }: Props = $props();
</script>

{#if laps.length > 0}
    <div class="mb-8">
        <h2
            class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3"
        >
            Laps ({laps.length})
        </h2>
        <LapsChart {laps} {units} color={accentColor} />
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
                    {#each laps as lap (lap.id)}
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
