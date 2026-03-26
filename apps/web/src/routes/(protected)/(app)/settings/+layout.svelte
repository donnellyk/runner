<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	let { children } = $props();

	const settingsNav = [
		{ href: '/settings/zones', label: 'Zones' },
		{ href: '/settings/import', label: 'Import' },
	] as const;
</script>

<h1 class="font-serif text-4xl font-semibold text-zinc-900 mb-6">Settings</h1>

<div class="flex gap-8">
	<nav class="shrink-0 w-36">
		{#each settingsNav as item (item.href)}
			<a
				href={resolve(item.href)}
				class="block px-3 py-2 rounded text-sm {page.url.pathname.startsWith(item.href)
					? 'bg-zinc-100 font-medium text-zinc-900'
					: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}"
			>
				{item.label}
			</a>
		{/each}
	</nav>
	<div class="flex-1 min-w-0">
		{@render children()}
	</div>
</div>
