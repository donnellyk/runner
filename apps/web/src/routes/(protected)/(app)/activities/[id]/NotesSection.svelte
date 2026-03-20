<script lang="ts">
    import { enhance } from "$app/forms";
    import { formatDistance, type Units } from "$lib/format";
    import type { ActivityNoteRef } from '$lib/components/ActivityChart.svelte';
    import type { SubmitFunction } from '@sveltejs/kit';

    interface Props {
        notes: ActivityNoteRef[];
        units: Units;
        highlightedNoteId: number | null;
        handleNoteSubmit: SubmitFunction;
    }

    let {
        notes,
        units,
        highlightedNoteId = $bindable(),
        handleNoteSubmit,
    }: Props = $props();
</script>

<div class="mb-8">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
        Notes ({notes.length})
    </h2>
    {#if notes.length > 0}
        {#each notes as note (note.id)}
            <div
                class="flex items-start gap-3 py-2 border-b border-zinc-50 cursor-pointer {highlightedNoteId === note.id ? 'bg-amber-50' : 'hover:bg-zinc-50'}"
                onclick={() => highlightedNoteId = highlightedNoteId === note.id ? null : note.id}
                role="button"
                tabindex="0"
                onkeydown={(e) => { if (e.key === 'Enter') highlightedNoteId = highlightedNoteId === note.id ? null : note.id; }}
            >
                <div class="text-xs text-zinc-400 font-mono whitespace-nowrap" style="font-variant-numeric: tabular-nums;">
                    {formatDistance(note.distanceStart, units)}
                    {#if note.distanceEnd}
                        – {formatDistance(note.distanceEnd, units)}
                    {/if}
                </div>
                <div class="flex-1 text-sm text-zinc-700">{note.content}</div>
                <form method="POST" action="?/deleteNote" use:enhance>
                    <input type="hidden" name="noteId" value={note.id} />
                    <button
                        class="text-xs text-zinc-300 hover:text-red-500"
                        onclick={(e) => e.stopPropagation()}
                    >Delete</button>
                </form>
            </div>
        {/each}
    {:else}
        <p class="text-sm text-zinc-400">No notes</p>
    {/if}

    <form method="POST" action="?/createNote" use:enhance={handleNoteSubmit} class="flex gap-2 items-end mt-3">
        <div>
            <label for="note-start" class="text-xs text-zinc-400">Start ({units === 'imperial' ? 'mi' : 'km'})</label>
            <input id="note-start" type="text" name="distanceStart" placeholder="1.0"
                class="w-20 text-sm border border-zinc-200 rounded px-2 py-1 font-mono" />
        </div>
        <div>
            <label for="note-end" class="text-xs text-zinc-400">End</label>
            <input id="note-end" type="text" name="distanceEnd" placeholder=""
                class="w-20 text-sm border border-zinc-200 rounded px-2 py-1 font-mono" />
        </div>
        <div>
            <label for="note-repeat" class="text-xs text-zinc-400">Every</label>
            <input id="note-repeat" type="text" name="repeatEvery" placeholder=""
                class="w-20 text-sm border border-zinc-200 rounded px-2 py-1 font-mono" />
        </div>
        <div class="flex-1">
            <label for="note-content" class="text-xs text-zinc-400">Note</label>
            <input id="note-content" type="text" name="content" placeholder="What happened here?"
                class="w-full text-sm border border-zinc-200 rounded px-2 py-1" />
        </div>
        <button type="submit" class="px-3 py-1 text-sm bg-zinc-900 text-white rounded hover:bg-zinc-800">Add</button>
    </form>
</div>
