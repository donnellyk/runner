<script lang="ts">
	import { formatDistance } from '$lib/format.js';
	import type { Units } from '$lib/format.js';

	interface Props {
		name: string;
		category: string;
		targetDistanceMin: number | null;
		targetDistanceMax: number | null;
		effort: string | null;
		matchStatus: 'matched' | 'auto' | 'manual' | 'suggested' | 'close' | 'off' | 'upcoming' | 'skipped' | null;
		units: Units;
		compact?: boolean;
		onclick?: () => void;
	}

	let {
		name,
		targetDistanceMin,
		targetDistanceMax,
		effort,
		matchStatus,
		units,
		compact = false,
		onclick,
	}: Props = $props();

	const distanceText = $derived.by(() => {
		if (!targetDistanceMin && !targetDistanceMax) return null;
		const min = targetDistanceMin;
		const max = targetDistanceMax;
		if (min && max && min !== max) {
			return `${formatDistance(min, units)}–${formatDistance(max, units)}`;
		}
		return formatDistance(min ?? max, units);
	});

	const matchIndicator = $derived.by(() => {
		switch (matchStatus) {
			case 'auto':
			case 'manual':
			case 'matched':
				return { dot: 'bg-green-500', title: 'Matched' };
			case 'suggested':
			case 'close':
				return { dot: 'bg-yellow-400', title: 'Suggested match' };
			case 'off':
				return { dot: 'bg-red-400', title: 'Off target' };
			case 'skipped':
				return { dot: 'bg-zinc-300 border border-dashed border-zinc-400', title: 'Skipped' };
			default:
				return null;
		}
	});

	const isCompleted = $derived(matchStatus === 'auto' || matchStatus === 'manual' || matchStatus === 'matched');
	const BASE_CLASSES = $derived(
		isCompleted
			? 'flex flex-col gap-0.5 rounded border border-green-200 bg-green-50 px-1.5 py-1 text-left w-full overflow-hidden'
			: 'flex flex-col gap-0.5 rounded border border-zinc-200 bg-white px-1.5 py-1 text-left w-full overflow-hidden',
	);
	const CLICKABLE_CLASSES = 'cursor-pointer hover:border-zinc-400 hover:bg-zinc-50 transition-colors';
</script>

{#snippet cardContent()}
	<div class="flex items-center justify-between gap-1 min-w-0">
		<div class="flex items-center gap-1 min-w-0">
			<span class="truncate text-[11px] font-medium leading-tight text-zinc-800">{name}</span>
		</div>
		{#if matchIndicator}
			<span
				class="shrink-0 size-2 rounded-full {matchIndicator.dot}"
				title={matchIndicator.title}
			></span>
		{/if}
	</div>
	{#if !compact}
		{#if distanceText}
			<span class="text-[10px] leading-tight text-zinc-500 truncate font-mono">{distanceText}</span>
		{/if}
		{#if effort}
			<span class="text-[10px] leading-tight text-zinc-400 truncate italic">{effort}</span>
		{/if}
	{/if}
{/snippet}

{#if onclick}
	<button type="button" class="{BASE_CLASSES} {CLICKABLE_CLASSES}" {onclick}>
		{@render cardContent()}
	</button>
{:else}
	<div class={BASE_CLASSES}>
		{@render cardContent()}
	</div>
{/if}
