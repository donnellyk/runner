<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		type PanelConfig,
		DATA_SOURCE_COLORS,
		getPanelLabel,
	} from './terminal-state.svelte';

	interface Props {
		config: PanelConfig;
		children: Snippet;
		ondragstart?: (e: PointerEvent) => void;
		onconfigopen?: (rect: DOMRect) => void;
		isDragSource?: boolean;
	}

	let { config, children, ondragstart, onconfigopen, isDragSource = false }: Props = $props();

	let menuBtn = $state<HTMLElement | null>(null);

	let titleColor = $derived(
		config.kind === 'chart' && config.dataSource
			? config.colorOverride ?? DATA_SOURCE_COLORS[config.dataSource]
			: 'var(--term-text-muted)',
	);

	function handleHeaderPointerDown(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('button')) return;
		ondragstart?.(e);
	}

	function openConfig() {
		if (menuBtn) onconfigopen?.(menuBtn.getBoundingClientRect());
	}
</script>

<div
	class="flex flex-col h-full"
	style="background: var(--term-surface); backdrop-filter: blur(12px); border: 1px solid var(--term-border); border-radius: 4px; overflow: hidden; {isDragSource ? 'opacity: 0.4;' : ''}"
>
	<div
		class="flex items-center px-1.5 py-0.5 shrink-0"
		role="toolbar"
		tabindex="-1"
		style="border-bottom: 1px solid var(--term-border); cursor: {isDragSource ? 'grabbing' : 'grab'};"
		onpointerdown={handleHeaderPointerDown}
	>
		<span
			class="text-[10px] uppercase tracking-wide flex-1 truncate"
			style="color: {titleColor}; font-family: 'Geist Mono', monospace;"
		>{getPanelLabel(config)}</span>
		<button
			bind:this={menuBtn}
			class="text-[11px] cursor-pointer px-1 rounded leading-none"
			style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;"
			title="Panel settings"
			onclick={openConfig}
		>&#x22EE;</button>
	</div>

	<div class="flex-1" style="min-height: 0;">
		{@render children()}
	</div>
</div>
