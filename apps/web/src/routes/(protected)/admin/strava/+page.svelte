<script lang="ts">
	let { data } = $props();

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
