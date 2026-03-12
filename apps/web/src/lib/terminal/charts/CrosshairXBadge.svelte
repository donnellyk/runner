<script lang="ts">
	interface Props {
		x: number;
		label: string;
		color: string;
		padLeft: number;
		chartW: number;
		svgHeight: number;
	}

	let { x, label, color, padLeft, chartW, svgHeight }: Props = $props();

	let labelW = $derived(label.length * 6 + 8);
	let clampedX = $derived(Math.min(Math.max(x, padLeft + labelW / 2), padLeft + chartW - labelW / 2));
</script>

<rect
	x={clampedX - labelW / 2}
	y={svgHeight - 17}
	width={labelW}
	height={15}
	rx="2"
	fill={color}
	fill-opacity="0.85"
/>
<text
	x={clampedX}
	y={svgHeight - 5}
	text-anchor="middle"
	fill="var(--term-text-bright)"
	font-size="10"
	font-weight="500"
	font-family="'Geist Mono', monospace">{label}</text
>
