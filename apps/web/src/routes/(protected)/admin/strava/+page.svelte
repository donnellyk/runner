<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let loading = $state(false);

	function withLoading() {
		loading = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			loading = false;
		};
	}

	const actionLabel: Record<string, string> = {
		listActivities: 'List Activities (30 recent)',
		listRaces: 'List Races (workout_type=1)',
		refresh: 'Refresh (since last DB activity)',
		getActivity: 'Get Activity',
	};

	function pct(usage: number, limit: number) {
		return Math.min(100, Math.round((usage / limit) * 100));
	}

	function barColor(usage: number, limit: number) {
		const p = usage / limit;
		if (p < 0.5) return 'bg-green-500';
		if (p < 0.8) return 'bg-yellow-500';
		return 'bg-red-500';
	}

	function formatTtl(seconds: number) {
		if (seconds <= 0) return 'expired';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		if (h > 0) return `${h}h ${m}m`;
		if (m > 0) return `${m}m ${s}s`;
		return `${s}s`;
	}
</script>

<h1 class="text-2xl font-bold mb-6">Strava</h1>

<h2 class="text-lg font-bold mb-4">Rate Limits</h2>

<div class="space-y-4 mb-8 max-w-lg">
	<div>
		<div class="flex justify-between text-sm mb-1">
			<span>15-minute window</span>
			<span>{data.rateLimit.shortTerm.usage} / {data.rateLimit.shortTerm.limit} ({pct(data.rateLimit.shortTerm.usage, data.rateLimit.shortTerm.limit)}%)</span>
		</div>
		<div class="w-full bg-zinc-200 rounded h-3">
			<div
				class="h-3 rounded {barColor(data.rateLimit.shortTerm.usage, data.rateLimit.shortTerm.limit)}"
				style="width: {pct(data.rateLimit.shortTerm.usage, data.rateLimit.shortTerm.limit)}%"
			></div>
		</div>
		<div class="text-xs text-zinc-500 mt-1">Resets in {formatTtl(data.rateLimit.shortTerm.ttl)}</div>
	</div>

	<div>
		<div class="flex justify-between text-sm mb-1">
			<span>Daily</span>
			<span>{data.rateLimit.daily.usage} / {data.rateLimit.daily.limit} ({pct(data.rateLimit.daily.usage, data.rateLimit.daily.limit)}%)</span>
		</div>
		<div class="w-full bg-zinc-200 rounded h-3">
			<div
				class="h-3 rounded {barColor(data.rateLimit.daily.usage, data.rateLimit.daily.limit)}"
				style="width: {pct(data.rateLimit.daily.usage, data.rateLimit.daily.limit)}%"
			></div>
		</div>
		<div class="text-xs text-zinc-500 mt-1">Resets in {formatTtl(data.rateLimit.daily.ttl)}</div>
	</div>
</div>

<h2 class="text-lg font-bold mb-4">Webhook</h2>

<div class="text-sm space-y-2 max-w-lg">
	<div class="flex justify-between">
		<span class="text-zinc-500">Subscription ID</span>
		<span>
			{#if data.webhook.subscriptionId}
				<span class="font-mono">{data.webhook.subscriptionId}</span>
			{:else}
				<span class="text-red-600">Not configured</span>
			{/if}
		</span>
	</div>
	<div class="flex justify-between">
		<span class="text-zinc-500">Verify Token</span>
		<span class={data.webhook.verifyTokenConfigured ? 'text-green-600' : 'text-red-600'}>
			{data.webhook.verifyTokenConfigured ? 'Configured' : 'Missing'}
		</span>
	</div>
</div>

<div class="mt-6 text-xs text-zinc-400">
	Manage webhooks via CLI: <code>mise run webhook:subscribe</code>,
	<code>mise run webhook:list</code>, <code>mise run webhook:delete</code>
</div>

<h2 class="text-lg font-bold mt-10 mb-4">API Explorer</h2>

<form method="POST" use:enhance={withLoading} class="mb-6 space-y-4">
	<div class="flex gap-4 items-end flex-wrap">
		<label class="text-sm">
			<span class="block text-zinc-500 mb-1">User</span>
			<select name="userId" class="border border-zinc-300 rounded px-2 py-1 text-sm">
				{#each data.users as u (u.id)}
					<option value={u.id}>{u.firstName} {u.lastName}</option>
				{/each}
			</select>
		</label>
		<button
			formaction="?/listActivities"
			type="submit"
			disabled={loading}
			class="px-3 py-1 bg-zinc-800 text-white rounded text-sm disabled:opacity-50"
		>
			Full Sync
		</button>
		<button
			formaction="?/listRaces"
			type="submit"
			disabled={loading}
			class="px-3 py-1 bg-zinc-800 text-white rounded text-sm disabled:opacity-50"
		>
			Race Sync
		</button>
		<button
			formaction="?/refresh"
			type="submit"
			disabled={loading}
			class="px-3 py-1 border border-zinc-300 rounded text-sm disabled:opacity-50"
		>
			Refresh
		</button>
	</div>

	<div class="flex gap-4 items-end">
		<label class="text-sm">
			<span class="block text-zinc-500 mb-1">Strava Activity ID</span>
			<input
				type="number"
				name="activityId"
				placeholder="e.g. 1234567890"
				class="border border-zinc-300 rounded px-2 py-1 text-sm w-40 font-mono"
			/>
		</label>
		<button
			formaction="?/getActivity"
			type="submit"
			disabled={loading}
			class="px-3 py-1 border border-zinc-300 rounded text-sm disabled:opacity-50"
		>
			Get Activity
		</button>
	</div>
</form>

{#if loading}
	<div class="text-sm text-zinc-500 mb-4">Fetching from Strava…</div>
{/if}

{#if form && 'error' in form}
	<div class="text-sm text-red-600 mb-4">{form.error}</div>
{/if}

{#if form && 'rateLimit' in form && form.rateLimit && form.items}
	<div class="flex items-center gap-6 text-xs text-zinc-500 mb-3">
		<span class="font-medium text-zinc-700">{actionLabel[form.action as string]}</span>
		<span>
			{form.items.length} result{form.items.length === 1 ? '' : 's'}{#if 'scanned' in form}&nbsp;(scanned {form.scanned}){/if}{#if 'after' in form}&nbsp;· after {new Date((form.after as number) * 1000).toLocaleString()}{/if}
		</span>
		<span class="ml-auto">
			Rate limit: {form.rateLimit.usage.shortTerm}/{form.rateLimit.limits.shortTerm} (15m) &middot; {form.rateLimit.usage.daily}/{form.rateLimit.limits.daily} (daily)
		</span>
	</div>
	<pre class="bg-zinc-950 text-zinc-100 text-xs p-4 rounded overflow-auto max-h-[70vh] font-mono leading-relaxed">{JSON.stringify(form.items, null, 2)}</pre>
{/if}
