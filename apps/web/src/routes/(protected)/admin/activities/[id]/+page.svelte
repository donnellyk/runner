<script lang="ts">
	import { resolve } from '$app/paths';
	let { data } = $props();
	const a = data.activity;
</script>

<div class="mb-4">
	<a href={resolve('/admin/activities')} class="text-sm text-zinc-500 hover:text-zinc-800">&larr; Back</a>
</div>

<h1 class="text-2xl font-bold mb-6">{a.name}</h1>

<div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-8 max-w-2xl">
	<div class="text-zinc-500">ID</div><div>{a.id}</div>
	<div class="text-zinc-500">External ID</div><div class="font-mono">{a.externalId}</div>
	<div class="text-zinc-500">Source</div><div>{a.source}</div>
	<div class="text-zinc-500">Sport Type</div><div>{a.sportType}</div>
	<div class="text-zinc-500">Workout Type</div><div>{a.workoutType ?? '-'}</div>
	<div class="text-zinc-500">Sync Status</div><div>{a.syncStatus}</div>
	<div class="text-zinc-500">Start Date</div><div>{new Date(a.startDate).toLocaleString()}</div>
	<div class="text-zinc-500">Distance</div><div>{a.distance ? (a.distance / 1000).toFixed(2) + ' km' : '-'}</div>
	<div class="text-zinc-500">Moving Time</div><div>{a.movingTime ? Math.floor(a.movingTime / 60) + 'm' : '-'}</div>
	<div class="text-zinc-500">Elapsed Time</div><div>{a.elapsedTime ? Math.floor(a.elapsedTime / 60) + 'm' : '-'}</div>
	<div class="text-zinc-500">Elevation Gain</div><div>{a.totalElevationGain ? a.totalElevationGain.toFixed(0) + 'm' : '-'}</div>
	<div class="text-zinc-500">Avg HR</div><div>{a.averageHeartrate ?? '-'}</div>
	<div class="text-zinc-500">Max HR</div><div>{a.maxHeartrate ?? '-'}</div>
	<div class="text-zinc-500">Avg Cadence</div><div>{a.averageCadence ?? '-'}</div>
	<div class="text-zinc-500">Avg Watts</div><div>{a.averageWatts ?? '-'}</div>
	<div class="text-zinc-500">Device</div><div>{a.deviceName ?? '-'}</div>
	<div class="text-zinc-500">Gear ID</div><div>{a.gearId ?? '-'}</div>
	<div class="text-zinc-500">Has GPS</div><div>{a.route ? 'Yes' : 'No'}</div>
	<div class="text-zinc-500">Segments</div><div>{data.segmentCount}</div>
</div>

<h2 class="text-lg font-bold mb-3">Laps ({data.laps.length})</h2>
{#if data.laps.length > 0}
	<table class="w-full text-sm mb-8">
		<thead>
			<tr class="border-b border-zinc-200 text-left text-zinc-500">
				<th class="py-1 pr-3">#</th>
				<th class="py-1 pr-3">Distance</th>
				<th class="py-1 pr-3">Moving Time</th>
				<th class="py-1 pr-3">Avg HR</th>
				<th class="py-1 pr-3">Avg Pace</th>
			</tr>
		</thead>
		<tbody>
			{#each data.laps as lap (lap.id)}
				<tr class="border-b border-zinc-100">
					<td class="py-1 pr-3">{lap.lapIndex + 1}</td>
					<td class="py-1 pr-3">{lap.distance ? (lap.distance / 1000).toFixed(2) + ' km' : '-'}</td>
					<td class="py-1 pr-3">{lap.movingTime ? Math.floor(lap.movingTime / 60) + 'm' : '-'}</td>
					<td class="py-1 pr-3">{lap.averageHeartrate ?? '-'}</td>
					<td class="py-1 pr-3">{lap.averageSpeed ? (1000 / lap.averageSpeed / 60).toFixed(2) + ' min/km' : '-'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="text-sm text-zinc-400 mb-8">No laps</p>
{/if}

<h2 class="text-lg font-bold mb-3">Streams ({data.streams.length})</h2>
{#if data.streams.length > 0}
	<div class="flex flex-wrap gap-2 mb-8">
		{#each data.streams as stream (stream.streamType)}
			<span class="px-2 py-1 bg-zinc-100 rounded text-xs">
				{stream.streamType}
				{#if stream.originalSize}({stream.originalSize} pts){/if}
			</span>
		{/each}
	</div>
{:else}
	<p class="text-sm text-zinc-400 mb-8">No streams</p>
{/if}

{#if a.sourceRaw}
	<h2 class="text-lg font-bold mb-3">Raw Source Data</h2>
	<pre class="bg-zinc-50 border border-zinc-200 rounded p-4 text-xs overflow-auto max-h-96">{JSON.stringify(a.sourceRaw, null, 2)}</pre>
{/if}
