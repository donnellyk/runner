<script lang="ts">
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { enhance } from "$app/forms";
    import SparkLine from "$lib/components/SparkLine.svelte";
    import CurrentWeekStrip from "$lib/components/CurrentWeekStrip.svelte";
    import {
        formatDistance,
        formatDuration,
        formatPace,
        formatElevation,
        type Units,
    } from "$lib/format";
    import { sportColor, workoutBadge } from "$lib/activity-colors";
    import { WORKOUT_TYPE_LABELS } from "@web-runner/shared";
    import { rowClick } from "$lib/ui-helpers";

    let { data } = $props();
    const units = $derived(data.user.distanceUnit as Units);
    const ms = $derived(data.mileageSummaries);

    // svelte-ignore state_referenced_locally
    let weekMode = $state(data.weekMode);
    const weekSummary = $derived(
        weekMode === "last7" ? ms.last7Days : ms.thisWeek,
    );

    let grouped = $derived.by(() => {
        const keys: string[] = [];
        const groups: Record<string, typeof data.activities> = {};
        for (const a of data.activities) {
            const key = new Date(a.startDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
            });
            if (!groups[key]) {
                keys.push(key);
                groups[key] = [];
            }
            groups[key].push(a);
        }
        return keys.map((k) => [k, groups[k]] as const);
    });

    function dayLabel(date: Date | string): string {
        return new Date(date).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        });
    }

    const activitiesPath = resolve("/activities");

    let hasFilters = $derived(
        !!(data.filters.q || data.filters.sport || data.filters.workout || data.filters.range || data.filters.distance),
    );

    function buildQuery(overrides: Record<string, string>) {
        const params: Record<string, string> = {
            q: data.filters.q,
            sport: data.filters.sport,
            workout: data.filters.workout,
            range: data.filters.range,
            distance: data.filters.distance,
            ...overrides,
        };
        return Object.entries(params)
            .filter(([, v]) => v)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join("&");
    }
</script>

<div class="mb-6">
    <h1 class="font-serif text-4xl font-semibold text-zinc-900">
        Activities
    </h1>
</div>

