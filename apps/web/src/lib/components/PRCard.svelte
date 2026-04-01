<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDurationClock } from '$lib/format';
	import { NOISE_DATA_URI } from '$lib/mesh-gradient';
	import { fireConfetti } from '$lib/confetti';

	interface Props {
		raceDistance: string;
		timeSeconds: number;
		isBest: boolean;
		glow?: boolean;
		bgColor?: string;
		meshColor1?: string;
		meshColor2?: string;
		noiseOpacity?: number;
		glowSens?: number;
		colorSens?: number;
		glowHue?: number;
		glowSat?: number;
		glowLight?: number;
		glowBoost?: number;
		glowIntensity?: number;
		edgeFalloff?: number;
		edgeBlend?: string;
		glowBlend?: string;
		onremoved?: () => void;
		onanimateGlow?: (fn: () => void) => void;
	}

	let { raceDistance, timeSeconds, isBest, glow = true, bgColor = '#2d1b2e', meshColor1 = '#f472b6', meshColor2 = '#c084fc', noiseOpacity = 0.13, glowSens = 30, colorSens = 50, glowHue = 25, glowSat = 100, glowLight = 60, glowBoost = 15, glowIntensity = 1.25, edgeFalloff = 0.85, edgeBlend = 'soft-light', glowBlend = 'plus-lighter', onremoved, onanimateGlow }: Props = $props();

	let pointerDeg = $state(45);
	let pointerD = $state(0);
	let pointerX = $state(50);
	let pointerY = $state(50);
	let hyp = $state(0);
	let interacting = $state(false);
	let animating = $state(false);
	let animTiltX = $state(0);
	let animTiltY = $state(0);

	function easeOutCubic(x: number) { return 1 - Math.pow(1 - x, 3); }
	function easeInCubic(x: number) { return x * x * x; }

	function animateValue(opts: {
		start?: number; end?: number; duration: number; delay?: number;
		ease?: (t: number) => number;
		onUpdate: (v: number) => void;
		onEnd?: () => void;
	}) {
		const { start = 0, end = 100, duration, delay = 0, ease = easeOutCubic, onUpdate, onEnd } = opts;
		const run = () => {
			const startTime = performance.now();
			function tick() {
				const t = Math.min(1, (performance.now() - startTime) / duration);
				onUpdate(start + (end - start) * ease(t));
				if (t < 1) requestAnimationFrame(tick);
				else onEnd?.();
			}
			requestAnimationFrame(tick);
		};
		if (delay > 0) setTimeout(run, delay);
		else run();
	}

	function playGlowAnimation() {
		if (animating) return;
		animating = true;

		const angleStart = 110;
		const angleEnd = 465;
		const maxD = 88;
		const maxTilt = 5;
		pointerDeg = angleStart;

		function updateTilt(deg: number, strength: number) {
			const rad = (deg - 90) * (Math.PI / 180);
			animTiltX = Math.cos(rad) * maxTilt * (strength / 100);
			animTiltY = Math.sin(rad) * maxTilt * (strength / 100);
		}

		animateValue({
			ease: easeOutCubic, duration: 200, end: maxD,
			onUpdate: (v) => { pointerD = v; updateTilt(pointerDeg, v); },
		});

		animateValue({
			ease: easeInCubic, duration: 600, end: 50,
			onUpdate: (v) => {
				const deg = angleStart + (angleEnd - angleStart) * (v / 100);
				pointerDeg = deg;
				updateTilt(deg, pointerD);
			},
		});

		animateValue({
			ease: easeOutCubic, duration: 900, delay: 600,
			start: 50, end: 100,
			onUpdate: (v) => {
				const deg = angleStart + (angleEnd - angleStart) * (v / 100);
				pointerDeg = deg;
				updateTilt(deg, pointerD);
			},
		});

		animateValue({
			ease: easeInCubic, duration: 800, delay: 1200,
			start: maxD, end: 0,
			onUpdate: (v) => { pointerD = v; updateTilt(pointerDeg, v); },
			onEnd: () => { animating = false; animTiltX = 0; animTiltY = 0; },
		});
	}

	$effect(() => {
		onanimateGlow?.(playGlowAnimation);
	});

	let cardWidth = $state(300);
	const tiltStrength = $derived(cardWidth < 300 ? 3.5 : 7);
	const rotateX = $derived(animating ? animTiltX : interacting ? -((pointerX - 50) / tiltStrength) : 0);
	const rotateY = $derived(animating ? animTiltY : interacting ? ((pointerY - 50) / tiltStrength) : 0);

	function handleMove(e: PointerEvent) {
		if (!isBest || animating) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const cx = rect.width / 2;
		const cy = rect.height / 2;
		const dx = x - cx;
		const dy = y - cy;

		const perx = Math.max(0, Math.min(100, (100 / rect.width) * x));
		const pery = Math.max(0, Math.min(100, (100 / rect.height) * y));
		pointerX = perx;
		pointerY = pery;

		if (dx !== 0 || dy !== 0) {
			let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
			if (deg < 0) deg += 360;
			pointerDeg = Math.round(deg * 1000) / 1000;
		}

		let kx = Infinity;
		let ky = Infinity;
		if (dx !== 0) kx = cx / Math.abs(dx);
		if (dy !== 0) ky = cy / Math.abs(dy);
		const edge = Math.max(0, Math.min(1, 1 / Math.min(kx, ky)));
		pointerD = Math.round(edge * 100 * 1000) / 1000;

		hyp = Math.min(1, Math.sqrt(((perx - 50) / 50) ** 2 + ((pery - 50) / 50) ** 2));
		interacting = true;
	}

	function handleLeave() {
		interacting = false;
		pointerX = 50;
		pointerY = 50;
		hyp = 0;
		pointerD = 0;
	}
