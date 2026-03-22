<script lang="ts">
	import { COLOR_PALETTE } from './terminal-state.svelte';

	interface Props {
		color: string;
		onchange: (color: string) => void;
	}

	let { color, onchange }: Props = $props();

	let open = $state(false);
	let dotEl = $state<HTMLElement | null>(null);

	function toggle(e: MouseEvent) {
		e.stopPropagation();
		open = !open;
	}

	function select(c: string) {
		onchange(c);
		open = false;
	}

	function handleWindowClick() {
		if (open) open = false;
	}
</script>

<svelte:window onclick={handleWindowClick} />

<span class="relative inline-flex">
	<button
		bind:this={dotEl}
		class="color-dot"
		style="background: {color};"
		onclick={toggle}
		title="Change color"
	></button>

	{#if open}
		<div class="color-picker" onclick={(e) => e.stopPropagation()}>
			{#each COLOR_PALETTE as swatch (swatch.value)}
				<button
					class="swatch"
					class:active={swatch.value === color}
					style="background: {swatch.value};"
					onclick={() => select(swatch.value)}
					title={swatch.label}
				></button>
			{/each}
		</div>
	{/if}
</span>

<style>
	.color-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.2);
		cursor: pointer;
		flex-shrink: 0;
	}

	.color-dot:hover {
		border-color: rgba(255, 255, 255, 0.5);
	}

	.color-picker {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 4px;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
		padding: 6px;
		background: var(--term-bg);
		border: 1px solid var(--term-border);
		border-radius: 6px;
		z-index: 60;
	}

	.swatch {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
	}

	.swatch:hover {
		border-color: rgba(255, 255, 255, 0.4);
	}

	.swatch.active {
		border-color: white;
	}
</style>
