<script lang="ts">
	import { DEFAULT_HOLO_CONFIG, type HoloConfig } from './holo-config';

	interface Props {
		pointerX: number;
		pointerY: number;
		hyp: number;
		active: boolean;
		texture?: string;
		config?: HoloConfig;
	}

	let { pointerX, pointerY, hyp, active, texture = '/textures/trainerbg.png', config }: Props = $props();

	const cfg = $derived(config ?? DEFAULT_HOLO_CONFIG);
</script>

<div
	class="holo-shine"
	style="
		--posx: {pointerX}%;
		--posy: {pointerY}%;
		--mx: {pointerX}%;
		--my: {pointerY}%;
		--hyp: {hyp};
		--o: {active ? 1 : 0};
		--tex: url({texture});
		--imgsize: {cfg.imgSize}%;
		--space: {cfg.space}%;
		--angle: {cfg.angle}deg;
		--sh-brightness: {cfg.brightness};
		--sh-contrast: {cfg.contrast};
		--sh-saturate: {cfg.saturate};
		--af-brightness: {cfg.afterBrightness};
		--af-contrast: {cfg.afterContrast};
		--af-saturate: {cfg.afterSaturate};
		--blend-shine: {cfg.blendShine};
		--blend-after: {cfg.blendAfter};
	"
></div>
<div
	class="holo-glare"
	style="
		background: radial-gradient(farthest-corner circle at {pointerX}% {pointerY}%, rgba(255,255,255,0.8) 10%, rgba(255,255,255,0.65) 20%, rgba(0,0,0,0.5) 90%);
		opacity: {active ? 0.15 : 0};
	"
></div>

<style>
	.holo-shine {
		grid-area: 1/1;
		position: relative;
		border-radius: inherit;

		background-image:
			var(--tex),
			repeating-linear-gradient(0deg,
				rgb(255, 119, 115) calc(var(--space)*1),
				rgba(255, 237, 95, 1) calc(var(--space)*2),
				rgba(168, 255, 95, 1) calc(var(--space)*3),
				rgba(131, 255, 247, 1) calc(var(--space)*4),
				rgba(120, 148, 255, 1) calc(var(--space)*5),
				rgb(216, 117, 255) calc(var(--space)*6),
				rgb(255, 119, 115) calc(var(--space)*7)
			),
			repeating-linear-gradient(var(--angle),
				#0e152e 0%,
				hsl(180, 10%, 60%) 3.8%,
				hsl(180, 29%, 66%) 4.5%,
				hsl(180, 10%, 60%) 5.2%,
				#0e152e 10%,
				#0e152e 12%
			),
			radial-gradient(farthest-corner circle at var(--mx) var(--my),
				rgba(0,0,0,.1) 12%,
				rgba(0,0,0,.15) 20%,
				rgba(0,0,0,.25) 120%
			);

		background-blend-mode: exclusion, hue, hard-light, exclusion;
		background-size: var(--imgsize), 200% 700%, 300%, 200%;
		background-position:
			center,
			0% var(--posy),
			var(--posx) var(--posy),
			var(--posx) var(--posy);

		filter: brightness(calc((var(--hyp)*0.3) + var(--sh-brightness))) contrast(var(--sh-contrast)) saturate(var(--sh-saturate));
		mix-blend-mode: var(--blend-shine);
		opacity: var(--o);
		transition: opacity 0.3s ease-out;
	}

	.holo-shine::after {
		content: "";
		position: absolute;
		inset: 0;
		border-radius: inherit;

		background-image:
			var(--tex),
			repeating-linear-gradient(0deg,
				rgb(255, 119, 115) calc(var(--space)*1),
				rgba(255, 237, 95, 1) calc(var(--space)*2),
				rgba(168, 255, 95, 1) calc(var(--space)*3),
				rgba(131, 255, 247, 1) calc(var(--space)*4),
				rgba(120, 148, 255, 1) calc(var(--space)*5),
				rgb(216, 117, 255) calc(var(--space)*6),
				rgb(255, 119, 115) calc(var(--space)*7)
			),
			repeating-linear-gradient(var(--angle),
				#0e152e 0%,
				hsl(180, 10%, 60%) 3.8%,
				hsl(180, 29%, 66%) 4.5%,
				hsl(180, 10%, 60%) 5.2%,
				#0e152e 10%,
				#0e152e 12%
			),
			radial-gradient(farthest-corner circle at var(--mx) var(--my),
				rgba(0,0,0,.1) 12%,
				rgba(0,0,0,.15) 20%,
				rgba(0,0,0,.25) 120%
			);

		background-blend-mode: exclusion, hue, hard-light, exclusion;
		background-size: var(--imgsize), 200% 400%, 200%, 200%;
		background-position:
			center,
			0% var(--posy),
			calc(100% - var(--posx)) calc(100% - var(--posy)),
			var(--posx) var(--posy);

		filter: brightness(calc((var(--hyp)*0.5) + var(--af-brightness))) contrast(var(--af-contrast)) saturate(var(--af-saturate));
		mix-blend-mode: var(--blend-after);
	}

	.holo-glare {
		grid-area: 1/1;
		border-radius: inherit;
		mix-blend-mode: overlay;
		transition: opacity 0.3s ease-out;
	}
</style>
