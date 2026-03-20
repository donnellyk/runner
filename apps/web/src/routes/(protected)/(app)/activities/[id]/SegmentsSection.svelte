<script lang="ts">
    import {
        formatPaceValue,
        formatElevation,
        type Units,
    } from "$lib/format";

    interface Segment {
        id: number;
        segmentIndex: number;
        avgPace: number | null;
        avgHeartrate: number | null;
        avgCadence: number | null;
        elevationGain: number | null;
    }

    interface Props {
        segments: Segment[];
        units: Units;
    }

    let {
        segments,
        units,
    }: Props = $props();
</script>

{#if segments.length > 0}
    <div class="mb-8">
        <h2
            class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3"
        >
            Splits ({segments.length})
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
                    {#each segments as seg (seg.id)}
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