</script>

{#if isBest}
<div
	class="pr-card-wrapper"
	bind:clientWidth={cardWidth}
	style="--rotate-x: {rotateX}deg; --rotate-y: {rotateY}deg;"
	onpointermove={handleMove}
	onpointerleave={handleLeave}
	data-pr-card
>
	<div class="pr-card-rotator">
		<div
			class="pr-card"
			class:hovering={interacting || animating}
			class:has-glow={glow}
			style="
				--pointer-d: {pointerD};
				--pointer-deg: {pointerDeg}deg;
				--card-bg: {bgColor};
				--glow-sens: {glowSens};
				--color-sens: {colorSens};
				--glow-color: {glowHue}deg {glowSat}% {glowLight}%;
				--glow-boost: {glowBoost}%;
				--glow-intensity: {glowIntensity};
				--edge-falloff: {edgeFalloff};
				--blend: {edgeBlend};
				--glow-blend: {glowBlend};
				background:
					{meshColor1 ? `radial-gradient(at 30% 70%, ${meshColor1}44 0%, transparent 50%),` : ''}
					{meshColor2 ? `radial-gradient(at 70% 30%, ${meshColor2}44 0%, transparent 50%),` : ''}
					linear-gradient(8deg, {bgColor} 75%, color-mix(in hsl, {bgColor}, white 2.5%) 75.5%);
			"
		>
			{#if glow}
				<span class="glow"></span>
			{/if}
			<div class="pr-card-inner">
				{#if noiseOpacity > 0}
					<div class="pr-card-noise" style="background-image: {NOISE_DATA_URI}; opacity: {noiseOpacity};"></div>
				{/if}
				<div class="pr-card-content group">
					<form method="POST" action="?/removePR" class="absolute top-1 right-1 z-10" use:enhance={() => {
						return async ({ update }) => {
							await update();
							onremoved?.();
						};
					}}>
						<button
							type="submit"
							class="opacity-0 group-hover:opacity-100 cursor-pointer text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-all"
							title="Remove PR"
						>
							<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18 6L6 18M6 6l12 12"/>
							</svg>
						</button>
					</form>
					<button
						class="font-serif text-3xl font-bold text-zinc-100 cursor-pointer"
						style="line-height: 1; background: none; border: none; padding: 0; text-align: left;"
						onclick={() => {
							playGlowAnimation();
							fireConfetti();
						}}
					>
						PR
					</button>
					<div class="font-mono text-lg font-semibold text-zinc-300 mt-1.5" style="font-variant-numeric: tabular-nums;">
						{formatDurationClock(timeSeconds)}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
{:else}
<div
	class="relative rounded-lg px-4 py-3 overflow-hidden border border-zinc-200 bg-zinc-50"
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
				class="opacity-0 group-hover:opacity-100 cursor-pointer text-zinc-400 hover:text-zinc-600 p-0.5 rounded transition-all"
				title="Remove PR"
			>
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12"/>
				</svg>
			</button>
		</form>
		<div class="font-serif text-3xl font-bold text-zinc-400" style="line-height: 1;">
			Former PR
		</div>
		<div class="font-mono text-lg font-semibold text-zinc-500 mt-1.5" style="font-variant-numeric: tabular-nums;">
			{formatDurationClock(timeSeconds)}
		</div>
	</div>
</div>
{/if}

<style>
	.pr-card-wrapper {
		--pads: 40px;
		perspective: 600px;
		transform-style: preserve-3d;
		padding: var(--pads);
		margin: calc(var(--pads) * -1);
		container-type: inline-size;
	}

	.pr-card-rotator {
		position: relative;
		transform: rotateY(var(--rotate-x)) rotateX(var(--rotate-y));
		transform-style: preserve-3d;
		transition: transform 0.3s ease-out;
		will-change: transform;
	}

	.pr-card {
		--pads: 40px;

		position: relative;
		border-radius: 0.5rem;
		isolation: isolate;
		transform: translate3d(0, 0, 0.01px);
		display: grid;
		border: 1px solid rgb(255 255 255 / 25%);
		box-shadow:
			rgba(0, 0, 0, 0.1) 0px 1px 2px,
			rgba(0, 0, 0, 0.1) 0px 2px 4px,
			rgba(0, 0, 0, 0.1) 0px 4px 8px,
			rgba(0, 0, 0, 0.1) 0px 8px 16px;
	}

	.pr-card::before,
	.pr-card::after {
		content: "";
		position: absolute;
		inset: 0;
		border-radius: inherit;
		transition: opacity 0.25s ease-out;
		z-index: -1;
	}

	.pr-card > :global(.glow) {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		transition: opacity 0.25s ease-out;
		z-index: 1;
	}

	.pr-card:not(.hovering) {
		&::before,
		&::after,
		& > :global(.glow) {
			opacity: 0 !important;
			transition: opacity 0.75s ease-in-out;
		}
	}

	.pr-card::before {
		border: 1px solid transparent;
		background:
			linear-gradient(var(--card-bg), var(--card-bg)) padding-box,
			linear-gradient(rgb(255 255 255 / 0%) 0% 100%) border-box,
			radial-gradient(at 80% 55%, hsla(268,100%,76%,1) 0px, transparent 50%) border-box,
			radial-gradient(at 69% 34%, hsla(349,100%,74%,1) 0px, transparent 50%) border-box,
			radial-gradient(at 8% 6%, hsla(136,100%,78%,1) 0px, transparent 50%) border-box,
			radial-gradient(at 41% 38%, hsla(192,100%,64%,1) 0px, transparent 50%) border-box,
			radial-gradient(at 86% 85%, hsla(186,100%,74%,1) 0px, transparent 50%) border-box,
			radial-gradient(at 82% 18%, hsla(52,100%,65%,1) 0px, transparent 50%) border-box,
			radial-gradient(at 51% 4%, hsla(12,100%,72%,1) 0px, transparent 50%) border-box,
			linear-gradient(#c299ff 0 100%) border-box;

		opacity: calc(var(--glow-intensity) * (var(--pointer-d) - var(--color-sens)) / ((100 - var(--color-sens)) * var(--edge-falloff)));
		mask-image: conic-gradient(
			from var(--pointer-deg) at center,
			black 25%, transparent 40%, transparent 60%, black 75%
		);
	}

	.pr-card::after {
		border: 1px solid transparent;
		background:
			radial-gradient(at 80% 55%, hsla(268,100%,76%,1) 0px, transparent 50%) padding-box,
			radial-gradient(at 69% 34%, hsla(349,100%,74%,1) 0px, transparent 50%) padding-box,
			radial-gradient(at 8% 6%, hsla(136,100%,78%,1) 0px, transparent 50%) padding-box,
			radial-gradient(at 41% 38%, hsla(192,100%,64%,1) 0px, transparent 50%) padding-box,
			radial-gradient(at 86% 85%, hsla(186,100%,74%,1) 0px, transparent 50%) padding-box,
			radial-gradient(at 82% 18%, hsla(52,100%,65%,1) 0px, transparent 50%) padding-box,
			radial-gradient(at 51% 4%, hsla(12,100%,72%,1) 0px, transparent 50%) padding-box,
			linear-gradient(#c299ff 0 100%) padding-box;

		mask-image:
			linear-gradient(to bottom, black, black),
			radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%),
			radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%),
			radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%),
			radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%),
			radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%),
			conic-gradient(from var(--pointer-deg) at center, transparent 5%, black 15%, black 85%, transparent 95%);
		mask-composite: subtract, add, add, add, add, add;

		opacity: calc(var(--glow-intensity) * (var(--pointer-d) - var(--color-sens)) / ((100 - var(--color-sens)) * var(--edge-falloff)));
		mix-blend-mode: var(--blend);
	}

	.pr-card > :global(.glow) {
		--outset: var(--pads);
		inset: calc(var(--outset) * -1) !important;
		pointer-events: none;
		z-index: 1 !important;

		mask-image: conic-gradient(
			from var(--pointer-deg) at center,
			black 2.5%, transparent 10%, transparent 90%, black 97.5%
		);

		opacity: calc(var(--glow-intensity) * (var(--pointer-d) - var(--glow-sens)) / ((100 - var(--glow-sens)) * var(--edge-falloff)));
		mix-blend-mode: var(--glow-blend);
	}

	.pr-card > :global(.glow)::before {
		content: "";
		position: absolute;
		inset: var(--pads);
		border-radius: inherit;
		box-shadow:
			inset 0 0 0 1px hsl(var(--glow-color) / 100%),

			inset 0 0 1px 0 hsl(var(--glow-color) / calc(var(--glow-boost) + 60%)),
			inset 0 0 3px 0 hsl(var(--glow-color) / calc(var(--glow-boost) + 50%)),
			inset 0 0 6px 0 hsl(var(--glow-color) / calc(var(--glow-boost) + 40%)),
			inset 0 0 15px 0 hsl(var(--glow-color) / calc(var(--glow-boost) + 30%)),
			inset 0 0 25px 2px hsl(var(--glow-color) / calc(var(--glow-boost) + 20%)),
			inset 0 0 50px 2px hsl(var(--glow-color) / calc(var(--glow-boost) + 10%)),

			0 0 1px 0 hsl(var(--glow-color) / calc(var(--glow-boost) + 60%)),
			0 0 3px 0 hsl(var(--glow-color) / calc(var(--glow-boost) + 50%)),
			0 0 6px 0 hsl(var(--glow-color) / calc(var(--glow-boost) + 40%)),
			0 0 15px 0 hsl(var(--glow-color) / calc(var(--glow-boost) + 30%)),
			0 0 25px 2px hsl(var(--glow-color) / calc(var(--glow-boost) + 20%)),
			0 0 50px 2px hsl(var(--glow-color) / calc(var(--glow-boost) + 10%));
	}

	.pr-card:not(.has-glow)::before,
	.pr-card:not(.has-glow)::after {
		display: none;
	}

	.pr-card-inner {
		position: relative;
		z-index: 1;
		border-radius: inherit;
		overflow: hidden;
		display: grid;
	}

	.pr-card-noise {
		grid-area: 1/1;
		border-radius: inherit;
		mix-blend-mode: overlay;
		pointer-events: none;
	}

	.pr-card-content {
		grid-area: 1/1;
		position: relative;
		z-index: 3;
		padding: 0.75rem 1rem;
	}
</style>
