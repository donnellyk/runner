<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ChartDimensions } from '../shared/chart-dimensions.svelte';

	interface Props {
		dims: ChartDimensions;
		label: string;
		cursorStyle?: string;
		onmousedown?: (e: MouseEvent) => void;
		onmousemove?: (e: MouseEvent) => void;
		onmouseup?: (e: MouseEvent) => void;
		onclick?: (e: MouseEvent) => void;
		onmouseleave?: (e: MouseEvent) => void;
		onkeydown?: (e: KeyboardEvent) => void;
		header: Snippet;
		overlay?: Snippet;
		content: Snippet;
	}

	let {
		dims,
		label,
		cursorStyle = '',
		onmousedown,
		onmousemove,
		onmouseup,
		onclick,
		onmouseleave,
		onkeydown,
		header,
		overlay,
		content,
	}: Props = $props();
</script>

<div class="relative w-full h-full flex flex-col" style="min-height: 0;">
	<div class="flex items-baseline justify-end px-2 py-1 shrink-0">
		<span
			class="text-[12px]"
			style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums;"
		>
			{@render header()}
		</span>
	</div>

	<div
		class="flex-1 w-full"
		style="min-height: 0;{cursorStyle ? ` cursor: ${cursorStyle};` : ''}"
		role="toolbar"
		aria-label={label}
		tabindex="0"
		{onmousedown}
		{onmousemove}
		{onmouseup}
		{onclick}
		{onmouseleave}
		{onkeydown}
	>
		<svg
			bind:this={dims.svgEl}
			class="w-full h-full"
			preserveAspectRatio="none"
			viewBox="0 0 {dims.svgWidth} {dims.svgHeight}"
			aria-hidden="true"
			style="display: block;"
		>
			{@render content()}
		</svg>
	</div>

	{#if overlay}
		{@render overlay()}
	{/if}
</div>
