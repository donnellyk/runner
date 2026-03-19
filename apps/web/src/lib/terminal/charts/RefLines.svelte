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
		onrefmousedown: (index: number, e: MouseEvent) => void;
	}

	let { refLines, toY, padTop, padLeft, chartW, chartH, color, onrefmousedown }: Props = $props();

	let hoveredIdx = $state<number | null>(null);
</script>

{#each refLines as ref, ri (ri)}
	{@const ry = toY(ref.value)}
	{#if ry >= padTop && ry <= padTop + chartH}
		{@const rlw = ref.label.length * 6 + 4}
		{@const badgeX = padLeft + chartW + 2}
		{@const isHovered = hoveredIdx === ri}
		<line
			x1={padLeft}
			y1={ry}
			x2={padLeft + chartW}
			y2={ry}
			stroke={color}
			stroke-width="1"
			stroke-opacity="0.6"
		/>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g
			style="cursor: ns-resize;"
			onmousedown={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onrefmousedown(ri, e);
			}}
		>
			<rect
				x={padLeft}
				y={ry - 5}
				width={chartW}
				height={14}
				fill="transparent"
			/>
		</g>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<g
			style="cursor: pointer; outline: none;"
			onmouseenter={() => { hoveredIdx = ri; }}
			onmouseleave={() => { hoveredIdx = null; }}
			onmousedown={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onrefmousedown(ri, e);
			}}
		>
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
				x={isHovered ? badgeX + rlw / 2 : badgeX + 2}
				y={ry + 3}
				text-anchor={isHovered ? 'middle' : 'start'}
				fill="var(--term-text-bright)"
				font-size="11"
				font-weight={isHovered ? 'bold' : '500'}
				font-family="'Geist Mono', monospace"
			>{isHovered ? '×' : ref.label}</text>
		</g>
	{/if}
{/each}