{#snippet mileageCard(s: typeof ms.month, clickable?: boolean)}
    {@const progressFrac = s.elapsedDays / s.periodDays}
    {@const distDisplay = formatDistance(s.totalMeters, units)}
    {@const cumulativeMeters = s.dailyMeters.reduce(
        (acc: number[], d: number) => {
            acc.push((acc.length > 0 ? acc[acc.length - 1] : 0) + d);
            return acc;
        },
        [] as number[],
    )}
    <div
        class="relative rounded-lg border border-zinc-200 bg-white px-4 py-3 overflow-hidden {clickable
            ? 'cursor-pointer hover:border-zinc-300'
            : ''}"
    >
        {#if cumulativeMeters.length > 1}
            {@const maxVal = Math.max(...cumulativeMeters, s.priorTotalMeters ?? 0, 1)}
            {@const pts = cumulativeMeters
                .map((v: number, i: number) => {
                    const x = (i / (cumulativeMeters.length - 1)) * 100;
                    const y = 40 - (v / maxVal) * 36;
                    return `${x},${y}`;
                })
                .join(" ")}
            {@const uid = `spark-${s.label.replace(/\s/g, "")}`}
            <svg
                class="absolute bottom-0 left-0"
                width="{progressFrac * 100}%"
                height="100%"
                viewBox="0 0 100 40"
                preserveAspectRatio="none"
            >
                <defs>
                    <clipPath id="{uid}-clip">
                        <polygon points="0,40 {pts} 100,40" />
                    </clipPath>
                    <linearGradient id="{uid}-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                            offset="0%"
                            stop-color="black"
                            stop-opacity="0.14"
                        />
                        <stop
                            offset="100%"
                            stop-color="black"
                            stop-opacity="0"
                        />
                    </linearGradient>
                </defs>
                <rect
                    width="100"
                    height="40"
                    fill="url(#{uid}-grad)"
                    clip-path="url(#{uid}-clip)"
                />
                <polyline
                    points={pts}
                    fill="none"
                    stroke="black"
                    stroke-opacity="0.15"
                    stroke-width="1"
                    vector-effect="non-scaling-stroke"
                />
            </svg>
        {/if}
        <div class="relative">
            <div
                class="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1"
            >
                {s.label}
            </div>
            <div
                class="font-mono text-2xl font-semibold text-zinc-900"
                style="font-variant-numeric: tabular-nums;"
            >
                {distDisplay}
            </div>
            {#if s.priorTotalMeters != null}
                <div
                    class="font-mono text-right text-xs text-zinc-400 mt-0.5"
                    style="font-variant-numeric: tabular-nums;"
                >
                    prev {formatDistance(s.priorTotalMeters, units)}
                </div>
            {/if}
        </div>
    </div>
{/snippet}

<div class="grid grid-cols-3 gap-3 mb-8">
    <form
        method="POST"
        action="?/toggleWeekMode"
        class="contents"
        use:enhance={() => {
            weekMode = weekMode === "last7" ? "thisWeek" : "last7";
            return async () => {};
        }}
    >
        <button type="submit" class="contents text-left">
            {@render mileageCard(weekSummary, true)}
        </button>
    </form>
    {@render mileageCard(ms.month)}
    {@render mileageCard(ms.year)}
</div>

{#if data.currentWeek}
    <div class="mb-8">
        <CurrentWeekStrip
            workouts={data.currentWeek.workouts}
            weekNumber={data.currentWeek.weekNumber}
            weekId={data.currentWeek.weekId}
            phase={data.currentWeek.phase}
            instanceId={data.currentWeek.instanceId}
            effortMap={data.currentWeek.effortMap}
            supplementary={data.currentWeek.supplementary}
            completions={data.currentWeek.completions}
            units={units}
        />
    </div>
{/if}

<form method="GET" class="flex flex-wrap gap-3 items-center mb-6">
    <input
        type="text"
        name="q"
        value={data.filters.q}
        placeholder="Search activities..."
        class="border border-zinc-200 rounded px-2.5 py-1.5 text-sm bg-white text-zinc-700 w-48"
        onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).form?.requestSubmit(); }}
    />

    <select
        name="sport"
        onchange={(e) =>
            (e.currentTarget.form as HTMLFormElement).requestSubmit()}
        class="border border-zinc-200 rounded px-2.5 py-1.5 text-sm bg-white text-zinc-700"
    >
        <option value="">All sports</option>
        {#each data.sportTypes as s (s)}
            <option value={s} selected={data.filters.sport === s}>{s}</option>
        {/each}
    </select>

    <select
        name="range"
        onchange={(e) =>
            (e.currentTarget.form as HTMLFormElement).requestSubmit()}
        class="border border-zinc-200 rounded px-2.5 py-1.5 text-sm bg-white text-zinc-700"
    >
        <option value="">All time</option>
        <option value="week" selected={data.filters.range === "week"}>This week</option>
        <option value="month" selected={data.filters.range === "month"}>This month</option>
        <option value="90d" selected={data.filters.range === "90d"}>Last 90 days</option>
    </select>

    <select
        name="distance"
        onchange={(e) =>
            (e.currentTarget.form as HTMLFormElement).requestSubmit()}
        class="border border-zinc-200 rounded px-2.5 py-1.5 text-sm bg-white text-zinc-700"
    >
        <option value="">Any distance</option>
        {#each data.distancePresets as p (p)}
            <option value={p} selected={data.filters.distance === p}>{p}</option>
        {/each}
    </select>

    <select
        name="workout"
        onchange={(e) =>
            (e.currentTarget.form as HTMLFormElement).requestSubmit()}
        class="border border-zinc-200 rounded px-2.5 py-1.5 text-sm bg-white text-zinc-700"
    >
        <option value="">Any type</option>
        {#each WORKOUT_TYPE_LABELS as wt (wt.value)}
            <option value={wt.value} selected={data.filters.workout === wt.value}>{wt.label}</option>
        {/each}
    </select>

    {#if hasFilters}
        <a href={activitiesPath} class="text-xs text-zinc-400 hover:text-zinc-600">Clear</a>
    {/if}
</form>

{#if hasFilters && data.totalCount != null}
    <div class="text-xs text-zinc-400 mb-4">
        {data.totalCount} result{data.totalCount !== 1 ? 's' : ''}
    </div>
{/if}

{#if grouped.length === 0}
    <p class="text-sm text-zinc-400">No activities found.</p>
{/if}

{#each grouped as [month, acts] (month)}
    <div class="mb-8">
        <div
            class="font-serif text-lg font-medium text-zinc-400 mb-3 pb-2 border-b border-zinc-100"
        >
            {month}
        </div>

        <div class="space-y-0">
            {#each acts as activity (activity.id)}
                {@const color = sportColor(activity.sportType)}
                {@const badge = workoutBadge(activity.workoutType)}
                <div
                    class="flex items-center justify-between py-3 border-b border-zinc-50 cursor-pointer hover:bg-zinc-50 -mx-2 px-2 rounded"
                    style="border-left: 3px solid {color};"
                    onclick={(e) =>
                        rowClick(e, resolve(`/activities/${activity.id}`))}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) =>
                        e.key === "Enter" &&
                        goto(resolve(`/activities/${activity.id}`))}
                >
                    <div class="min-w-0 flex-1">
                        <div class="flex items-baseline gap-2">
                            <span
                                class="text-xs text-zinc-400 w-24 shrink-0 font-mono"
                                style="font-variant-numeric: tabular-nums;"
                            >
                                {dayLabel(activity.startDate)}
                            </span>
                            <span
                                class="text-sm font-medium text-zinc-900 truncate"
                                >{activity.name}</span
                            >
                            {#if badge}
                                <span
                                    class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                    style="background: {badge.bg}; color: {badge.fg};"
                                    >{badge.label}</span
                                >
                            {/if}
                        </div>
                        <div
                            class="flex items-center gap-2 mt-0.5 pl-27 font-mono text-xs text-zinc-400"
                            style="padding-left: 6.5rem; font-variant-numeric: tabular-nums;"
                        >
                            {#if activity.distance}
                                <span
                                    >{formatDistance(
                                        activity.distance,
                                        units,
                                    )}</span
                                >
                                <span class="text-zinc-200">·</span>
                            {/if}
                            {#if activity.movingTime}
                                <span
                                    >{formatDuration(activity.movingTime)}</span
                                >
                            {/if}
                            {#if activity.averageSpeed}
                                <span class="text-zinc-200">·</span>
                                <span
                                    >{formatPace(
                                        activity.averageSpeed,
                                        units,
                                    )}</span
                                >
                            {/if}
                            {#if activity.averageHeartrate}
                                <span class="text-zinc-200">·</span>
                                <span
                                    >{Math.round(activity.averageHeartrate)} bpm</span
                                >
                            {/if}
                            {#if activity.totalElevationGain && activity.totalElevationGain > 5}
                                <span class="text-zinc-200">·</span>
                                <span
                                    >+{formatElevation(
                                        activity.totalElevationGain,
                                        units,
                                    )}</span
                                >
                            {/if}
                        </div>
                    </div>

                    {#if activity.sparkline && activity.sparkline.length > 1}
                        <div class="ml-4 shrink-0 opacity-60">
                            <SparkLine
                                data={activity.sparkline}
                                {color}
                                width={64}
                                height={20}
                            />
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
{/each}

{#if data.nextCursor}
    <div class="mt-4">
        <a
            href="{activitiesPath}?{buildQuery({ cursor: data.nextCursor })}"
            class="text-sm text-zinc-500 hover:text-zinc-900"
        >
            Load more
        </a>
    </div>
{/if}
