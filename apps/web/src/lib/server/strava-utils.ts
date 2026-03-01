export function parseStravaTimezone(timezone: string | undefined): string {
	if (!timezone) return 'UTC';
	const match = timezone.match(/\)\s*(.+)$/);
	return match ? match[1] : 'UTC';
}
