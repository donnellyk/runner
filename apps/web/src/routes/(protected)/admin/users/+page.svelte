<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	let { data } = $props();

	function rowClick(event: MouseEvent, id: number) {
		if ((event.target as HTMLElement).closest('button, a, form')) return;
		goto(resolve(`/admin/users/${id}`));
	}

	function tokenStatus(expiresAt: string | Date | null) {
		if (!expiresAt) return { label: 'Missing', color: 'text-zinc-400' };
		const expires = new Date(expiresAt);
		if (expires < new Date()) return { label: 'Expired', color: 'text-red-600' };
		return { label: 'Valid', color: 'text-green-600' };
	}
</script>

<h1 class="text-2xl font-bold mb-6">Users</h1>

<table class="w-full text-sm">
	<thead>
		<tr class="border-b border-zinc-200 text-left text-zinc-500">
			<th class="py-2 pr-4">Name</th>
			<th class="py-2 pr-4">Strava ID</th>
			<th class="py-2 pr-4">Admin</th>
			<th class="py-2 pr-4">Token</th>
			<th class="py-2 pr-4">Activities</th>
			<th class="py-2 pr-4">Last Sync</th>
			<th class="py-2 pr-4">Created</th>
		</tr>
	</thead>
	<tbody>
		{#each data.users as user (user.id)}
			{@const status = tokenStatus(user.tokenExpiresAt)}
			<tr class="border-b border-zinc-100 cursor-pointer hover:bg-zinc-50" onclick={(e) => rowClick(e, user.id)}>
				<td class="py-2 pr-4">{user.firstName} {user.lastName}</td>
				<td class="py-2 pr-4 font-mono text-xs">{user.stravaAthleteId}</td>
				<td class="py-2 pr-4">
					<form method="POST" action="?/toggleAdmin" class="inline">
						<input type="hidden" name="userId" value={user.id} />
						<button
							type="submit"
							class="px-2 py-0.5 rounded text-xs {user.isAdmin
								? 'bg-green-100 text-green-800'
								: 'bg-zinc-100 text-zinc-500'}"
						>
							{user.isAdmin ? 'Yes' : 'No'}
						</button>
					</form>
				</td>
				<td class="py-2 pr-4 {status.color}">{status.label}</td>
				<td class="py-2 pr-4">{user.activityCount}</td>
				<td class="py-2 pr-4 text-xs">
					{user.lastSync ? new Date(user.lastSync).toLocaleString() : '-'}
				</td>
				<td class="py-2 pr-4 text-xs">{new Date(user.createdAt).toLocaleDateString()}</td>
			</tr>
		{/each}
	</tbody>
</table>
