<script lang="ts">
	let { data } = $props();

	function formatTimestamp(ts: number | undefined | null) {
		if (!ts) return '-';
		return new Date(ts).toLocaleString();
	}
</script>

<h1 class="text-2xl font-bold mb-6">Queues</h1>

<div class="flex gap-4 mb-8">
	{#each Object.entries(data.counts) as [status, count] (status)}
		<div class="border border-zinc-200 rounded px-4 py-3 text-center min-w-[100px]">
			<div class="text-2xl font-bold">{count}</div>
			<div class="text-xs text-zinc-500 capitalize">{status}</div>
		</div>
	{/each}
</div>

<div class="space-y-6 mb-8">
	<div>
		<h2 class="text-sm font-medium text-zinc-500 mb-2">Sync</h2>
		<form method="POST" class="flex gap-2 items-end">
			<label class="text-sm">
				<span class="block text-zinc-500 mb-1">User</span>
				<select name="userId" class="border border-zinc-300 rounded px-2 py-1 text-sm">
					{#each data.users as u (u.id)}
						<option value={u.id}>{u.firstName} {u.lastName}</option>
					{/each}
				</select>
			</label>
			<button formaction="?/triggerSync" type="submit" class="px-3 py-1 bg-zinc-800 text-white rounded text-sm">
				Full Sync
			</button>
			<button formaction="?/importRaces" type="submit" class="px-3 py-1 bg-zinc-800 text-white rounded text-sm">
				Import Races
			</button>
			<button formaction="?/refreshSync" type="submit" class="px-3 py-1 border border-zinc-300 rounded text-sm">
				Refresh
			</button>
		</form>
	</div>

	<div>
		<h2 class="text-sm font-medium text-zinc-500 mb-2">Re-import</h2>
		<form method="POST" action="?/reimport" class="flex gap-2 items-end">
			<label class="text-sm">
				<span class="block text-zinc-500 mb-1">User ID</span>
				<input type="number" name="userId" class="border border-zinc-300 rounded px-2 py-1 text-sm w-20" />
			</label>
			<label class="text-sm">
				<span class="block text-zinc-500 mb-1">Strava Activity ID</span>
				<input type="number" name="activityId" class="border border-zinc-300 rounded px-2 py-1 text-sm w-32" />
			</label>
			<button type="submit" class="px-3 py-1 bg-zinc-800 text-white rounded text-sm">
				Re-import
			</button>
		</form>
	</div>

	<div>
		<h2 class="text-sm font-medium text-zinc-500 mb-2">Maintenance</h2>
		<div class="flex gap-2">
			<form method="POST" action="?/clean">
				<input type="hidden" name="status" value="completed" />
				<button type="submit" class="px-3 py-1 border border-zinc-300 rounded text-sm">
					Clean Completed
				</button>
			</form>
			<form method="POST" action="?/clean">
				<input type="hidden" name="status" value="failed" />
				<button type="submit" class="px-3 py-1 border border-zinc-300 rounded text-sm">
					Clean Failed
				</button>
			</form>
		</div>
	</div>
</div>

{#if data.activeJobs.length > 0}
	<h2 class="text-lg font-bold mb-3">Active ({data.activeJobs.length})</h2>
	<table class="w-full text-sm mb-6">
		<thead>
			<tr class="border-b border-zinc-200 text-left text-zinc-500">
				<th class="py-1 pr-3">ID</th>
				<th class="py-1 pr-3">Type</th>
				<th class="py-1 pr-3">Data</th>
				<th class="py-1 pr-3">Started</th>
			</tr>
		</thead>
		<tbody>
			{#each data.activeJobs as job (job.id)}
				<tr class="border-b border-zinc-100">
					<td class="py-1 pr-3 font-mono text-xs">{job.id}</td>
					<td class="py-1 pr-3">{job.name}</td>
					<td class="py-1 pr-3 text-xs font-mono max-w-xs truncate">{JSON.stringify(job.data)}</td>
					<td class="py-1 pr-3 text-xs">{formatTimestamp(job.processedOn)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

{#if data.failedJobs.length > 0}
	<h2 class="text-lg font-bold mb-3">Failed ({data.failedJobs.length})</h2>
	<table class="w-full text-sm mb-6">
		<thead>
			<tr class="border-b border-zinc-200 text-left text-zinc-500">
				<th class="py-1 pr-3">ID</th>
				<th class="py-1 pr-3">Type</th>
				<th class="py-1 pr-3">Reason</th>
				<th class="py-1 pr-3">Attempts</th>
				<th class="py-1 pr-3">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.failedJobs as job (job.id)}
				<tr class="border-b border-zinc-100">
					<td class="py-1 pr-3 font-mono text-xs">{job.id}</td>
					<td class="py-1 pr-3">{job.name}</td>
					<td class="py-1 pr-3 text-xs max-w-xs truncate">{job.failedReason}</td>
					<td class="py-1 pr-3">{job.attemptsMade}</td>
					<td class="py-1 pr-3">
						<form method="POST" action="?/retryFailed" class="inline">
							<input type="hidden" name="jobId" value={job.id} />
							<button type="submit" class="text-xs text-blue-600 hover:underline">Retry</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

{#if data.delayedJobs.length > 0}
	<h2 class="text-lg font-bold mb-3">Delayed ({data.delayedJobs.length})</h2>
	<table class="w-full text-sm mb-6">
		<thead>
			<tr class="border-b border-zinc-200 text-left text-zinc-500">
				<th class="py-1 pr-3">ID</th>
				<th class="py-1 pr-3">Type</th>
				<th class="py-1 pr-3">Data</th>
				<th class="py-1 pr-3">Delay</th>
			</tr>
		</thead>
		<tbody>
			{#each data.delayedJobs as job (job.id)}
				<tr class="border-b border-zinc-100">
					<td class="py-1 pr-3 font-mono text-xs">{job.id}</td>
					<td class="py-1 pr-3">{job.name}</td>
					<td class="py-1 pr-3 text-xs font-mono max-w-xs truncate">{JSON.stringify(job.data)}</td>
					<td class="py-1 pr-3 text-xs">{job.delay ? Math.round(job.delay / 1000) + 's' : '-'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

{#if data.completedJobs.length > 0}
	<h2 class="text-lg font-bold mb-3">Completed (recent {data.completedJobs.length})</h2>
	<table class="w-full text-sm mb-6">
		<thead>
			<tr class="border-b border-zinc-200 text-left text-zinc-500">
				<th class="py-1 pr-3">ID</th>
				<th class="py-1 pr-3">Type</th>
				<th class="py-1 pr-3">Data</th>
				<th class="py-1 pr-3">Finished</th>
			</tr>
		</thead>
		<tbody>
			{#each data.completedJobs as job (job.id)}
				<tr class="border-b border-zinc-100">
					<td class="py-1 pr-3 font-mono text-xs">{job.id}</td>
					<td class="py-1 pr-3">{job.name}</td>
					<td class="py-1 pr-3 text-xs font-mono max-w-xs truncate">{JSON.stringify(job.data)}</td>
					<td class="py-1 pr-3 text-xs">{formatTimestamp(job.finishedOn)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
