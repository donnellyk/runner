<script lang="ts">
	import { formatDistance, formatPace, type Units } from '$lib/format';
	import { RACE_DISTANCES, WORKOUT_TYPE_LABELS } from '@web-runner/shared';

	interface SearchResult {
		id: number;
		name: string;
		sportType: string;
		startDate: string;
		distance: number | null;
		movingTime: number | null;
		averageSpeed: number | null;
	}

	interface Props {
		sportType: string;
		excludeIds: number[];
		units: Units;
		onselect: (id: number) => void;
		onclose: () => void;
	}

	let { sportType, excludeIds, units, onselect, onclose }: Props = $props();

	let query = $state('');
	let rangeFilter = $state('');
	let workoutFilter = $state('');
	let distanceFilter = $state('');
	let results = $state<SearchResult[]>([]);
	let searching = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let inputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		inputEl?.focus();
	});

	$effect(() => {
		void query;
		void rangeFilter;
		void workoutFilter;
		void distanceFilter;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => search(), 300);
		return () => { if (debounceTimer) clearTimeout(debounceTimer); };
	});

	async function search() {
		searching = true;
		try {
			const parts = [`sport=${encodeURIComponent(sportType)}`];
			if (query.trim()) parts.push(`q=${encodeURIComponent(query.trim())}`);
			if (excludeIds.length > 0) parts.push(`exclude=${excludeIds[0]}`);
			if (rangeFilter) parts.push(`range=${encodeURIComponent(rangeFilter)}`);
			if (workoutFilter) parts.push(`workout=${encodeURIComponent(workoutFilter)}`);
			if (distanceFilter) parts.push(`distance=${encodeURIComponent(distanceFilter)}`);
			parts.push('limit=20');

			const res = await fetch(`/api/activities/search?${parts.join('&')}`);
			if (!res.ok) return;
			const data = await res.json();
			results = (data.activities as SearchResult[]).filter(
				(a) => !excludeIds.includes(a.id),
			);
		} finally {
			searching = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" data-terminal onclick={onclose} onkeydown={() => {}}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="popup" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
		<input
			bind:this={inputEl}
			bind:value={query}
			type="text"
			class="search-input"
			placeholder="Search activities..."
		/>

		<div class="filters">
			<select class="filter-select" bind:value={rangeFilter}>
				<option value="">All time</option>
				<option value="week">This week</option>
				<option value="month">This month</option>
				<option value="90d">Last 90 days</option>
			</select>
			<select class="filter-select" bind:value={workoutFilter}>
				<option value="">Any type</option>
				{#each WORKOUT_TYPE_LABELS as wt (wt.value)}
					<option value={wt.value}>{wt.label}</option>
				{/each}
			</select>
			<select class="filter-select" bind:value={distanceFilter}>
				<option value="">Any distance</option>
				{#each RACE_DISTANCES as preset (preset.label)}
					<option value={preset.label}>{preset.label}</option>
				{/each}
			</select>
		</div>

		<div class="results">
			{#if searching}
				<div class="empty-msg">Searching...</div>
			{:else if results.length === 0}
				<div class="empty-msg">No matching activities</div>
			{:else}
				{#each results as result (result.id)}
					<button class="result-row" onclick={() => onselect(result.id)}>
						<div class="result-name">{result.name}</div>
						<div class="result-meta">
							<span>{formatDate(result.startDate)}</span>
							{#if result.distance}
								<span>{formatDistance(result.distance, units)}</span>
							{/if}
							{#if result.averageSpeed}
								<span>{formatPace(result.averageSpeed, units)}</span>
							{/if}
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 55;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 60px;
	}

	.popup {
		width: 420px;
		max-height: 480px;
		background: var(--term-bg);
		border: 1px solid var(--term-border);
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: 'Geist Mono', monospace;
	}

	.search-input {
		padding: 10px 12px;
		font-size: 13px;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--term-border);
		color: var(--term-text-bright);
		font-family: 'Geist Mono', monospace;
		outline: none;
	}

	.search-input::placeholder {
		color: var(--term-text-muted);
	}

	.filters {
		display: flex;
		gap: 6px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--term-border);
	}

	.filter-select {
		flex: 1;
		font-size: 11px;
		padding: 3px 4px;
		background: var(--term-surface);
		color: var(--term-text);
		border: 1px solid var(--term-border);
		border-radius: 3px;
		font-family: 'Geist Mono', monospace;
		cursor: pointer;
		min-width: 0;
	}

	.filter-select:focus {
		outline: none;
		border-color: var(--term-text-muted);
	}

	.results {
		overflow-y: auto;
		flex: 1;
	}

	.empty-msg {
		padding: 20px;
		text-align: center;
		font-size: 12px;
		color: var(--term-text-muted);
	}

	.result-row {
		width: 100%;
		text-align: left;
		padding: 8px 12px;
		cursor: pointer;
		border-bottom: 1px solid var(--term-border);
	}

	.result-row:hover {
		background: var(--term-surface-hover);
	}

	.result-row:last-child {
		border-bottom: none;
	}

	.result-name {
		font-size: 13px;
		color: var(--term-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-meta {
		display: flex;
		gap: 12px;
		font-size: 11px;
		color: var(--term-text-muted);
		margin-top: 2px;
	}
</style>
