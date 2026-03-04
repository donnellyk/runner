<script lang="ts">
	import { resolve } from '$app/paths';
	import RouteMap from '$lib/components/RouteMap.svelte';
	import StreamChart from '$lib/components/StreamChart.svelte';
	let { data } = $props();
	const a = data.activity;

	function getRouteCoordinates(): [number, number][] | null {
		if (a.routeGeoJson) {
			const geo = JSON.parse(a.routeGeoJson);
			return geo.coordinates;
		}
		const latlngStream = data.chartStreams.find((s) => s.streamType === 'latlng');
		if (latlngStream) {
			const pts = latlngStream.data as [number, number][];
			return pts.map(([lat, lng]) => [lng, lat]);
		}
		return null;
	}

	function getStreamData(type: string): number[] | null {
		const stream = data.chartStreams.find((s) => s.streamType === type);
		if (!stream) return null;
		return stream.data as number[];
	}

	const routeCoords = getRouteCoordinates();

	const streamConfigs = [
		{ type: 'heartrate', label: 'Heart Rate', color: '#ef4444', unit: ' bpm' },
		{ type: 'altitude', label: 'Altitude', color: '#22c55e', unit: ' m' },
		{ type: 'velocity_smooth', label: 'Speed', color: '#3b82f6', unit: ' m/s' },
		{ type: 'cadence', label: 'Cadence', color: '#a855f7', unit: ' rpm' },
		{ type: 'watts', label: 'Power', color: '#f97316', unit: ' W' },
		{ type: 'grade_smooth', label: 'Grade', color: '#64748b', unit: '%' },
	];

	const maxStreamLen = Math.max(...streamConfigs.map((c) => getStreamData(c.type)?.length ?? 0));
	const maxWidth = typeof window !== 'undefined' ? window.innerWidth * 2 : 2000;
	const chartWidth = Math.min(Math.max(maxStreamLen * 2, 300), maxWidth);
</script>

<div class="mb-4">
	<a href={resolve('/admin/activities')} class="text-sm text-zinc-500 hover:text-zinc-800">&larr; Back</a>
</div>

<h1 class="text-2xl font-bold mb-6">{a.name}</h1>

{#if routeCoords}
	<div class="mb-8 overflow-x-auto">
		<RouteMap coordinates={routeCoords} />
	</div>
{/if}

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

{#if maxStreamLen > 0}
	<h2 class="text-lg font-bold mb-3">Stream Charts</h2>
	<div class="overflow-x-auto mb-8 bg-zinc-50 border border-zinc-200 rounded-lg p-4">
		{#each streamConfigs as config (config.type)}
			{@const streamData = getStreamData(config.type)}
			{#if streamData}
				<StreamChart data={streamData} label={config.label} color={config.color} unit={config.unit} svgWidth={chartWidth} />
			{/if}
		{/each}
	</div>
{/if}

{#if a.sourceRaw}
	<h2 class="text-lg font-bold mb-3">Raw Source Data</h2>
	<pre class="bg-zinc-50 border border-zinc-200 rounded p-4 text-xs overflow-auto max-h-96">{JSON.stringify(a.sourceRaw, null, 2)}</pre>
{/if}
