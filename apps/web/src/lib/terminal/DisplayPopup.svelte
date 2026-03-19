<script lang="ts">
	import { onMount } from 'svelte';
	import type { TerminalState } from './terminal-state.svelte';

	interface Props {
		termState: TerminalState;
		anchorRect: DOMRect;
		onclose: () => void;
	}

	let { termState, anchorRect, onclose }: Props = $props();

	const POPUP_W = 220;
	let popupTop = $state(0);
	let popupLeft = $state(0);

	onMount(() => {
		popupTop = anchorRect.bottom + 4;
		popupLeft = anchorRect.right - POPUP_W;
		if (popupLeft < 8) popupLeft = 8;

		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				e.stopImmediatePropagation();
				e.preventDefault();
				onclose();
			}
		}
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0" style="z-index: 98;" onclick={onclose}></div>

<div
	data-terminal
	class="popup"
	style="top: {popupTop}px; left: {popupLeft}px; width: {POPUP_W}px;"
>
	<label class="toggle-row">
		<input type="checkbox" bind:checked={termState.showZones} class="accent-current" />
		<span class="toggle-label">Zones</span>
	</label>

	<label class="toggle-row">
		<input type="checkbox" bind:checked={termState.showNotes} class="accent-current" />
		<span class="toggle-label">Notes</span>
	</label>

	<label class="toggle-row">
		<input type="checkbox" bind:checked={termState.showPauseGaps} class="accent-current" />
		<span class="toggle-label">Pause Gaps</span>
	</label>
</div>

<style>
	.popup {
		position: fixed;
		z-index: 99;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
		background: var(--term-bg);
		border: 1px solid var(--term-border);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		font-family: 'Geist Mono', monospace;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.toggle-label {
		font-size: 11px;
		color: var(--term-text-muted);
	}
</style>
