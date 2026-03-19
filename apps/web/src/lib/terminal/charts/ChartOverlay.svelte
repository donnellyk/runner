<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		left: number;
		top?: number;
		children: Snippet;
	}

	let { left, top = 30, children }: Props = $props();
</script>

<div
	class="absolute pointer-events-none"
	style="
		left: {left}px;
		top: {top}px;
		background: rgba(22, 27, 44, 0.88);
		backdrop-filter: blur(12px);
		border: 1px solid var(--term-border);
		border-radius: 4px;
		padding: 6px 10px;
		font-family: 'Geist Mono', monospace;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		z-index: 10;
		white-space: nowrap;
	"
>
	{@render children()}
</div>
