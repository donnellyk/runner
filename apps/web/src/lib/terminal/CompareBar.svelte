<script lang="ts">
	import type { CompareStateType } from './compare-state.svelte';
	import ColorPickerDot from './ColorPickerDot.svelte';

	interface Props {
		compareState: CompareStateType;
		onsearchopen: () => void;
	}

	let { compareState, onsearchopen }: Props = $props();

	let overflowOpen = $state(false);

	let hasOverlays = $derived(compareState.activities.length > 1);
	let allTabs = $derived(hasOverlays ? compareState.activities : []);
	let overflowThreshold = 4;
	let showOverflow = $derived(allTabs.length > overflowThreshold);
	let displayedTabs = $derived(
		showOverflow ? allTabs.slice(0, overflowThreshold - 1) : allTabs,
	);
	let overflowTabs = $derived(
		showOverflow ? allTabs.slice(overflowThreshold - 1) : [],
	);

	function handleTabClick(index: number) {
		if (compareState.compareMode) {
			compareState.toggleSelected(compareState.activities[index].id);
		} else {
			compareState.activeIndex = index;
		}
	}

	function handleRemove(e: MouseEvent, activityId: number) {
		e.stopPropagation();
		compareState.removeActivity(activityId);
	}

	function toggleCompare() {
		if (compareState.canCompare) {
			compareState.compareMode = !compareState.compareMode;
		}
	}

	function handleWindowClick() {
		if (overflowOpen) overflowOpen = false;
	}
</script>

<svelte:window onclick={handleWindowClick} />

{#each displayedTabs as tab, i (tab.id)}
	{@const isPrimary = i === 0}
	{@const isActive = !compareState.compareMode && compareState.activeIndex === i}
	{@const isSelected = compareState.compareMode && tab.selected}
	<span
		class="tab"
		class:active={isActive}
		class:selected={isSelected}
		role="tab"
		tabindex="0"
		onclick={() => handleTabClick(i)}
		onkeydown={(e) => { if (e.key === 'Enter') handleTabClick(i); }}
	>
		{#if compareState.compareMode}
			<span class="select-dot" style="background: {tab.selected ? tab.color : 'transparent'}; border-color: {tab.color};"></span>
		{:else}
			<ColorPickerDot color={tab.color} onchange={(c) => compareState.setColor(tab.id, c)} />
		{/if}
		<span class="tab-name">{tab.name}</span>
		{#if !isPrimary}
			<button class="tab-close" onclick={(e) => handleRemove(e, tab.id)} title="Remove">&times;</button>
		{/if}
	</span>
{/each}

{#if overflowTabs.length > 0}
	<span class="relative inline-flex">
		<button
			class="tab overflow-btn"
			onclick={(e) => { e.stopPropagation(); overflowOpen = !overflowOpen; }}
		>+{overflowTabs.length} more</button>
		{#if overflowOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="overflow-dropdown" onclick={(e) => e.stopPropagation()}>
				{#each overflowTabs as tab (tab.id)}
					{@const activityIndex = compareState.activities.findIndex((a) => a.id === tab.id)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="overflow-item"
						onclick={() => { handleTabClick(activityIndex); overflowOpen = false; }}
					>
						<span class="color-dot-inline" style="background: {tab.color};"></span>
						<span class="overflow-name">{tab.name}</span>
						<button class="tab-close" onclick={(e) => handleRemove(e, tab.id)}>&times;</button>
					</div>
				{/each}
			</div>
		{/if}
	</span>
{/if}

{#if compareState.canAddMore}
	<button class="title-btn" onclick={onsearchopen} title="Add activity to compare">+</button>
{/if}

{#if compareState.canCompare}
	<button
		class="title-btn"
		class:active={compareState.compareMode}
		onclick={toggleCompare}
	>Compare</button>
{/if}

<style>
	.tab {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 11px;
		color: var(--term-text-muted);
		font-family: 'Geist Mono', monospace;
		cursor: pointer;
		max-width: 160px;
		border: 1px solid transparent;
	}

	.tab:hover {
		background: var(--term-surface-hover);
	}

	.tab.active {
		border-color: var(--term-border);
		background: var(--term-surface);
		color: var(--term-text);
	}

	.tab.selected {
		border-color: var(--term-border);
		color: var(--term-text);
	}

	.select-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1.5px solid;
		flex-shrink: 0;
	}

	.tab-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tab-close {
		font-size: 13px;
		line-height: 1;
		color: var(--term-text-muted);
		cursor: pointer;
		padding: 0 1px;
		flex-shrink: 0;
	}

	.tab-close:hover {
		color: var(--term-text-bright);
	}

	.title-btn {
		font-size: 12px;
		padding: 2px 8px;
		border-radius: 4px;
		color: var(--term-text-muted);
		font-family: 'Geist Mono', monospace;
		cursor: pointer;
		border: 1px solid var(--term-border);
	}

	.title-btn:hover {
		color: var(--term-text-bright);
	}

	.title-btn.active {
		color: var(--term-text-bright);
		border-color: var(--term-snap-border);
	}

	.overflow-btn {
		font-size: 11px;
	}

	.overflow-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 4px;
		background: var(--term-bg);
		border: 1px solid var(--term-border);
		border-radius: 6px;
		z-index: 60;
		min-width: 180px;
		overflow: hidden;
	}

	.overflow-item {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		width: 100%;
		text-align: left;
		font-size: 12px;
		color: var(--term-text);
		font-family: 'Geist Mono', monospace;
		cursor: pointer;
	}

	.overflow-item:hover {
		background: var(--term-surface-hover);
	}

	.color-dot-inline {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.overflow-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
