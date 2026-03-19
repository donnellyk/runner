<script lang="ts">
	import { onMount } from 'svelte';
	import type { TerminalState, ProcessingParams } from './terminal-state.svelte';

	interface Props {
		termState: TerminalState;
		anchorRect: DOMRect;
		onclose: () => void;
	}

	let { termState, anchorRect, onclose }: Props = $props();

	const POPUP_W = 260;
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

	function updateParam<K extends keyof ProcessingParams>(key: K, value: ProcessingParams[K]) {
		termState.params = { ...termState.params, [key]: value };
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0" style="z-index: 98;" onclick={onclose}></div>

<div
	data-terminal
	class="popup"
	style="top: {popupTop}px; left: {popupLeft}px; width: {POPUP_W}px;"
>
	<div class="slider-row">
		<span class="slider-label">Smoothing</span>
		<input type="range" class="slider" min="0" max="10" step="1"
			value={termState.params.smoothingWindow}
			oninput={(e) => updateParam('smoothingWindow', parseInt((e.target as HTMLInputElement).value))}
		/>
		<span class="slider-val">{termState.params.smoothingWindow}</span>
	</div>

	<div class="slider-row">
		<span class="slider-label">Samples</span>
		<input type="range" class="slider" min="100" max="2000" step="100"
			value={termState.params.samplePoints}
			oninput={(e) => updateParam('samplePoints', parseInt((e.target as HTMLInputElement).value))}
		/>
		<span class="slider-val">{termState.params.samplePoints}</span>
	</div>

	<div class="slider-row">
		<span class="slider-label">Pause (m/s)</span>
		<input type="range" class="slider" min="0.1" max="3.0" step="0.1"
			value={termState.params.pauseThreshold}
			oninput={(e) => updateParam('pauseThreshold', parseFloat((e.target as HTMLInputElement).value))}
		/>
		<span class="slider-val">{termState.params.pauseThreshold.toFixed(1)}</span>
	</div>

	<div class="slider-row">
		<span class="slider-label">Wick Clip</span>
		<input type="range" class="slider" min="0" max="25" step="1"
			value={termState.wickPercentile}
			oninput={(e) => termState.wickPercentile = parseInt((e.target as HTMLInputElement).value)}
		/>
		<span class="slider-val">p{termState.wickPercentile}</span>
	</div>
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

	.slider-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.slider-label {
		font-size: 10px;
		color: var(--term-text-muted);
		flex-shrink: 0;
		width: 72px;
	}

	.slider {
		flex: 1;
		height: 12px;
		cursor: pointer;
		accent-color: var(--term-text-muted);
	}

	.slider-val {
		font-size: 10px;
		width: 36px;
		text-align: right;
		color: var(--term-text);
	}
</style>
