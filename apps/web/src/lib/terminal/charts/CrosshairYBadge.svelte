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

	const PAD_X = 4;
	const PAD_Y = 3;

	let textEl = $state<SVGTextElement | null>(null);
	let textW = $state(0);

	$effect(() => {
		// Re-measure whenever label changes
		void label;
		if (textEl) textW = textEl.getComputedTextLength();
	});

	let labelW = $derived(textW + PAD_X * 2);
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
			y={y - PAD_Y - 7}
			width={labelW}
			height={14 + PAD_Y * 2}
			rx="2"
			fill={color}
			fill-opacity="0.85"
		/>
		<text
			bind:this={textEl}
			x={showIcon ? badgeX + labelW / 2 : badgeX + PAD_X}
			y={y + 3}
			text-anchor={showIcon ? 'middle' : 'start'}
			fill="var(--term-text-bright)"
			font-size="11"
			font-weight={showIcon ? 'bold' : '500'}
			font-family="'Geist Mono', monospace"
		>{showIcon ? iconLabel : label}</text>
	</g>
{:else}
	<rect
		x={badgeX}
		y={y - PAD_Y - 7}
		width={labelW}
		height={14 + PAD_Y * 2}
		rx="2"
		fill={color}
		fill-opacity="0.85"
	/>
	<text
		bind:this={textEl}
		x={badgeX + PAD_X}
		y={y + 3}
		text-anchor="start"
		fill="var(--term-text-bright)"
		font-size="11"
		font-weight="500"
		font-family="'Geist Mono', monospace"
	>{label}</text>
{/if}
