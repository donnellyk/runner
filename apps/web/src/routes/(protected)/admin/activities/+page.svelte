<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDistance } from '$lib/format';
	let { data } = $props();
	const units = data.user.distanceUnit as 'metric' | 'imperial';

	const totalPages = Math.ceil(data.total / data.pageSize);

	const activitiesPath = resolve('/admin/activities');

	function paginationQuery(page: number) {
		return new URLSearchParams({
			page: String(page),
			status: data.filters.status || '',
			sport: data.filters.sport || '',
			user: data.filters.user || '',
		}).toString();
	}

	function statusColor(status: string) {
		switch (status) {
			case 'complete':
				return 'bg-green-100 text-green-800';
			case 'failed':
				return 'bg-red-100 text-red-800';
			case 'pending':
				return 'bg-yellow-100 text-yellow-800';
			case 'streams_pending':
				return 'bg-blue-100 text-blue-800';
			default:
				return 'bg-zinc-100 text-zinc-600';
		}
	}

	function formatTime(seconds: number | null) {
		if (!seconds) return '-';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}
</script>

<h1 class="text-2xl font-bold mb-6">Activities</h1>

<form method="GET" class="flex gap-3 mb-6 items-end">
	<label class="text-sm">
		<span class="block text-zinc-500 mb-1">Status</span>
		<select name="status" class="border border-zinc-300 rounded px-2 py-1 text-sm">
			<option value="">All</option>
			{#each data.syncStatuses as s (s)}
				<option value={s} selected={data.filters.status === s}>{s}</option>
			{/each}
		</select>
	</label>
	<label class="text-sm">
		<span class="block text-zinc-500 mb-1">Sport</span>
		<select name="sport" class="border border-zinc-300 rounded px-2 py-1 text-sm">
			<option value="">All</option>
			{#each data.sportTypes as s (s)}
				<option value={s} selected={data.filters.sport === s}>{s}</option>
			{/each}
		</select>
	</label>
	<label class="text-sm">
		<span class="block text-zinc-500 mb-1">User</span>
		<select name="user" class="border border-zinc-300 rounded px-2 py-1 text-sm">
			<option value="">All</option>
			{#each data.users as u (u.id)}
				<option value={u.id} selected={data.filters.user === String(u.id)}>
					{u.firstName} {u.lastName}
				</option>
			{/each}
		</select>
	</label>
	<button type="submit" class="px-3 py-1 bg-zinc-800 text-white rounded text-sm">Filter</button>
</form>

<div class="text-sm text-zinc-500 mb-3">
	{data.total} activities &middot; Page {data.page} of {totalPages || 1}
</div>

<table class="w-full text-sm">
	<thead>
		<tr class="border-b border-zinc-200 text-left text-zinc-500">
			<th class="py-2 pr-4">Name</th>
			<th class="py-2 pr-4">Sport</th>
			<th class="py-2 pr-4">Status</th>
			<th class="py-2 pr-4">Distance</th>
			<th class="py-2 pr-4">Time</th>
			<th class="py-2 pr-4">User</th>
			<th class="py-2 pr-4">Date</th>
			<th class="py-2 pr-4">Actions</th>
		</tr>
	</thead>
	<tbody>
		{#each data.activities as activity (activity.id)}
			<tr class="border-b border-zinc-100">
				<td class="py-2 pr-4">
					<a href={resolve(`/admin/activities/${activity.id}`)} class="hover:underline">{activity.name}</a>
				</td>
				<td class="py-2 pr-4">{activity.sportType}</td>
				<td class="py-2 pr-4">
					<span class="px-2 py-0.5 rounded text-xs {statusColor(activity.syncStatus)}">
						{activity.syncStatus}
					</span>
				</td>
				<td class="py-2 pr-4">{formatDistance(activity.distance, units)}</td>
				<td class="py-2 pr-4">{formatTime(activity.movingTime)}</td>
				<td class="py-2 pr-4">{activity.userName}</td>
				<td class="py-2 pr-4 text-xs">
					{new Date(activity.startDate).toLocaleDateString()}
				</td>
				<td class="py-2 pr-4">
					{#if activity.syncStatus === 'failed'}
						<form method="POST" action="?/requeue" class="inline">
							<input type="hidden" name="activityId" value={activity.id} />
							<button type="submit" class="text-xs text-blue-600 hover:underline">
								Re-queue
							</button>
						</form>
					{/if}
				</td>
			</tr>
		{/each}
	</tbody>
</table>

{#if totalPages > 1}
	<div class="flex gap-2 mt-4">
		{#if data.page > 1}
			<a
				href="{activitiesPath}?{paginationQuery(data.page - 1)}"
				class="px-3 py-1 border border-zinc-300 rounded text-sm"
			>
				Prev
			</a>
		{/if}
		{#if data.page < totalPages}
			<a
				href="{activitiesPath}?{paginationQuery(data.page + 1)}"
				class="px-3 py-1 border border-zinc-300 rounded text-sm"
			>
				Next
			</a>
		{/if}
	</div>
{/if}
