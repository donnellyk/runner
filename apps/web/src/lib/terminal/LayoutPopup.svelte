<script lang="ts">
	import type { TerminalState } from './terminal-state.svelte';
	import { applySettings, getSettings } from './terminal-state.svelte';
	import { DATA_SOURCE_COLORS } from './terminal-state.svelte';
	import {
		encodeLayout,
		encodeSettings,
		decodeLayout,
		decodeSettings,
		cloneLayout,
		getNextPanelId,
		resetNextPanelId,
		type LayoutPanel,
		type SavedLayout,
	} from './layout-url';
	import { GRID_COLS, GRID_ROWS, findSplitForNewPanel, MAX_PANELS } from './grid-validation';

	interface Props {
		termState: TerminalState;
		savedLayouts: SavedLayout[];
		onlayoutschange?: () => void;
		onclose: () => void;
	}

	let { termState, savedLayouts, onlayoutschange, onclose }: Props = $props();

	let confirmDeleteId = $state<number | null>(null);
	let showNewInput = $state(false);
	let newName = $state('');
	let renamingId = $state<number | null>(null);
	let renamingValue = $state('');

	const SVG_W = 96;
	const SVG_H = 48;
	const CELL_W = SVG_W / GRID_COLS;
	const CELL_H = SVG_H / GRID_ROWS;

	function getPanelColor(panel: LayoutPanel): string {
		if (panel.config.kind === 'special') return 'var(--term-text-muted)';
		if (panel.config.dataSource) return DATA_SOURCE_COLORS[panel.config.dataSource] ?? 'var(--term-text-muted)';
		return 'var(--term-text-muted)';
	}

	function getCurrentEncoded(): string {
		const layoutStr = encodeLayout(termState.layoutPanels);
		const settingsStr = encodeSettings(getSettings(termState));
		return settingsStr ? `${layoutStr}&${settingsStr}` : layoutStr;
	}

	function decodePanels(encoded: string): LayoutPanel[] {
		return decodeLayout(encoded.split('&')[0]).panels;
	}

	async function saveLayout(name: string) {
		const encoded = getCurrentEncoded();
		const res = await fetch('/api/terminal-layouts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, encoded }),
		});
		if (res.ok) {
			const { id } = await res.json();
			termState.activeLayoutId = id;
			onlayoutschange?.();
		}
	}

	async function deleteLayout(layout: SavedLayout) {
		if (confirmDeleteId !== layout.id) {
			confirmDeleteId = layout.id;
			return;
		}
		confirmDeleteId = null;
		await fetch(`/api/terminal-layouts/${layout.id}`, { method: 'DELETE' });
		if (termState.activeLayoutId === layout.id) {
			termState.activeLayoutId = null;
		}
		onlayoutschange?.();
	}

	async function toggleDefault(layout: SavedLayout) {
		if (layout.isDefault) {
			await fetch(`/api/terminal-layouts/${layout.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isDefault: false }),
			});
		} else {
			await fetch(`/api/terminal-layouts/${layout.id}/default`, { method: 'POST' });
		}
		onlayoutschange?.();
	}

	async function renameLayout(layout: SavedLayout) {
		const name = renamingValue.trim();
		renamingId = null;
		if (!name || name === layout.name) return;
		await fetch(`/api/terminal-layouts/${layout.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name }),
		});
		onlayoutschange?.();
	}

	async function copyLayout(layout: SavedLayout) {
		const res = await fetch('/api/terminal-layouts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: `${layout.name} (copy)`, encoded: layout.encoded }),
		});
		if (res.ok) {
			onlayoutschange?.();
		}
	}

	function loadLayout(layout: SavedLayout) {
		const parts = layout.encoded.split('&');
		const { panels } = decodeLayout(parts[0]);
		termState.layoutPanels = panels;
		termState.activeLayoutId = layout.id;
		resetNextPanelId(panels.length + 1);
		applySettings(termState, decodeSettings(new URLSearchParams(parts.slice(1).join('&'))));
		onclose();
	}

	function addPanel() {
		const split = findSplitForNewPanel(termState.layoutPanels);
		if (!split) return;
		const newPanels = cloneLayout(termState.layoutPanels);
		newPanels[split.panelIndex].placement = { ...split.shrunkPlacement };
		newPanels.push({
			id: getNextPanelId(),
			config: { kind: 'chart', dataSource: 'pace', chartType: 'line' },
			placement: split.placement,
		});
		termState.layoutPanels = newPanels;
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	data-terminal
	class="fixed inset-0"
	style="z-index: 90;"
	onclick={handleBackdropClick}
>
	<div
		class="fixed flex flex-col gap-3 p-3"
		style="
			top: 34px; right: 8px;
			width: 350px;
			max-height: calc(100vh - 40px);
			overflow-y: auto;
			background: var(--term-bg);
			border: 1px solid var(--term-border);
			border-radius: 6px;
			box-shadow: 0 8px 32px rgba(0,0,0,0.5);
			font-family: 'Geist Mono', monospace;
		"
	>
		<!-- Actions -->
		{#if showNewInput}
			<form class="flex gap-1" onsubmit={(e) => {
				e.preventDefault();
				if (!newName.trim()) return;
				termState.resetLayout();
				saveLayout(newName.trim());
				newName = '';
				showNewInput = false;
			}}>
				<input
					type="text"
					bind:value={newName}
					placeholder="Layout name"
					class="flex-1 text-[12px] px-2 py-1 rounded bg-transparent outline-none"
					style="color: var(--term-text); border: 1px solid var(--term-border); min-width: 0;"
				/>
				<button
					type="submit"
					class="text-[11px] px-1.5 py-1 rounded"
					style="color: var(--term-text-bright); border: 1px solid var(--term-border);"
				>Create</button>
				<button
					type="button"
					class="text-[11px] px-1 py-1 rounded"
					style="color: var(--term-text-muted);"
					onclick={() => { showNewInput = false; newName = ''; }}
				>x</button>
			</form>
		{:else}
			<div class="flex gap-1">
				<button
					class="flex-1 text-[12px] px-2 py-1 rounded"
					style="color: var(--term-text-muted); border: 1px solid var(--term-border);"
					onclick={() => { showNewInput = true; }}
				>New Layout</button>
				<button
					class="flex-1 text-[12px] px-2 py-1 rounded"
					style="color: var(--term-text-muted); border: 1px solid var(--term-border);"
					disabled={termState.layoutPanels.length >= MAX_PANELS}
					onclick={addPanel}
				>Add Panel</button>
			</div>
		{/if}

		<!-- Saved layouts -->
		{#if savedLayouts.length > 0}
			<div class="flex flex-col gap-1.5">
				{#each savedLayouts as layout (layout.id)}
					{@const panels = decodePanels(layout.encoded)}
					{@const isActive = termState.activeLayoutId === layout.id}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="flex items-center gap-2 p-1.5 rounded cursor-pointer"
						style="background: {isActive ? 'var(--term-surface-hover)' : 'var(--term-surface)'}; border: 1px solid {isActive ? 'var(--term-snap-border)' : 'var(--term-border)'};"
						onclick={(e) => {
							if ((e.target as HTMLElement).closest('button, input, form')) return;
							loadLayout(layout);
						}}
					>
						<!-- Inline preview -->
						<svg
							width={SVG_W}
							height={SVG_H}
							class="shrink-0 rounded"
							style="background: var(--term-bg); border: 1px solid var(--term-border);"
						>
							{#each panels as panel (panel.id)}
								<rect
									x={panel.placement.col * CELL_W + 0.5}
									y={panel.placement.row * CELL_H + 0.5}
									width={panel.placement.colSpan * CELL_W - 1}
									height={panel.placement.rowSpan * CELL_H - 1}
									fill={getPanelColor(panel)}
									opacity="0.6"
									rx="1"
								/>
							{/each}
						</svg>

						<!-- Name + actions -->
						<div class="flex-1 min-w-0 flex flex-col gap-1">
							{#if renamingId === layout.id}
								<form class="flex" onsubmit={(e) => { e.preventDefault(); renameLayout(layout); }}>
									<!-- svelte-ignore a11y_autofocus -->
									<input
										type="text"
										bind:value={renamingValue}
										autofocus
										class="text-[12px] w-full px-1 py-0 rounded bg-transparent outline-none"
										style="color: var(--term-text-bright); border: 1px solid var(--term-border); min-width: 0;"
										onclick={(e) => e.stopPropagation()}
										onkeydown={(e) => { if (e.key === 'Escape') { renamingId = null; } }}
									/>
								</form>
								<div class="flex items-center gap-1">
									<button
										class="text-[11px] cursor-pointer px-1 py-0.5 rounded"
										style="color: var(--term-text-bright); border: 1px solid var(--term-border);"
										onclick={() => renameLayout(layout)}
									>Save</button>
									<button
										class="text-[11px] cursor-pointer px-1 py-0.5 rounded"
										style="color: var(--term-text-muted); border: 1px solid var(--term-border);"
										onclick={() => { renamingId = null; }}
									>Cancel</button>
								</div>
							{:else}
								<span
									class="text-[12px] truncate"
									style="color: {isActive ? 'var(--term-text-bright)' : 'var(--term-text)'};"
								>{layout.name}</span>
								<div class="flex items-center gap-1">
									<button
										class="text-[11px] cursor-pointer px-1 py-0.5 rounded"
										style="color: var(--term-text-muted); border: 1px solid var(--term-border);"
										onclick={() => { renamingId = layout.id; renamingValue = layout.name; }}
									>Rename</button>
									<button
										class="text-[11px] cursor-pointer px-1 py-0.5 rounded"
										style="color: var(--term-text-muted); border: 1px solid var(--term-border);"
										onclick={() => copyLayout(layout)}
									>Copy</button>
									<button
										class="text-[11px] cursor-pointer px-1 py-0.5 rounded"
										style="color: {confirmDeleteId === layout.id ? 'var(--term-hr)' : 'var(--term-text-muted)'}; border: 1px solid {confirmDeleteId === layout.id ? 'var(--term-hr)' : 'var(--term-border)'};"
										onclick={() => deleteLayout(layout)}
										onmouseleave={() => { if (confirmDeleteId === layout.id) confirmDeleteId = null; }}
									>{confirmDeleteId === layout.id ? 'Confirm?' : 'Delete'}</button>
								</div>
							{/if}
						</div>

						<!-- Star (right side) -->
						<button
							class="text-[20px] cursor-pointer leading-none shrink-0 self-center"
							style="color: {layout.isDefault ? 'var(--term-pace)' : 'var(--term-text-muted)'};"
							title={layout.isDefault ? 'Unset default' : 'Set as default'}
							onclick={() => toggleDefault(layout)}
						>{layout.isDefault ? '★' : '☆'}</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
