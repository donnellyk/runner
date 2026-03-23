<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	let { children } = $props();

	const navItems = [
		{ href: '/admin/users' as const, label: 'Users' },
		{ href: '/admin/activities' as const, label: 'Activities' },
		{ href: '/admin/queues' as const, label: 'Queues' },
		{ href: '/admin/strava' as const, label: 'Strava' },
		{ href: '/admin/scripts' as const, label: 'Scripts' },
		{ href: '/admin/flags' as const, label: 'Flags' },
		{ href: '/admin/system' as const, label: 'System' },
	];
</script>

<div class="flex min-h-screen">
	<nav class="w-56 shrink-0 border-r border-zinc-200 bg-zinc-50 p-4">
		<div class="text-sm font-bold uppercase tracking-wide text-zinc-500 mb-6">Admin</div>
		{#each navItems as item (item.href)}
			<a
				href={resolve(item.href)}
				class="block px-3 py-2 rounded text-sm {page.url.pathname.startsWith(item.href)
					? 'bg-zinc-200 font-medium'
					: 'hover:bg-zinc-100'}"
			>
				{item.label}
			</a>
		{/each}
		<div class="pt-8 border-t border-zinc-200 mt-8">
			<a href={resolve('/')} class="text-sm text-zinc-500 hover:text-zinc-800">Back to app</a>
		</div>
	</nav>
	<main class="flex-1 p-8 min-w-0">
		{@render children()}
	</main>
</div>
