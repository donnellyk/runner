<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	let { data } = $props();
	let user = $derived(data.profile);

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
