<script lang="ts">
	interface Props {
		labels: { x: number; label: string }[];
		svgHeight: number;
	}

	let { labels, svgHeight }: Props = $props();
</script>

{#each labels as lbl, i (i)}
	<text
		x={lbl.x}
		y={svgHeight - 4}
		text-anchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
		fill="var(--term-text-muted)"
		font-size="11"
		font-family="'Geist Mono', monospace"
	>{lbl.label}</text>
{/each}
