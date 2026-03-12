<script lang="ts">
	interface Props {
		labels: { value: number; y: number }[];
		formatLabel: (v: number) => string;
		padLeft: number;
		chartW: number;
	}

	let { labels, formatLabel, padLeft, chartW }: Props = $props();
</script>

{#each labels as lbl, i (i)}
	<line
		x1={padLeft}
		y1={lbl.y}
		x2={padLeft + chartW}
		y2={lbl.y}
		stroke="var(--term-grid)"
		stroke-width="1"
	/>
	<text
		x={padLeft + chartW + 4}
		y={lbl.y + 3}
		text-anchor="start"
		fill="var(--term-text-muted)"
		font-size="10"
		font-family="'Geist Mono', monospace"
	>{formatLabel(lbl.value)}</text>
{/each}
