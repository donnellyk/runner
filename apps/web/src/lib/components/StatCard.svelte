<script lang="ts">
	interface Props {
		label: string;
		value: string;
		sub?: string;
		color?: string;
	}
	let { label, value, sub, color }: Props = $props();
</script>

<div
	class="rounded-lg border border-zinc-200 bg-white px-4 py-3"
	style={color ? `border-left: 3px solid ${color}; background: color-mix(in srgb, ${color} 5%, white);` : ''}
>
	<div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{label}</div>
	<div class="font-mono text-2xl font-semibold text-zinc-900" style="font-variant-numeric: tabular-nums;">{value}</div>
	{#if sub}
		<div class="font-mono text-xs text-zinc-400 mt-0.5" style="font-variant-numeric: tabular-nums;">{sub}</div>
	{/if}
</div>
