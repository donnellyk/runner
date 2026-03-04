<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { formatDistance } from '$lib/format';
	import type { Units } from '$lib/format';
	let { data } = $props();
	let user = $derived(data.profile);
	let units: Units = $derived(user.distanceUnit as Units);

	function tokenStatus(expiresAt: string | Date | null) {
		if (!expiresAt) return { label: 'Missing', color: 'text-zinc-400' };
		const expires = new Date(expiresAt);
		if (expires < new Date()) return { label: 'Expired', color: 'text-red-600' };
		return { label: 'Valid', color: 'text-green-600' };
	}

	let status = $derived(tokenStatus(user.tokenExpiresAt));

	function handleUnitChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const form = target.closest('form') as HTMLFormElement;
		form.requestSubmit();
	}

	function statusColor(s: string) {
		switch (s) {
			case 'complete': return 'bg-green-100 text-green-800';
			case 'failed': return 'bg-red-100 text-red-800';
			case 'pending': return 'bg-yellow-100 text-yellow-800';
			case 'streams_pending': return 'bg-blue-100 text-blue-800';
			default: return 'bg-zinc-100 text-zinc-600';
		}
	}

	function formatTime(seconds: number | null) {
		if (!seconds) return '-';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}
</script>

<div class="mb-4">
	<a href={resolve('/admin/users')} class="text-sm text-zinc-500 hover:text-zinc-800">&larr; Back to Users</a>
</div>

<h1 class="text-2xl font-bold mb-6">{user.firstName} {user.lastName}</h1>

<div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-8 max-w-md">
	<div class="text-zinc-500">Strava ID</div>
	<div class="font-mono">{user.stravaAthleteId}</div>
	<div class="text-zinc-500">Admin</div>
	<div>{user.isAdmin ? 'Yes' : 'No'}</div>
	<div class="text-zinc-500">Token</div>
	<div class={status.color}>{status.label}</div>
	<div class="text-zinc-500">Timezone</div>
	<div>{user.timezone}</div>
	<div class="text-zinc-500">Activities</div>
	<div>{user.activityCount}</div>
	<div class="text-zinc-500">Last Sync</div>
	<div class="text-xs">{user.lastSync ? new Date(user.lastSync).toLocaleString() : '-'}</div>
	<div class="text-zinc-500">Created</div>
	<div class="text-xs">{new Date(user.createdAt).toLocaleDateString()}</div>
</div>

<h2 class="text-lg font-bold mb-3">Distance Units</h2>

<form method="POST" action="?/updateUnits" use:enhance={() => {
	return async ({ update }) => {
		await update();
		await invalidateAll();
	};
}}>
	<fieldset class="flex gap-4">
		<label class="flex items-center gap-2 text-sm">
			<input type="radio" name="distanceUnit" value="metric" checked={user.distanceUnit === 'metric'} onchange={handleUnitChange} />
			Metric (km, m)
		</label>
		<label class="flex items-center gap-2 text-sm">
			<input type="radio" name="distanceUnit" value="imperial" checked={user.distanceUnit === 'imperial'} onchange={handleUnitChange} />
			Imperial (mi, ft)
		</label>
	</fieldset>
</form>

<h2 class="text-lg font-bold mt-8 mb-3">Activities ({data.activities.length})</h2>

{#if data.activities.length > 0}
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-zinc-200 text-left text-zinc-500">
				<th class="py-2 pr-4">Name</th>
				<th class="py-2 pr-4">Sport</th>
				<th class="py-2 pr-4">Status</th>
				<th class="py-2 pr-4">Distance</th>
				<th class="py-2 pr-4">Time</th>
				<th class="py-2 pr-4">Date</th>
			</tr>
		</thead>
		<tbody>
			{#each data.activities as activity (activity.id)}
				<tr class="border-b border-zinc-100 cursor-pointer hover:bg-zinc-50" onclick={() => goto(resolve(`/admin/activities/${activity.id}`))}>
					<td class="py-2 pr-4">{activity.name}</td>
					<td class="py-2 pr-4">{activity.sportType}</td>
					<td class="py-2 pr-4">
						<span class="px-2 py-0.5 rounded text-xs {statusColor(activity.syncStatus)}">
							{activity.syncStatus}
						</span>
					</td>
					<td class="py-2 pr-4">{formatDistance(activity.distance, units)}</td>
					<td class="py-2 pr-4">{formatTime(activity.movingTime)}</td>
					<td class="py-2 pr-4 text-xs">{new Date(activity.startDate).toLocaleDateString()}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="text-sm text-zinc-400">No activities</p>
{/if}
