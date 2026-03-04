<script lang="ts">
	import { resolve } from '$app/paths';
	import RouteMap from '$lib/components/RouteMap.svelte';
	import StreamChart from '$lib/components/StreamChart.svelte';
	import { formatDistancePrecise, formatElevation, formatPace, formatPaceValue, formatSegmentDistance, segmentDistanceLabel } from '$lib/format';
	import type { Units } from '$lib/format';
	let { data } = $props();
	const a = data.activity;
	const units: Units = data.user.distanceUnit as Units;

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

	function fmtNum(v: number | null, decimals = 1): string {
		if (v == null) return '-';
		return v.toFixed(decimals);
	}
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
	<div class="text-zinc-500">Distance</div><div>{formatDistancePrecise(a.distance, units)}</div>
	<div class="text-zinc-500">Moving Time</div><div>{a.movingTime ? Math.floor(a.movingTime / 60) + 'm' : '-'}</div>
	<div class="text-zinc-500">Elapsed Time</div><div>{a.elapsedTime ? Math.floor(a.elapsedTime / 60) + 'm' : '-'}</div>
	<div class="text-zinc-500">Elevation Gain</div><div>{formatElevation(a.totalElevationGain, units)}</div>
	<div class="text-zinc-500">Avg HR</div><div>{a.averageHeartrate ?? '-'}</div>
	<div class="text-zinc-500">Max HR</div><div>{a.maxHeartrate ?? '-'}</div>
	<div class="text-zinc-500">Avg Cadence</div><div>{a.averageCadence ?? '-'}</div>
	<div class="text-zinc-500">Avg Watts</div><div>{a.averageWatts ?? '-'}</div>
	<div class="text-zinc-500">Device</div><div>{a.deviceName ?? '-'}</div>
	<div class="text-zinc-500">Gear ID</div><div>{a.gearId ?? '-'}</div>
	<div class="text-zinc-500">Has GPS</div><div>{a.route ? 'Yes' : 'No'}</div>
	<div class="text-zinc-500">Segments</div><div>{data.segments.length}</div>
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
					<td class="py-1 pr-3">{formatDistancePrecise(lap.distance, units)}</td>
					<td class="py-1 pr-3">{lap.movingTime ? Math.floor(lap.movingTime / 60) + 'm' : '-'}</td>
					<td class="py-1 pr-3">{lap.averageHeartrate ?? '-'}</td>
					<td class="py-1 pr-3">{formatPace(lap.averageSpeed, units)}</td>
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

<h2 class="text-lg font-bold mb-3">Segments ({data.segments.length})</h2>
{#if data.segments.length > 0}
	<div class="overflow-x-auto mb-8 bg-zinc-50 border border-zinc-200 rounded-lg p-4">
		<table class="text-sm whitespace-nowrap">
			<thead>
				<tr class="border-b border-zinc-200 text-left text-zinc-500">
					<th class="py-1 pr-4">#</th>
					<th class="py-1 pr-4">Start ({segmentDistanceLabel(units)})</th>
					<th class="py-1 pr-4">End ({segmentDistanceLabel(units)})</th>
					<th class="py-1 pr-4">Duration</th>
					<th class="py-1 pr-4">Avg Pace</th>
					<th class="py-1 pr-4">Min Pace</th>
					<th class="py-1 pr-4">Max Pace</th>
					<th class="py-1 pr-4">Avg HR</th>
					<th class="py-1 pr-4">Min HR</th>
					<th class="py-1 pr-4">Max HR</th>
					<th class="py-1 pr-4">Avg Cadence</th>
					<th class="py-1 pr-4">Min Cadence</th>
					<th class="py-1 pr-4">Max Cadence</th>
					<th class="py-1 pr-4">Avg Power</th>
					<th class="py-1 pr-4">Min Power</th>
					<th class="py-1 pr-4">Max Power</th>
					<th class="py-1 pr-4">Elev Gain</th>
					<th class="py-1 pr-4">Elev Loss</th>
					<th class="py-1 pr-4">Has Route</th>
				</tr>
			</thead>
			<tbody>
				{#each data.segments as seg (seg.id)}
					<tr class="border-b border-zinc-100">
						<td class="py-1 pr-4">{seg.segmentIndex + 1}</td>
						<td class="py-1 pr-4">{formatSegmentDistance(seg.distanceStart, units)}</td>
						<td class="py-1 pr-4">{formatSegmentDistance(seg.distanceEnd, units)}</td>
						<td class="py-1 pr-4">{seg.duration != null ? `${seg.duration}s` : '-'}</td>
						<td class="py-1 pr-4">{formatPaceValue(seg.avgPace, units)}</td>
						<td class="py-1 pr-4">{formatPaceValue(seg.minPace, units)}</td>
						<td class="py-1 pr-4">{formatPaceValue(seg.maxPace, units)}</td>
						<td class="py-1 pr-4">{fmtNum(seg.avgHeartrate)}</td>
						<td class="py-1 pr-4">{fmtNum(seg.minHeartrate)}</td>
						<td class="py-1 pr-4">{fmtNum(seg.maxHeartrate)}</td>
						<td class="py-1 pr-4">{fmtNum(seg.avgCadence)}</td>
						<td class="py-1 pr-4">{fmtNum(seg.minCadence)}</td>
						<td class="py-1 pr-4">{fmtNum(seg.maxCadence)}</td>
						<td class="py-1 pr-4">{fmtNum(seg.avgPower)}</td>
						<td class="py-1 pr-4">{fmtNum(seg.minPower)}</td>
						<td class="py-1 pr-4">{fmtNum(seg.maxPower)}</td>
						<td class="py-1 pr-4">{formatElevation(seg.elevationGain, units)}</td>
						<td class="py-1 pr-4">{formatElevation(seg.elevationLoss, units)}</td>
						<td class="py-1 pr-4">{seg.route ? 'Yes' : 'No'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="text-sm text-zinc-400 mb-8">No segments</p>
{/if}

{#if a.sourceRaw}
	<h2 class="text-lg font-bold mb-3">Raw Source Data</h2>
	<pre class="bg-zinc-50 border border-zinc-200 rounded p-4 text-xs overflow-auto max-h-96">{JSON.stringify(a.sourceRaw, null, 2)}</pre>
{/if}
