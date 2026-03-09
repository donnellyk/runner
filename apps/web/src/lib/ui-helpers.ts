import { goto } from '$app/navigation';

export function statusColor(status: string): string {
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

export function formatTime(seconds: number | null): string {
	if (!seconds) return '-';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function tokenStatus(expiresAt: string | Date | null): { label: string; color: string } {
	if (!expiresAt) return { label: 'Missing', color: 'text-zinc-400' };
	const expires = new Date(expiresAt);
	if (expires < new Date()) return { label: 'Expired', color: 'text-red-600' };
	return { label: 'Valid', color: 'text-green-600' };
}

export function rowClick(e: MouseEvent, href: string): void {
	if ((e.target as HTMLElement).closest('button, a, form')) return;
	goto(href); // eslint-disable-line svelte/no-navigation-without-resolve -- callers pass pre-resolved hrefs
}
