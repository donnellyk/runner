<script lang="ts">
	interface Props {
		data: number[];
		color?: string;
		width?: number;
		height?: number;
	}

	let { data, color = '#a1a1aa', width = 64, height = 20 }: Props = $props();

	let points = $derived.by(() => {
		const start = data.findIndex((v) => v !== 0);
		const d = start > 0 ? data.slice(start) : data;
		if (d.length < 2) return '';
		const min = Math.min(...d);
		const max = Math.max(...d);
		const range = max - min || 1;
		const step = width / (d.length - 1);
		return d
			.map((v, i) => {
				const x = i * step;
				const y = height - ((v - min) / range) * height;
				return `${x},${y}`;
			})
			.join(' ');
	});
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" style="display: block; overflow: visible;">
	<polyline {points} fill="none" stroke={color} stroke-width="1.5" stroke-linejoin="round" />
</svg>
