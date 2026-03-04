<script lang="ts">
	interface Props {
		data: number[];
		label: string;
		color?: string;
		unit?: string;
		svgWidth: number;
	}

	let { data, label, color = '#6b7280', unit = '', svgWidth }: Props = $props();

	const height = 80;
	const padding = 2;

	let points = $derived.by(() => {
		if (data.length === 0) return '';
		const min = Math.min(...data);
		const max = Math.max(...data);
		const range = max - min || 1;
		const step = (svgWidth - padding * 2) / (data.length - 1);
		return data
			.map((v, i) => {
				const x = padding + i * step;
				const y = height - padding - ((v - min) / range) * (height - padding * 2);
				return `${x},${y}`;
			})
			.join(' ');
	});

	let min = $derived(Math.min(...data));
	let max = $derived(Math.max(...data));

	function fmt(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(1);
	}
</script>

<div class="mb-2">
	<div class="flex items-baseline gap-2 mb-1">
		<span class="text-sm font-medium">{label}</span>
		<span class="text-xs text-zinc-400">{fmt(min)}{unit} – {fmt(max)}{unit}</span>
	</div>
	<svg width={svgWidth} viewBox="0 0 {svgWidth} {height}" style="height: {height}px; display: block;">
		<polyline
			{points}
			fill="none"
			stroke={color}
			stroke-width="1.5"
		/>
	</svg>
</div>
