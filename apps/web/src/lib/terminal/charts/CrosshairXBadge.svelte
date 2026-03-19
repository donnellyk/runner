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

	const PAD_X = 6;
	const PAD_Y = 3;

	let textEl = $state<SVGTextElement | null>(null);
	let textW = $state(0);

	$effect(() => {
		void label;
		if (textEl) textW = textEl.getComputedTextLength();
	});

	let labelW = $derived(textW + PAD_X * 2);
	let clampedX = $derived(Math.min(Math.max(x, padLeft + labelW / 2), padLeft + chartW - labelW / 2));
</script>

<rect
	x={clampedX - labelW / 2}
	y={svgHeight - 14 - PAD_Y * 2}
	width={labelW}
	height={14 + PAD_Y * 2}
	rx="2"
	fill={color}
	fill-opacity="0.85"
/>
<text
	bind:this={textEl}
	x={clampedX}
	y={svgHeight - 5}
	text-anchor="middle"
	fill="var(--term-text-bright)"
	font-size="11"
	font-weight="500"
	font-family="'Geist Mono', monospace">{label}</text
>
