<script lang="ts">
	import { GRID_COLS, GRID_ROWS } from './grid-validation';

	let {
		visible,
		snapPanel = null,
		affectedPanels = [],
		blocked = false,
	}: {
		visible: boolean;
		snapPanel: { col: number; row: number; colSpan: number; rowSpan: number } | null;
		affectedPanels?: { col: number; row: number; colSpan: number; rowSpan: number }[];
		blocked?: boolean;
	} = $props();

	const cols = GRID_COLS;
	const rows = GRID_ROWS;
	const colLines = Array.from({ length: cols + 1 }, (_, i) => i);
	const rowLines = Array.from({ length: rows + 1 }, (_, i) => i);

	let lineColor = $derived(blocked ? 'rgba(255, 85, 85, 0.35)' : 'rgba(139, 233, 253, 0.4)');
	let rectStroke = $derived(blocked ? 'rgba(255, 85, 85, 0.8)' : 'rgba(80, 250, 123, 0.6)');
	let rectFill = $derived(blocked ? 'rgba(255, 85, 85, 0.06)' : 'rgba(80, 250, 123, 0.08)');
</script>

<svg
	class="grid-overlay"
	style:opacity={visible ? 1 : 0}
	xmlns="http://www.w3.org/2000/svg"
>
	{#if visible}
		{#each colLines as c (c)}
			<line
				x1="{(c / cols) * 100}%"
				y1="0%"
				x2="{(c / cols) * 100}%"
				y2="100%"
				stroke={lineColor}
				stroke-width="1"
				stroke-dasharray="3 3"
			/>
		{/each}
		{#each rowLines as r (r)}
			<line
				x1="0%"
				y1="{(r / rows) * 100}%"
				x2="100%"
				y2="{(r / rows) * 100}%"
				stroke={lineColor}
				stroke-width="1"
				stroke-dasharray="3 3"
			/>
		{/each}

		{#each affectedPanels as ap (`${ap.col}-${ap.row}`)}
			<rect
				class="snap-rect"
				style="
					x: {(ap.col / cols) * 100}%;
					y: {(ap.row / rows) * 100}%;
					width: {(ap.colSpan / cols) * 100}%;
					height: {(ap.rowSpan / rows) * 100}%;
				"
				stroke="rgba(255, 183, 77, 0.8)"
				stroke-dasharray="4 2"
				fill="rgba(255, 183, 77, 0.06)"
				stroke-width="1.5"
			/>
		{/each}

		{#if snapPanel}
			<rect
				class="snap-rect"
				style="
					x: {(snapPanel.col / cols) * 100}%;
					y: {(snapPanel.row / rows) * 100}%;
					width: {(snapPanel.colSpan / cols) * 100}%;
					height: {(snapPanel.rowSpan / rows) * 100}%;
				"
				stroke={rectStroke}
				stroke-dasharray="4 2"
				fill={rectFill}
				stroke-width="1.5"
			/>
		{/if}

	{/if}
</svg>

<style>
	.grid-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 10;
		pointer-events: none;
		transition: opacity 150ms;
	}

	.grid-overlay line {
		transition: stroke 150ms;
	}

	.snap-rect {
		transition: x 100ms ease-out, y 100ms ease-out, width 100ms ease-out, height 100ms ease-out,
			stroke 150ms, fill 150ms;
	}
</style>
