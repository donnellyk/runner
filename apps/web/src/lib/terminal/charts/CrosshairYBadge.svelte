<script lang="ts">
	interface Props {
		y: number;
		padLeft: number;
		chartW: number;
		color: string;
		label: string;
		locked: boolean;
		isExistingRef: boolean;
		onaddref: () => void;
		onremoveref: () => void;
	}

	let { y, padLeft, chartW, color, label, locked, isExistingRef, onaddref, onremoveref }: Props = $props();

	let labelW = $derived(label.length * 6 + 4);
	let btnLabel = $derived(isExistingRef ? '×' : '+');
	let btnX = $derived(padLeft + chartW + 2);
	let badgeX = $derived(btnX + (locked ? 14 : 0));
</script>

{#if locked}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<g
		style="cursor: pointer; outline: none;"
		onclick={(e) => {
			e.stopPropagation();
			if (isExistingRef) onremoveref();
			else onaddref();
		}}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				if (isExistingRef) onremoveref();
				else onaddref();
			}
		}}
	>
		<rect
			x={btnX}
			y={y - 7}
			width={12}
			height={14}
			rx="2"
			fill={color}
			fill-opacity="0.85"
		/>
		<text
			x={btnX + 6}
			y={y + 3}
			text-anchor="middle"
			fill="var(--term-text-bright)"
			font-size="10"
			font-weight="bold"
			font-family="'Geist Mono', monospace"
			role="button"
			tabindex="-1">{btnLabel}</text
		>
	</g>
{/if}
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
	font-family="'Geist Mono', monospace">{label}</text
>
