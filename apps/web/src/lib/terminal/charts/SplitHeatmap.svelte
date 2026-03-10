<script lang="ts">
	import type { Units } from '$lib/format';
	import { formatPaceValue, M_TO_FT } from '$lib/format';
	import type { ActivitySegment } from '../terminal-state.svelte';

	interface Props {
		segments: ActivitySegment[];
		units?: Units;
		crosshairIndex?: number | null;
		oncrosshairmove?: (index: number | null) => void;
	}

	let {
		segments,
		units = 'metric',
		crosshairIndex = null,
		oncrosshairmove,
	}: Props = $props();

	const metrics = ['pace', 'hr', 'cadence', 'elevation'] as const;
	type Metric = (typeof metrics)[number];

	const METRIC_LABELS: Record<Metric, string> = {
		pace: 'Pace',
		hr: 'HR',
		cadence: 'Cad',
		elevation: 'Elev',
	};

	function getMetricValue(seg: ActivitySegment, metric: Metric): number | null {
		switch (metric) {
			case 'pace': return seg.avgPace != null && seg.avgPace > 0 ? seg.avgPace : null;
			case 'hr': return seg.avgHeartrate;
			case 'cadence': return seg.avgCadence ? seg.avgCadence * 2 : null;
			case 'elevation': return seg.elevationGain;
		}
	}

	let ranges = $derived.by(() => {
		const result: Record<Metric, { min: number; max: number } | null> = {
			pace: null, hr: null, cadence: null, elevation: null,
		};
		for (const metric of metrics) {
			const vals = segments.map((s) => getMetricValue(s, metric)).filter((v): v is number => v != null && v > 0);
			if (vals.length >= 2) {
				result[metric] = { min: Math.min(...vals), max: Math.max(...vals) };
			}
		}
		return result;
	});

	function heatColor(metric: Metric, value: number | null): string {
		if (value == null || value <= 0) return 'transparent';
		const range = ranges[metric];
		if (!range || range.max === range.min) return 'var(--term-zone-3-solid)';
		let t = (value - range.min) / (range.max - range.min);
		if (metric === 'pace') t = 1 - t;
		const colors = ['#60a5fa', '#2dd4a8', '#eab308', '#f97316', '#ef4444'];
		const idx = Math.min(Math.floor(t * colors.length), colors.length - 1);
		return colors[idx];
	}

	function formatMetricValue(metric: Metric, value: number | null): string {
		if (value == null || value <= 0) return '—';
		switch (metric) {
			case 'pace': return formatPaceValue(value, units);
			case 'hr': return `${Math.round(value)}`;
			case 'cadence': return `${Math.round(value)}`;
			case 'elevation': return `+${Math.round(units === 'imperial' ? value * M_TO_FT : value)}`;
		}
	}

	function handleClick(i: number) {
		oncrosshairmove?.(i);
	}
</script>

<div class="relative w-full h-full flex flex-col overflow-auto" style="min-height: 0;">
	<div class="flex items-baseline justify-end px-2 py-1 shrink-0">
		<span class="text-[11px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">
			{segments.length} splits
		</span>
	</div>

	<div class="flex-1 overflow-auto px-1 pb-1" style="min-height: 0;">
		<table class="w-full border-collapse" style="font-family: 'Geist Mono', monospace; font-size: 9px;">
			<thead>
				<tr>
					<th class="px-1 py-0.5 text-left" style="color: var(--term-text-muted); font-weight: normal;">#</th>
					{#each segments as seg (seg.id)}
						<th
							class="px-1 py-0.5 text-center cursor-pointer"
							style="color: {crosshairIndex === seg.segmentIndex ? 'var(--term-text-bright)' : 'var(--term-text-muted)'}; font-weight: normal;"
							onclick={() => handleClick(seg.segmentIndex)}
						>{seg.segmentIndex + 1}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each metrics as metric (metric)}
					{@const range = ranges[metric]}
					{#if range}
						<tr>
							<td class="px-1 py-0.5" style="color: var(--term-text-muted);">{METRIC_LABELS[metric]}</td>
							{#each segments as seg (seg.id)}
								{@const val = getMetricValue(seg, metric)}
								<td
									class="px-1 py-0.5 text-center"
									style="background: {heatColor(metric, val)}33; color: var(--term-text-bright); border: 1px solid {crosshairIndex === seg.segmentIndex ? 'var(--term-text-muted)' : 'transparent'};"
									title={formatMetricValue(metric, val)}
								>
									{val != null && val > 0 ? '' : '—'}
								</td>
							{/each}
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
</div>
