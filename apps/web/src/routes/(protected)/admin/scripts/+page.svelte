<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();

	const scripts = [
		{
			action: 'requeuePending',
			label: 'Requeue pending activities',
			description:
				'Queue activity-import jobs for all activities stuck at syncStatus=pending. ' +
				'These are stub rows that never had an import job queued.',
		},
		{
			action: 'requeueStreams',
			label: 'Requeue missing streams',
			description:
				'Queue activity-streams jobs for all activities stuck at syncStatus=streams_pending.',
		},
	];

	let loading = $state<string | null>(null);
</script>

<h1 class="font-serif text-3xl font-semibold text-zinc-900 mb-8">Scripts</h1>

<div class="space-y-4">
	{#each scripts as script}
		<div class="border border-zinc-200 rounded-lg p-5">
			<div class="flex items-start justify-between gap-6">
				<div class="min-w-0">
					<div class="text-sm font-medium text-zinc-900">{script.label}</div>
					<div class="text-xs text-zinc-400 mt-0.5">{script.description}</div>
				</div>
				<form
					method="POST"
					action="?/{script.action}"
					use:enhance={() => {
						loading = script.action;
						return async ({ update }) => {
							await update();
							loading = null;
						};
					}}
				>
					<button
						type="submit"
						disabled={loading === script.action}
						class="shrink-0 px-3 py-1.5 text-xs font-medium rounded bg-zinc-900 text-white
							hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{loading === script.action ? 'Running…' : 'Run'}
					</button>
				</form>
			</div>

			{#if form?.script === script.action && form?.lines}
				<pre class="mt-4 bg-zinc-950 text-zinc-100 text-xs font-mono rounded p-3 overflow-x-auto whitespace-pre-wrap">{form.lines.join('\n')}</pre>
			{/if}
		</div>
	{/each}
</div>
