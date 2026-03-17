<script lang="ts">
	interface Props {
		y: number;
		padLeft: number;
		chartW: number;
		color: string;
		label: string;
		locked: boolean;
		isExistingRef: boolean;
		dragging?: boolean;
		onbadgemousedown?: (e: MouseEvent) => void;
	}

	let { y, padLeft, chartW, color, label, locked, isExistingRef, dragging = false, onbadgemousedown }: Props = $props();

	let labelW = $derived(label.length * 6 + 4);
	let badgeX = $derived(padLeft + chartW + 2);
	let hovered = $state(false);
	let showIcon = $derived(locked && hovered && !dragging);
	let iconLabel = $derived(isExistingRef ? '×' : '+');
</script>

{#if locked}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<g
		style="cursor: {dragging ? 'ns-resize' : 'pointer'}; outline: none;"
		onmouseenter={() => { hovered = true; }}
		onmouseleave={() => { hovered = false; }}
		onmousedown={(e) => {
			e.preventDefault();
			e.stopPropagation();
			onbadgemousedown?.(e);
		}}
	>
		<rect
			x={badgeX}
			y={y - 7}
			width={labelW}
			height={14}
			rx="2"
			fill={color}
			fill-opacity="0.85"
		/>
		<text
			x={showIcon ? badgeX + labelW / 2 : badgeX + 2}
			y={y + 3}
			text-anchor={showIcon ? 'middle' : 'start'}
			fill="var(--term-text-bright)"
			font-size="10"
			font-weight={showIcon ? 'bold' : '500'}
			font-family="'Geist Mono', monospace"
		>{showIcon ? iconLabel : label}</text>
	</g>
{:else}
	<rect
		x={badgeX}
		y={y - 7}
		width={labelW}
		height={14}
		rx="2"
		fill={color}
		fill-opacity="0.85"
	/>
	<text
		x={badgeX + 2}
		y={y + 3}
		text-anchor="start"
		fill="var(--term-text-bright)"
		font-size="10"
		font-weight="500"
		font-family="'Geist Mono', monospace"
	>{label}</text>
{/if}
