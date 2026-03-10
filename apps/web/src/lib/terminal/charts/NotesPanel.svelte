<script lang="ts">
	import { formatDistance, type Units } from '$lib/format';
	import type { ActivityNote } from '../terminal-state.svelte';

	interface Props {
		notes: ActivityNote[];
		units?: Units;
		highlightedNoteId?: number | null;
		onnotehighlight?: (id: number | null) => void;
	}

	let {
		notes,
		units = 'metric',
		highlightedNoteId = null,
		onnotehighlight,
	}: Props = $props();

	function toggleNote(id: number) {
		onnotehighlight?.(highlightedNoteId === id ? null : id);
	}
</script>

<div class="relative w-full h-full flex flex-col" style="min-height: 0;">
	<div class="flex items-baseline justify-between px-2 py-1 shrink-0">
		<span class="text-[10px] uppercase tracking-widest" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">
			Notes
		</span>
		<span class="text-[11px]" style="color: var(--term-text-bright); font-family: 'Geist Mono', monospace;">
			{notes.length}
		</span>
	</div>

	<div class="flex-1 overflow-auto px-2 pb-1" style="min-height: 0;">
		{#if notes.length === 0}
			<div class="flex items-center justify-center h-full">
				<span class="text-[11px]" style="color: var(--term-text-muted);">No notes</span>
			</div>
		{:else}
			{#each notes as note (note.id)}
				<button
					class="w-full text-left py-1.5 px-1.5 rounded cursor-pointer"
					style="background: {highlightedNoteId === note.id ? 'var(--term-surface-hover)' : 'transparent'};"
					onclick={() => toggleNote(note.id)}
				>
					<div class="text-[9px]" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums;">
						{formatDistance(note.distanceStart, units)}
						{#if note.distanceEnd}
							– {formatDistance(note.distanceEnd, units)}
						{/if}
					</div>
					<div class="text-[11px] mt-0.5" style="color: var(--term-text);">{note.content}</div>
				</button>
			{/each}
		{/if}
	</div>
</div>
