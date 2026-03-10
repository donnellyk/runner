<script lang="ts">
	import { resolve } from '$app/paths';

	interface Props {
		activityId: number;
	}

	let { activityId }: Props = $props();
</script>

<a
	href={resolve(`/activities/${activityId}/terminal`)}
	class="block rounded-lg px-4 py-3 no-underline transition-all hover:scale-[1.01]"
	style="
		background: #0b0f1a;
		border: 1px solid #1e2640;
		font-family: 'Geist Mono', monospace;
	"
>
	<div class="text-[10px] font-semibold uppercase tracking-widest mb-1" style="color: #6b7394;">Analysis</div>
	<div class="text-2xl font-semibold" style="color: #eef0f6; font-variant-numeric: tabular-nums;">
		<span style="color: #6b7394;">&#62;</span> Terminal
	</div>
</a>
