<script lang="ts">
	interface RefLine {
		value: number;
		label: string;
	}

	interface Props {
		refLines: RefLine[];
		toY: (v: number) => number;
		padTop: number;
		padLeft: number;
		chartW: number;
		chartH: number;
		color: string;
		onremove: (index: number) => void;
		refLineDrag: (node: SVGElement, idx: number) => { update: (v: number) => void; destroy: () => void };
	}

	let { refLines, toY, padTop, padLeft, chartW, chartH, color, onremove, refLineDrag }: Props = $props();
</script>

{#each refLines as ref, ri (ri)}
	{@const ry = toY(ref.value)}
	{#if ry >= padTop && ry <= padTop + chartH}
		{@const rlw = ref.label.length * 6 + 4}
		{@const btnX = padLeft + chartW + 2}
		{@const badgeX = btnX + 14}
		<line
			x1={padLeft}
			y1={ry}
			x2={padLeft + chartW}
			y2={ry}
			stroke={color}
			stroke-width="1"
			stroke-opacity="0.6"
		/>
		<g
			use:refLineDrag={ri}
			style="cursor: ns-resize;"
		>
			<rect
				x={padLeft}
				y={ry - 5}
				width={chartW + rlw + 16}
				height={14}
				fill="transparent"
			/>
			<rect
				x={badgeX}
				y={ry - 7}
				width={rlw}
				height={14}
				rx="2"
				fill={color}
				fill-opacity="0.5"
			/>
			<text
				x={badgeX + 2}
				y={ry + 3}
				text-anchor="start"
				fill="var(--term-text-bright)"
				font-size="10"
				font-weight="500"
				font-family="'Geist Mono', monospace"
			>{ref.label}</text>
		</g>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g
			style="cursor: pointer; outline: none;"
			onclick={(e) => {
				e.stopPropagation();
				onremove(ri);
			}}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					e.stopPropagation();
					onremove(ri);
				}
			}}
		>
			<rect
				x={btnX}
				y={ry - 7}
				width={12}
				height={14}
				rx="2"
				fill={color}
				fill-opacity="0.5"
			/>
			<text
				x={btnX + 6}
				y={ry + 3}
				text-anchor="middle"
				fill="var(--term-text-bright)"
				font-size="10"
				font-weight="bold"
				font-family="'Geist Mono', monospace"
				role="button"
				tabindex="-1">×</text
			>
		</g>
	{/if}
{/each}
