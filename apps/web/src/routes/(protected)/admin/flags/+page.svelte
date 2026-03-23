<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let { data, form } = $props();

	let newKey = $state('');
	let newDescription = $state('');
</script>

<h1 class="text-xl font-bold mb-6">Feature Flags</h1>

{#if form?.error}
	<div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded text-sm">{form.error}</div>
{/if}

<table class="w-full text-sm mb-8">
	<thead>
		<tr class="border-b border-zinc-200 text-left">
			<th class="py-2 font-medium text-zinc-500">Key</th>
			<th class="py-2 font-medium text-zinc-500">Description</th>
			<th class="py-2 font-medium text-zinc-500 w-24 text-center">Status</th>
			<th class="py-2 font-medium text-zinc-500 w-20"></th>
		</tr>
	</thead>
	<tbody>
		{#each data.flags as flag (flag.id)}
			<tr class="border-b border-zinc-100">
				<td class="py-2 font-mono text-sm">{flag.key}</td>
				<td class="py-2 text-zinc-500">{flag.description ?? ''}</td>
				<td class="py-2 text-center">
					<form method="POST" action="?/toggle" use:enhance={() => () => { invalidateAll(); }}>
						<input type="hidden" name="flagId" value={flag.id} />
						<button
							class="px-2 py-0.5 rounded text-xs font-medium {flag.enabled
								? 'bg-green-100 text-green-800'
								: 'bg-zinc-100 text-zinc-500'}"
						>{flag.enabled ? 'ON' : 'OFF'}</button>
					</form>
				</td>
				<td class="py-2 text-right">
					<form method="POST" action="?/delete" use:enhance={() => () => { invalidateAll(); }}>
						<input type="hidden" name="flagId" value={flag.id} />
						<button class="text-xs text-zinc-400 hover:text-red-600">Delete</button>
					</form>
				</td>
			</tr>
		{/each}
		{#if data.flags.length === 0}
			<tr>
				<td colspan="4" class="py-8 text-center text-zinc-400">No feature flags defined</td>
			</tr>
		{/if}
	</tbody>
</table>

<div class="border border-zinc-200 rounded p-4 max-w-md">
	<h2 class="text-sm font-medium mb-3">New Flag</h2>
	<form method="POST" action="?/create" use:enhance={() => {
		return ({ update }) => {
			update();
			newKey = '';
			newDescription = '';
		};
	}}>
		<div class="mb-2">
			<label class="block text-xs text-zinc-500 mb-1" for="flag-key">Key</label>
			<input
				id="flag-key"
				name="key"
				bind:value={newKey}
				class="w-full px-2 py-1.5 border border-zinc-200 rounded text-sm font-mono"
				placeholder="chart_zoom"
			/>
		</div>
		<div class="mb-3">
			<label class="block text-xs text-zinc-500 mb-1" for="flag-desc">Description</label>
			<input
				id="flag-desc"
				name="description"
				bind:value={newDescription}
				class="w-full px-2 py-1.5 border border-zinc-200 rounded text-sm"
				placeholder="Enable chart zoom/pan controls"
			/>
		</div>
		<button class="px-3 py-1.5 bg-zinc-800 text-white rounded text-sm hover:bg-zinc-700">Create</button>
	</form>
</div>
