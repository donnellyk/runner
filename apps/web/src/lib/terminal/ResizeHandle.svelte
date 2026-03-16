<script lang="ts">
	import type { ResizeEdge } from './grid-interaction.svelte';

	let {
		panelIndex,
		onresizestart,
	}: {
		panelIndex: number;
		onresizestart: (panelIndex: number, edge: ResizeEdge, pointerId: number) => void;
	} = $props();
</script>

<!-- Edges -->
<div
	role="separator"
	aria-orientation="horizontal"
	class="resize-handle resize-top"
	onpointerdown={(e) => onresizestart(panelIndex, 'top', e.pointerId)}
></div>

<div
	role="separator"
	aria-orientation="horizontal"
	class="resize-handle resize-bottom"
	onpointerdown={(e) => onresizestart(panelIndex, 'bottom', e.pointerId)}
></div>

<div
	role="separator"
	aria-orientation="vertical"
	class="resize-handle resize-left"
	onpointerdown={(e) => onresizestart(panelIndex, 'left', e.pointerId)}
></div>

<div
	role="separator"
	aria-orientation="vertical"
	class="resize-handle resize-right"
	onpointerdown={(e) => onresizestart(panelIndex, 'right', e.pointerId)}
></div>

<!-- Corners -->
<div
	role="separator"
	class="resize-handle resize-corner resize-top-left"
	onpointerdown={(e) => onresizestart(panelIndex, 'top-left', e.pointerId)}
></div>

<div
	role="separator"
	class="resize-handle resize-corner resize-top-right"
	onpointerdown={(e) => onresizestart(panelIndex, 'top-right', e.pointerId)}
></div>

<div
	role="separator"
	class="resize-handle resize-corner resize-bottom-left"
	onpointerdown={(e) => onresizestart(panelIndex, 'bottom-left', e.pointerId)}
></div>

<div
	role="separator"
	class="resize-handle resize-corner resize-bottom-right"
	onpointerdown={(e) => onresizestart(panelIndex, 'bottom-right', e.pointerId)}
></div>

<style>
	.resize-handle {
		position: absolute;
		z-index: 5;
	}

	/* Edge handles */
	.resize-top {
		top: 0;
		left: 8px;
		right: 8px;
		height: 8px;
		cursor: row-resize;
	}

	.resize-bottom {
		bottom: 0;
		left: 8px;
		right: 8px;
		height: 8px;
		cursor: row-resize;
	}

	.resize-left {
		top: 8px;
		left: 0;
		width: 8px;
		bottom: 8px;
		cursor: col-resize;
	}

	.resize-right {
		top: 8px;
		right: 0;
		width: 8px;
		bottom: 8px;
		cursor: col-resize;
	}

	/* Hover indicators for edges */
	.resize-top::after,
	.resize-bottom::after,
	.resize-left::after,
	.resize-right::after {
		content: '';
		position: absolute;
		background: var(--term-border);
		opacity: 0;
		transition: opacity 150ms;
	}

	.resize-top::after {
		top: 3px;
		left: 0;
		right: 0;
		height: 2px;
	}

	.resize-bottom::after {
		bottom: 3px;
		left: 0;
		right: 0;
		height: 2px;
	}

	.resize-left::after {
		left: 3px;
		top: 0;
		bottom: 0;
		width: 2px;
	}

	.resize-right::after {
		right: 3px;
		top: 0;
		bottom: 0;
		width: 2px;
	}

	.resize-top:hover::after,
	.resize-bottom:hover::after,
	.resize-left:hover::after,
	.resize-right:hover::after {
		opacity: 1;
	}

	/* Corner handles */
	.resize-corner {
		width: 8px;
		height: 8px;
	}

	.resize-top-left {
		top: 0;
		left: 0;
		cursor: nwse-resize;
	}

	.resize-top-right {
		top: 0;
		right: 0;
		cursor: nesw-resize;
	}

	.resize-bottom-left {
		bottom: 0;
		left: 0;
		cursor: nesw-resize;
	}

	.resize-bottom-right {
		bottom: 0;
		right: 0;
		cursor: nwse-resize;
	}
</style>
