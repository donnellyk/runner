<script lang="ts">
	interface Props {
		x: number | null;
		locked: boolean;
		padTop: number;
		chartH: number;
		// Optional horizontal crosshair
		y?: number | null;
		padLeft?: number;
		chartW?: number;
		// Optional Y-axis badge
		badgeLabel?: string | null;
		badgeColor?: string;
	}

	let {
		x,
		locked,
		padTop,
		chartH,
		y = null,
		padLeft = 0,
		chartW = 0,
		badgeLabel = null,
		badgeColor = '',
	}: Props = $props();

	let dashStyle = $derived(locked ? undefined : '3,2');
</script>

{#if x != null}
	<line
		x1={x}
		y1={padTop}
		x2={x}
		y2={padTop + chartH}
		stroke="var(--term-crosshair)"
		stroke-width="1"
		stroke-dasharray={dashStyle}
	/>

	{#if y != null}
		<line
			x1={padLeft}
			y1={y}
			x2={padLeft + chartW}
			y2={y}
			stroke="var(--term-crosshair)"
			stroke-width="1"
			stroke-dasharray={dashStyle}
		/>

		{#if badgeLabel != null}
			{@const labelW = badgeLabel.length * 6 + 4}
			<rect
				x={padLeft + chartW + 2}
				y={y - 7}
				width={labelW}
				height={14}
				rx="2"
				fill={badgeColor}
				fill-opacity="0.85"
			/>
			<text
				x={padLeft + chartW + 4}
				y={y + 3}
				text-anchor="start"
				fill="var(--term-text-bright)"
				font-size="10"
				font-weight="500"
				font-family="'Geist Mono', monospace"
			>{badgeLabel}</text>
		{/if}
	{/if}
{/if}
