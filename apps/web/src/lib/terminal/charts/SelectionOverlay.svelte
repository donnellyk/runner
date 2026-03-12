<script lang="ts">
	interface Props {
		rect: { x: number; y: number; width: number; height: number };
		mode: 'horizontal' | 'vertical';
		padTop: number;
		padLeft: number;
		chartW: number;
		chartH: number;
		clipPath?: string;
	}

	let { rect, mode, padTop, padLeft, chartW, chartH, clipPath }: Props = $props();
</script>

<rect
	x={rect.x}
	y={rect.y}
	width={rect.width}
	height={rect.height}
	fill="var(--term-selection)"
	clip-path={clipPath}
/>
{#if mode === 'horizontal'}
	<line
		x1={rect.x}
		y1={padTop}
		x2={rect.x}
		y2={padTop + chartH}
		stroke="var(--term-selection-border)"
		stroke-width="1"
	/>
	<line
		x1={rect.x + rect.width}
		y1={padTop}
		x2={rect.x + rect.width}
		y2={padTop + chartH}
		stroke="var(--term-selection-border)"
		stroke-width="1"
	/>
{:else}
	<line
		x1={padLeft}
		y1={rect.y}
		x2={padLeft + chartW}
		y2={rect.y}
		stroke="var(--term-selection-border)"
		stroke-width="1"
	/>
	<line
		x1={padLeft}
		y1={rect.y + rect.height}
		x2={padLeft + chartW}
		y2={rect.y + rect.height}
		stroke="var(--term-selection-border)"
		stroke-width="1"
	/>
{/if}
