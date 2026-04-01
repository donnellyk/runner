<script lang="ts">
	import { DEFAULT_HOLO_CONFIG, type HoloConfig } from './holo-config';
	import HoloShine from './HoloShine.svelte';

	interface Props {
		imgSrc?: string;
		imgAlt?: string;
		texture?: string;
		glow?: boolean;
		holo?: boolean;
		bgColor?: string;
		width?: string;
		height?: string;
		holoConfig?: HoloConfig;
	}

	let { imgSrc, imgAlt = 'Holographic card', texture = '/textures/trainerbg.png', glow = false, holo = true, bgColor, width, height, holoConfig }: Props = $props();

	let posx = $state(50);
	let posy = $state(50);
	let hyp = $state(0);
	let rotX = $state(0);
	let rotY = $state(0);
	let ptrDeg = $state(0);
	let edgeDist = $state(0);
	let active = $state(false);

	function handleMove(e: PointerEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width;
		const y = (e.clientY - rect.top) / rect.height;

		posx = x * 100;
		posy = y * 100;
		hyp = Math.min(1, Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2) / 0.5);
		rotY = (x - 0.5) * 20;
		rotX = (y - 0.5) * -20;
		ptrDeg = Math.atan2(y - 0.5, x - 0.5) * (180 / Math.PI) + 90;
		edgeDist = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) * 200;
		active = true;
	}

	function handleLeave() {
		posx = 50;
		posy = 50;
		hyp = 0;
		rotX = 0;
		rotY = 0;
		edgeDist = 0;
		active = false;
	}
</script>

<div
	class="holo-wrapper"
	onpointermove={handleMove}
	onpointerleave={handleLeave}
>
	<div
		class="holo-rotator"
		style="transform: perspective(600px) rotateX({rotX}deg) rotateY({rotY}deg) scale3d({active ? 1.03 : 1}, {active ? 1.03 : 1}, 1);"
	>
		{#if glow && active}
			<div
				class="holo-glow"
				style="
					--ptr-deg: {ptrDeg}deg;
					--ptr-d: {edgeDist};
					--glow-color: 45deg 100% 75%;
				"
			></div>
		{/if}
		<div class="holo-card">
			{#if imgSrc}
				<img src={imgSrc} alt={imgAlt} class="holo-img" />
			{:else}
				<div class="holo-bg" style="background: {bgColor ?? '#1e1e2e'}; {width ? `width: ${width};` : ''} {height ? `height: ${height};` : ''}"></div>
			{/if}
			{#if holo}
				<HoloShine pointerX={posx} pointerY={posy} {hyp} {active} {texture} config={holoConfig} />
			{/if}
		</div>
	</div>
</div>

<style>
	.holo-wrapper {
		display: inline-block;
	}

	.holo-rotator {
		position: relative;
		transition: transform 0.3s ease-out;
		will-change: transform;
		transform-style: preserve-3d;
	}

	.holo-glow {
		--outset: 30px;
		position: absolute;
		inset: calc(var(--outset) * -1);
		border-radius: calc(4.55% + var(--outset));
		pointer-events: none;
		z-index: -1;
		opacity: calc(clamp(0, var(--ptr-d) / 60, 1));
		mask-image: conic-gradient(
			from var(--ptr-deg) at center,
			black 5%, transparent 18%, transparent 82%, black 95%
		);
		mix-blend-mode: plus-lighter;
		transition: opacity 0.25s ease-out;
	}

	.holo-glow::before {
		content: "";
		position: absolute;
		inset: var(--outset);
		border-radius: 4.55% / 3.5%;
		box-shadow:
			inset 0 0 0 2px hsl(var(--glow-color) / 100%),
			inset 0 0 4px 1px hsl(var(--glow-color) / 80%),
			inset 0 0 10px 2px hsl(var(--glow-color) / 60%),
			inset 0 0 20px 4px hsl(var(--glow-color) / 40%),
			inset 0 0 40px 8px hsl(var(--glow-color) / 25%),
			0 0 4px 1px hsl(var(--glow-color) / 80%),
			0 0 10px 2px hsl(var(--glow-color) / 60%),
			0 0 20px 4px hsl(var(--glow-color) / 40%),
			0 0 40px 8px hsl(var(--glow-color) / 25%),
			0 0 60px 12px hsl(var(--glow-color) / 15%);
	}

	.holo-card {
		position: relative;
		display: grid;
		border-radius: 4.55% / 3.5%;
		overflow: hidden;
	}

	.holo-img, .holo-bg {
		grid-area: 1/1;
		width: 100%;
		display: block;
		border-radius: inherit;
	}
</style>
