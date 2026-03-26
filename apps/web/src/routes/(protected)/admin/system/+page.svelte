<script lang="ts">
	let { data } = $props();
</script>

<h1 class="text-2xl font-bold mb-6">System</h1>

<h2 class="text-lg font-bold mb-3">Database</h2>
<table class="w-full text-sm mb-2">
	<thead>
		<tr class="border-b border-zinc-200 text-left text-zinc-500">
			<th class="py-1 pr-4">Table</th>
			<th class="py-1 pr-4">Rows</th>
			<th class="py-1 pr-4">Size</th>
		</tr>
	</thead>
	<tbody>
		{#each data.tableStats as table, i (i)}
			<tr class="border-b border-zinc-100">
				<td class="py-1 pr-4 font-mono text-xs">{table.table_name}</td>
				<td class="py-1 pr-4">{table.row_count}</td>
				<td class="py-1 pr-4">{table.total_size}</td>
			</tr>
		{/each}
	</tbody>
</table>
<div class="text-sm text-zinc-500 mb-8">Total: {data.dbSize}</div>

<h2 class="text-lg font-bold mb-3">Slow Queries</h2>
{#if !data.pgStatAvailable}
	<p class="text-sm text-zinc-400 mb-8">pg_stat_statements not available. Enable shared_preload_libraries in postgres config.</p>
{:else if data.slowQueries.length === 0}
	<p class="text-sm text-zinc-400 mb-8">No queries recorded yet.</p>
{:else}
	<table class="w-full text-sm mb-8">
		<thead>
			<tr class="border-b border-zinc-200 text-left text-zinc-500">
				<th class="py-1 pr-4">Query</th>
				<th class="py-1 pr-4">Calls</th>
				<th class="py-1 pr-4">Total (ms)</th>
				<th class="py-1 pr-4">Mean (ms)</th>
				<th class="py-1 pr-4">Rows</th>
			</tr>
		</thead>
		<tbody>
			{#each data.slowQueries as q, i (i)}
				<tr class="border-b border-zinc-100">
					<td class="py-1 pr-4 text-xs font-mono max-w-md truncate">{q.query}</td>
					<td class="py-1 pr-4">{q.calls}</td>
					<td class="py-1 pr-4">{q.total_time_ms}</td>
					<td class="py-1 pr-4">{q.mean_time_ms}</td>
					<td class="py-1 pr-4">{q.rows}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

{#if data.pgStatAvailable && data.n1Candidates.length > 0}
<h2 class="text-lg font-bold mb-3">N+1 Query Candidates</h2>
<p class="text-xs text-zinc-400 mb-2">SELECT queries called 100+ times returning ~1 row per call — may indicate a loop issuing one query per record.</p>
<table class="w-full text-sm mb-8">
	<thead>
		<tr class="border-b border-zinc-200 text-left text-zinc-500">
			<th class="py-1 pr-4">Query</th>
			<th class="py-1 pr-4">Calls</th>
			<th class="py-1 pr-4">Rows/Call</th>
			<th class="py-1 pr-4">Total (ms)</th>
			<th class="py-1 pr-4">Mean (ms)</th>
		</tr>
	</thead>
	<tbody>
		{#each data.n1Candidates as q, i (i)}
			<tr class="border-b border-zinc-100">
				<td class="py-1 pr-4 text-xs font-mono max-w-md truncate">{q.query}</td>
				<td class="py-1 pr-4">{q.calls}</td>
				<td class="py-1 pr-4">{q.rows_per_call}</td>
				<td class="py-1 pr-4">{q.total_time_ms}</td>
				<td class="py-1 pr-4">{q.mean_time_ms}</td>
			</tr>
		{/each}
	</tbody>
</table>
{/if}

<h2 class="text-lg font-bold mb-3">Redis</h2>
<div class="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-8 max-w-sm">
	<div class="text-zinc-500">Used Memory</div><div>{data.redis.usedMemory}</div>
	<div class="text-zinc-500">Peak Memory</div><div>{data.redis.peakMemory}</div>
	<div class="text-zinc-500">Key Count</div><div>{data.redis.keyCount}</div>
</div>

<h2 class="text-lg font-bold mb-3">Connection Pool</h2>
{#if data.poolStats}
	<div class="grid grid-cols-2 gap-x-8 gap-y-1 text-sm max-w-sm">
		<div class="text-zinc-500">Total</div><div>{data.poolStats.totalCount}</div>
		<div class="text-zinc-500">Idle</div><div>{data.poolStats.idleCount}</div>
		<div class="text-zinc-500">Waiting</div><div>{data.poolStats.waitingCount}</div>
	</div>
{:else}
	<p class="text-sm text-zinc-400">Pool not initialized yet.</p>
{/if}
