<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';

	let { data, children } = $props();

	const navItems = [
		{ href: '/activities', label: 'Activities' },
		{ href: '/settings', label: 'Settings' },
	] as const;
</script>

<div class="min-h-screen bg-white">
	<header class="border-b border-zinc-200 bg-white">
		<div class="max-w-5xl mx-auto px-8 h-14 flex items-center justify-between">
			<a href={resolve('/activities')} class="font-serif text-2xl font-semibold text-zinc-900 leading-none">
				Carthage
			</a>
			<nav class="flex items-center gap-1">
				{#each navItems as item (item.href)}
					<a
						href={resolve(item.href)}
						class="px-3 py-1.5 rounded text-sm {page.url.pathname.startsWith(item.href)
							? 'bg-zinc-100 font-medium text-zinc-900'
							: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'}"
					>
						{item.label}
					</a>
				{/each}
				{#if data.user?.isAdmin}
					<a
						href={resolve('/admin/activities')}
						class="ml-4 text-xs text-zinc-400 hover:text-zinc-600"
					>
						Admin
					</a>
				{/if}
				<form method="POST" action="/auth/logout" use:enhance class="ml-2 flex items-center">
					<button class="text-xs text-zinc-400 hover:text-zinc-600">Logout</button>
				</form>
			</nav>
		</div>
	</header>
	<main class="max-w-5xl mx-auto px-8 py-8">
		{@render children()}
	</main>
</div>
