<script lang="ts">
	import { resolve } from '$app/paths';
	let { data } = $props();
</script>

<div class="p-8">
	<h1 class="text-3xl font-bold">web-runner</h1>

	<h2 class="mt-6 font-bold">Session</h2>
	<pre>{JSON.stringify(data.user, null, 2)}</pre>

	<h2 class="mt-6 font-bold">Strava OAuth</h2>
	{#if data.stravaAccount}
		<pre>{JSON.stringify(data.stravaAccount, null, 2)}</pre>
		<p>Token expires: {new Date(data.stravaAccount.expiresAt).toLocaleString()}</p>
	{:else}
		<p>No Strava account linked</p>
	{/if}

	<div class="mt-6 flex gap-4 items-center">
		{#if data.user.isAdmin}
			<a href={resolve('/admin')} class="underline">Admin</a>
		{/if}
		<form method="POST" action="/auth/logout">
			<button type="submit" class="underline">Logout</button>
		</form>
	</div>
</div>
