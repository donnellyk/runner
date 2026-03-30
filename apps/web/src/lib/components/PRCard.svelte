<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDurationClock } from '$lib/format';

	interface Props {
		raceDistance: string;
		timeSeconds: number;
		isBest: boolean;
		onremoved?: () => void;
	}

	let { raceDistance, timeSeconds, isBest, onremoved }: Props = $props();
</script>

<div
	class="relative rounded-lg px-4 py-3 overflow-hidden {isBest ? '' : 'border border-zinc-200 bg-zinc-50'}"
	style={isBest ? 'background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 30%, #fde68a 70%, #fbbf24 100%); border: 1px solid #fde68a; box-shadow: 0 0 12px rgba(251, 191, 36, 0.2);' : ''}
	data-pr-card
>
	<div class="group">
		<form method="POST" action="?/removePR" class="absolute top-1 right-1" use:enhance={() => {
			return async ({ update }) => {
				await update();
				onremoved?.();
			};
		}}>
			<button
				type="submit"
				class="opacity-0 group-hover:opacity-100 cursor-pointer {isBest ? 'text-amber-600 hover:text-amber-800' : 'text-zinc-400 hover:text-zinc-600'} p-0.5 rounded transition-all"
				title="Remove PR"
			>
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12"/>
				</svg>
			</button>
		</form>
		<div class="font-serif text-3xl font-bold {isBest ? 'text-amber-800' : 'text-zinc-400'}" style="line-height: 1;">
			{isBest ? 'PR' : 'Former PR'}
		</div>
		<div class="font-mono text-lg font-semibold {isBest ? 'text-amber-900' : 'text-zinc-500'} mt-1.5" style="font-variant-numeric: tabular-nums;">
			{formatDurationClock(timeSeconds)}
		</div>
	</div>
</div>
