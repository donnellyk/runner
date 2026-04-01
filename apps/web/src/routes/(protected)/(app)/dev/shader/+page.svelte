<script lang="ts">
    import PRCard from '$lib/components/PRCard.svelte';
    import HoloCard from '$lib/components/HoloCard.svelte';
    import { DEFAULT_HOLO_CONFIG, type HoloConfig } from '$lib/components/holo-config';

    const TEXTURES = [
        { label: 'Trainer', src: '/textures/trainerbg.png' },
        { label: 'Galaxy', src: '/textures/galaxy.png' },
        { label: 'Stylish', src: '/textures/stylish.png' },
        { label: 'Glitter', src: '/textures/glitter.png' },
        { label: 'Cosmos', src: '/textures/cosmos.png' },
    ];
    let selectedTexture = $state(TEXTURES[0].src);
    let glowEnabled = $state(true);
    let holoEnabled = $state(true);
    let holoConfig = $state<HoloConfig>({ ...DEFAULT_HOLO_CONFIG });

    let cardBg = $state('#2d1b2e');
    let meshEnabled = $state(true);
    let meshColor1 = $state('#f472b6');
    let meshColor2 = $state('#c084fc');
    let noiseOpacity = $state(0.13);

    // Glow config
    let glowSens = $state(30);
    let colorSens = $state(50);
    let glowHue = $state(25);
    let glowSat = $state(100);
    let glowLight = $state(60);
    let glowBoost = $state(15);
    let glowIntensity = $state(1.25);
    let edgeFalloff = $state(0.85);
    let edgeBlend = $state('soft-light');
    let glowBlend = $state('plus-lighter');

    interface ColorPreset { label: string; bg: string; m1: string; m2: string; noise: number; }

    const COLOR_PRESETS: ColorPreset[] = [
        // Dark (colored, not black)
        { label: 'Indigo Night',   bg: '#1e1b4b', m1: '#818cf8', m2: '#a78bfa', noise: 0.05 },
        { label: 'Deep Teal',      bg: '#134e4a', m1: '#2dd4bf', m2: '#5eead4', noise: 0.04 },
        { label: 'Oxblood',        bg: '#450a0a', m1: '#f87171', m2: '#fb923c', noise: 0.06 },
        { label: 'Dark Plum',      bg: '#3b0764', m1: '#d946ef', m2: '#f0abfc', noise: 0.05 },
        { label: 'Navy',           bg: '#172554', m1: '#60a5fa', m2: '#38bdf8', noise: 0.03 },
        { label: 'Evergreen',      bg: '#14532d', m1: '#4ade80', m2: '#a3e635', noise: 0.06 },
        { label: 'Espresso',       bg: '#422006', m1: '#fbbf24', m2: '#f97316', noise: 0.08 },
        { label: 'Charcoal Wine',  bg: '#2d1b2e', m1: '#f472b6', m2: '#c084fc', noise: 0.04 },
        { label: 'Petrol',         bg: '#0c4a6e', m1: '#22d3ee', m2: '#67e8f9', noise: 0.03 },
        { label: 'Mahogany',       bg: '#4a1d0a', m1: '#fb923c', m2: '#fcd34d', noise: 0.07 },
        // Mid
        { label: 'Slate',          bg: '#292F3D', m1: '#c299ff', m2: '#47cf73', noise: 0.00 },
        { label: 'Storm',          bg: '#334155', m1: '#a78bfa', m2: '#38bdf8', noise: 0.04 },
        { label: 'Copper',         bg: '#3d2b1f', m1: '#fb923c', m2: '#fbbf24', noise: 0.06 },
        { label: 'Dusk',           bg: '#2e1f3d', m1: '#e879f9', m2: '#f472b6', noise: 0.03 },
        { label: 'Teal Smoke',     bg: '#1a2f2f', m1: '#2dd4bf', m2: '#67e8f9', noise: 0.05 },
        // Light
        { label: 'Pearl',          bg: '#e8e5e0', m1: '#c084fc', m2: '#f9a8d4', noise: 0.10 },
        { label: 'Bone',           bg: '#f5f0e8', m1: '#f59e0b', m2: '#ef4444', noise: 0.08 },
        { label: 'Silver',         bg: '#d4d4d8', m1: '#6366f1', m2: '#06b6d4', noise: 0.12 },
        { label: 'Blush',          bg: '#f5e6e0', m1: '#f43f5e', m2: '#a855f7', noise: 0.06 },
        { label: 'Ice',            bg: '#e0eef5', m1: '#3b82f6', m2: '#8b5cf6', noise: 0.08 },
    ];

    function applyPreset(p: ColorPreset) {
        cardBg = p.bg;
        meshColor1 = p.m1;
        meshColor2 = p.m2;
        noiseOpacity = p.noise;
    }

    // Debug layer view
    let dbgX = $state(50);
    let dbgY = $state(50);
    let dbgActive = $state(false);

    function dbgMove(e: PointerEvent) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        dbgX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        dbgY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        dbgActive = true;
    }

    function dbgLeave() {
        dbgActive = false;
        dbgX = 50;
        dbgY = 50;
    }

    let animateSmall: (() => void) | undefined;
    let animateLarge: (() => void) | undefined;

    function triggerAll() {
        animateSmall?.();
        animateLarge?.();
    }

    const BLEND_MODES = ['color-dodge', 'screen', 'overlay', 'soft-light', 'hard-light', 'multiply', 'lighten', 'darken', 'difference', 'exclusion', 'luminosity', 'plus-lighter', 'normal'];

    interface SliderDef { key: keyof HoloConfig; label: string; min: number; max: number; step: number; }

    const SHINE_SLIDERS: SliderDef[] = [
        { key: 'brightness', label: 'Brightness', min: 0, max: 2, step: 0.05 },
        { key: 'contrast', label: 'Contrast', min: 0, max: 5, step: 0.1 },
        { key: 'saturate', label: 'Saturate', min: 0, max: 5, step: 0.1 },
        { key: 'imgSize', label: 'Texture Size', min: 10, max: 200, step: 5 },
        { key: 'space', label: 'Rainbow Spacing', min: 1, max: 20, step: 0.5 },
        { key: 'angle', label: 'Stripe Angle', min: 0, max: 360, step: 1 },
    ];

    const AFTER_SLIDERS: SliderDef[] = [
        { key: 'afterBrightness', label: 'Brightness', min: 0, max: 2, step: 0.05 },
        { key: 'afterContrast', label: 'Contrast', min: 0, max: 5, step: 0.1 },
        { key: 'afterSaturate', label: 'Saturate', min: 0, max: 5, step: 0.1 },
    ];

    function fmt(v: number): string {
        return v % 1 !== 0 ? v.toFixed(2) : String(v);
    }
</script>

<div class="mb-6">
    <h1 class="font-serif text-4xl font-semibold text-zinc-900">Card Effects</h1>
</div>

<div class="flex items-center gap-3 mb-8">
    <div class="flex border border-zinc-200 rounded overflow-hidden text-xs">
        {#each TEXTURES as t (t.src)}
            <button
                class="px-3 py-1 {selectedTexture === t.src ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-400 hover:bg-zinc-50'}"
                onclick={() => selectedTexture = t.src}
            >{t.label}</button>
        {/each}
    </div>

    <button
        class="px-3 py-1 text-xs border rounded {holoEnabled ? 'bg-violet-50 border-violet-300 text-violet-700' : 'border-zinc-200 text-zinc-400 hover:bg-zinc-50'}"
        onclick={() => holoEnabled = !holoEnabled}
    >Holo {holoEnabled ? 'On' : 'Off'}</button>

    <button
        class="px-3 py-1 text-xs border rounded {glowEnabled ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-zinc-200 text-zinc-400 hover:bg-zinc-50'}"
        onclick={() => glowEnabled = !glowEnabled}
    >Glow {glowEnabled ? 'On' : 'Off'}</button>

    <button
        class="px-3 py-1 text-xs border border-zinc-200 rounded text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
        onclick={triggerAll}
    >Animate</button>
</div>

<div class="flex flex-wrap gap-1.5 mb-4">
    {#each COLOR_PRESETS as p (p.label)}
        <button
            class="flex items-center gap-1.5 px-2 py-1 text-[10px] border border-zinc-200 rounded hover:border-zinc-400 transition-colors {cardBg === p.bg && meshColor1 === p.m1 ? 'border-zinc-400 bg-zinc-50' : ''}"
            onclick={() => applyPreset(p)}
        >
            <span class="flex gap-0.5">
                <span class="w-3 h-3 rounded-sm" style="background: {p.bg};"></span>
                <span class="w-3 h-3 rounded-sm" style="background: {p.m1};"></span>
                <span class="w-3 h-3 rounded-sm" style="background: {p.m2};"></span>
            </span>
            <span class="text-zinc-600">{p.label}</span>
        </button>
    {/each}
</div>

<div class="flex items-center gap-4 mb-8 text-xs">
    <label class="flex items-center gap-2">
        <span class="text-zinc-500">Background</span>
        <input type="color" bind:value={cardBg} class="w-8 h-6 rounded border border-zinc-200 cursor-pointer" />
        <span class="font-mono text-zinc-400">{cardBg}</span>
    </label>
    <button
        class="px-3 py-1 text-xs border rounded {meshEnabled ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-zinc-200 text-zinc-400 hover:bg-zinc-50'}"
        onclick={() => meshEnabled = !meshEnabled}
    >Mesh {meshEnabled ? 'On' : 'Off'}</button>
    {#if meshEnabled}
        <label class="flex items-center gap-2">
            <span class="text-zinc-500">Mesh 1</span>
            <input type="color" bind:value={meshColor1} class="w-8 h-6 rounded border border-zinc-200 cursor-pointer" />
            <span class="font-mono text-zinc-400">{meshColor1}</span>
        </label>
        <label class="flex items-center gap-2">
            <span class="text-zinc-500">Mesh 2</span>
            <input type="color" bind:value={meshColor2} class="w-8 h-6 rounded border border-zinc-200 cursor-pointer" />
            <span class="font-mono text-zinc-400">{meshColor2}</span>
        </label>
    {/if}
    <label class="flex items-center gap-2">
        <span class="text-zinc-500">Noise</span>
        <input type="range" min="0" max="1" step="0.01" bind:value={noiseOpacity} class="w-24 h-1 accent-zinc-500" />
        <span class="font-mono text-zinc-400">{noiseOpacity.toFixed(2)}</span>
    </label>
</div>

<!-- Glow Config -->
{#if glowEnabled}
    <div class="mb-8 grid grid-cols-3 gap-x-6 gap-y-1 text-xs border border-zinc-100 rounded-lg p-4 bg-white">
        <div>
            <div class="font-semibold uppercase tracking-widest text-zinc-400 mb-2 text-[10px]">Glow Color</div>
            <label class="flex items-center justify-between gap-2 mb-1">
                <span class="text-zinc-500 w-20 shrink-0">Hue</span>
                <input type="range" min="0" max="360" step="1" bind:value={glowHue} class="flex-1 h-1 accent-amber-500" />
                <span class="font-mono text-zinc-400 w-10 text-right">{glowHue}</span>
            </label>
            <label class="flex items-center justify-between gap-2 mb-1">
                <span class="text-zinc-500 w-20 shrink-0">Saturation</span>
                <input type="range" min="0" max="100" step="1" bind:value={glowSat} class="flex-1 h-1 accent-amber-500" />
                <span class="font-mono text-zinc-400 w-10 text-right">{glowSat}%</span>
            </label>
            <label class="flex items-center justify-between gap-2 mb-1">
                <span class="text-zinc-500 w-20 shrink-0">Lightness</span>
                <input type="range" min="0" max="100" step="1" bind:value={glowLight} class="flex-1 h-1 accent-amber-500" />
                <span class="font-mono text-zinc-400 w-10 text-right">{glowLight}%</span>
            </label>
            <div class="mt-2 h-4 rounded" style="background: hsl({glowHue}deg {glowSat}% {glowLight}%);"></div>
        </div>

        <div>
            <div class="font-semibold uppercase tracking-widest text-zinc-400 mb-2 text-[10px]">Sensitivity</div>
            <label class="flex items-center justify-between gap-2 mb-1">
                <span class="text-zinc-500 w-20 shrink-0">Glow Sens</span>
                <input type="range" min="0" max="80" step="1" bind:value={glowSens} class="flex-1 h-1 accent-amber-500" />
                <span class="font-mono text-zinc-400 w-10 text-right">{glowSens}</span>
            </label>
            <label class="flex items-center justify-between gap-2 mb-1">
                <span class="text-zinc-500 w-20 shrink-0">Color Sens</span>
                <input type="range" min="0" max="80" step="1" bind:value={colorSens} class="flex-1 h-1 accent-amber-500" />
                <span class="font-mono text-zinc-400 w-10 text-right">{colorSens}</span>
            </label>
            <label class="flex items-center justify-between gap-2 mb-1">
                <span class="text-zinc-500 w-20 shrink-0">Boost</span>
                <input type="range" min="0" max="50" step="1" bind:value={glowBoost} class="flex-1 h-1 accent-amber-500" />
                <span class="font-mono text-zinc-400 w-10 text-right">{glowBoost}%</span>
            </label>
            <label class="flex items-center justify-between gap-2 mb-1">
                <span class="text-zinc-500 w-20 shrink-0">Intensity</span>
                <input type="range" min="0" max="3" step="0.05" bind:value={glowIntensity} class="flex-1 h-1 accent-amber-500" />
                <span class="font-mono text-zinc-400 w-10 text-right">{glowIntensity.toFixed(2)}</span>
            </label>
            <label class="flex items-center justify-between gap-2 mb-1">
                <span class="text-zinc-500 w-20 shrink-0">Falloff</span>
                <input type="range" min="0.25" max="3" step="0.05" bind:value={edgeFalloff} class="flex-1 h-1 accent-amber-500" />
                <span class="font-mono text-zinc-400 w-10 text-right">{edgeFalloff.toFixed(2)}</span>
            </label>
        </div>

        <div>
            <div class="font-semibold uppercase tracking-widest text-zinc-400 mb-2 text-[10px]">Edge Blend</div>
            <select bind:value={edgeBlend} class="w-full border border-zinc-200 rounded px-1.5 py-0.5 text-xs bg-white text-zinc-700">
                {#each BLEND_MODES as m (m)}
                    <option value={m}>{m}</option>
                {/each}
            </select>
            <div class="mt-3 flex gap-3">
                <button
                    class="text-xs text-zinc-400 hover:text-zinc-600"
                    onclick={() => { glowSens = 30; colorSens = 50; glowHue = 40; glowSat = 80; glowLight = 80; glowBoost = 0; glowIntensity = 1; edgeFalloff = 1; edgeBlend = 'soft-light'; glowBlend = 'plus-lighter'; }}
                >Reset</button>
                <button
                    class="text-xs text-zinc-400 hover:text-zinc-600"
                    onclick={() => { glowHue = 40; glowSat = 80; glowLight = 80; glowBoost = 0; edgeBlend = 'soft-light'; glowBlend = 'plus-lighter'; }}
                >Dark</button>
                <button
                    class="text-xs text-zinc-400 hover:text-zinc-600"
                    onclick={() => { glowHue = 280; glowSat = 90; glowLight = 95; glowBoost = 15; edgeBlend = 'darken'; glowBlend = 'luminosity'; }}
                >Light</button>
            </div>
        </div>
    </div>
{/if}

<!-- Holo Config -->
{#if holoEnabled}
    <div class="mb-8 grid grid-cols-3 gap-x-6 gap-y-1 text-xs border border-zinc-100 rounded-lg p-4 bg-white">
        <div>
            <div class="font-semibold uppercase tracking-widest text-zinc-400 mb-2 text-[10px]">Shine Layer</div>
            {#each SHINE_SLIDERS as s (s.key)}
                <label class="flex items-center justify-between gap-2 mb-1">
                    <span class="text-zinc-500 w-24 shrink-0">{s.label}</span>
                    <input type="range" min={s.min} max={s.max} step={s.step} bind:value={holoConfig[s.key]} class="flex-1 h-1 accent-violet-500" />
                    <span class="font-mono text-zinc-400 w-10 text-right">{fmt(holoConfig[s.key] as number)}</span>
                </label>
            {/each}
            <label class="flex items-center justify-between gap-2 mb-1">
                <span class="text-zinc-500 w-24 shrink-0">Blend Mode</span>
                <select bind:value={holoConfig.blendShine} class="flex-1 border border-zinc-200 rounded px-1.5 py-0.5 text-xs bg-white text-zinc-700">
                    {#each BLEND_MODES as m (m)}
                        <option value={m}>{m}</option>
                    {/each}
                </select>
            </label>
        </div>

        <div>
            <div class="font-semibold uppercase tracking-widest text-zinc-400 mb-2 text-[10px]">::after Layer</div>
            {#each AFTER_SLIDERS as s (s.key)}
                <label class="flex items-center justify-between gap-2 mb-1">
                    <span class="text-zinc-500 w-24 shrink-0">{s.label}</span>
                    <input type="range" min={s.min} max={s.max} step={s.step} bind:value={holoConfig[s.key]} class="flex-1 h-1 accent-violet-500" />
                    <span class="font-mono text-zinc-400 w-10 text-right">{fmt(holoConfig[s.key] as number)}</span>
                </label>
            {/each}
            <label class="flex items-center justify-between gap-2 mb-1">
                <span class="text-zinc-500 w-24 shrink-0">Blend Mode</span>
                <select bind:value={holoConfig.blendAfter} class="flex-1 border border-zinc-200 rounded px-1.5 py-0.5 text-xs bg-white text-zinc-700">
                    {#each BLEND_MODES as m (m)}
                        <option value={m}>{m}</option>
                    {/each}
                </select>
            </label>
        </div>

        <div class="flex items-end gap-3">
            <button
                class="text-xs text-zinc-400 hover:text-zinc-600"
                onclick={() => holoConfig = { ...DEFAULT_HOLO_CONFIG }}
            >Reset</button>
            <button
                class="text-xs text-zinc-400 hover:text-zinc-600"
                onclick={() => holoConfig = { ...holoConfig, brightness: 0.6, contrast: 1.5, saturate: 2, blendShine: 'screen', blendAfter: 'difference' }}
            >Dark Mode</button>
        </div>
    </div>
{/if}

<!-- Cards -->
<div class="grid grid-cols-3 gap-8 items-start">
    <div>
        <div class="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">PR Card</div>
        <div class="w-48">
            <PRCard
                raceDistance="Marathon"
                timeSeconds={10953}
                isBest={true}
                glow={glowEnabled}
                bgColor={cardBg}
                meshColor1={meshEnabled ? meshColor1 : ''}
                meshColor2={meshEnabled ? meshColor2 : ''}
                {noiseOpacity}
                {glowSens}
                {colorSens}
                {glowHue}
                {glowSat}
                {glowLight}
                {glowBoost}
                {glowIntensity}
                {edgeFalloff}
                {edgeBlend}
                {glowBlend}
                onanimateGlow={(fn) => animateSmall = fn}
            />
        </div>

        <div class="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3 mt-12">PR Card (Codepen size)</div>
        <div class="pr-large" style="width: clamp(320px, calc(100cqw - 80px), 600px); height: 600px;">
            <PRCard
                raceDistance="Marathon"
                timeSeconds={10953}
                isBest={true}
                glow={glowEnabled}
                bgColor={cardBg}
                meshColor1={meshEnabled ? meshColor1 : ''}
                meshColor2={meshEnabled ? meshColor2 : ''}
                {noiseOpacity}
                {glowSens}
                {colorSens}
                {glowHue}
                {glowSat}
                {glowLight}
                {glowBoost}
                {glowIntensity}
                {edgeFalloff}
                {edgeBlend}
                {glowBlend}
                onanimateGlow={(fn) => animateLarge = fn}
            />
        </div>
    </div>

    <div>
        <div class="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">Image Card</div>
        <div class="w-72">
            <HoloCard
                imgSrc="https://p.kagi.com/proxy/28_hires__85606.1684177277.png?c=IOK1WbjvBikWkl-vA5OBHJmLr-LDSvZLv8tZSFitNjRds_pSNIHKFY42ebAnwhwf8IWbVYN6mHYiU9U3fb4rnblj8eX07F2B6Mss8HhlVBvtUODBFzFNWnu5HM2ZjqxIm69cBme1uYcg3PajI2E5BuLHPGUnd0QN9AyZqZsvSSuBbPRbiNNBuDhyXoNJKcHp"
                imgAlt="Test card"
                texture={selectedTexture}
                glow={glowEnabled}
                holo={holoEnabled}
                {holoConfig}
            />
        </div>
    </div>

    <div>
        <div class="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">Holographic Card</div>
        <div class="w-72">
            <HoloCard
                imgSrc="https://images.pokemontcg.io/swsh1/190_hires.png"
                imgAlt="Pokemon Holographic"
                texture={selectedTexture}
                glow={glowEnabled}
                holo={holoEnabled}
                {holoConfig}
            />
        </div>

        <div class="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3 mt-12">Holo Only (no image)</div>
        <div class="w-72">
            <HoloCard
                texture={selectedTexture}
                glow={glowEnabled}
                holo={holoEnabled}
                {holoConfig}
                bgColor="#292F3D"
                width="288px"
                height="400px"
            />
        </div>
    </div>
</div>

<!-- Layer Debug -->
<h2 class="font-serif text-2xl font-semibold text-zinc-900 mt-12 mb-4">Layer Debug</h2>
<p class="text-xs text-zinc-400 mb-4">Hover any layer — all respond to the same pointer. Each layer shown individually, then composites.</p>

<div
    class="grid grid-cols-6 gap-4"
    role="group"
    onpointermove={dbgMove}
    onpointerleave={dbgLeave}
>
    <!-- Layer 1: Texture -->
    <div>
        <div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">1. Texture</div>
        <div class="dbg-layer" style="
            background-image: url({selectedTexture});
            background-size: {holoConfig.imgSize}%;
            background-position: center;
        "></div>
    </div>

    <!-- Layer 2: Rainbow -->
    <div>
        <div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">2. Rainbow</div>
        <div class="dbg-layer" style="
            background-image: repeating-linear-gradient(0deg,
                rgb(255,119,115) calc({holoConfig.space}% * 1),
                rgba(255,237,95,1) calc({holoConfig.space}% * 2),
                rgba(168,255,95,1) calc({holoConfig.space}% * 3),
                rgba(131,255,247,1) calc({holoConfig.space}% * 4),
                rgba(120,148,255,1) calc({holoConfig.space}% * 5),
                rgb(216,117,255) calc({holoConfig.space}% * 6),
                rgb(255,119,115) calc({holoConfig.space}% * 7)
            );
            background-size: 200% 700%;
            background-position: 0% {dbgY}%;
        "></div>
    </div>

    <!-- Layer 3: Stripes -->
    <div>
        <div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">3. Stripes</div>
        <div class="dbg-layer" style="
            background-image: repeating-linear-gradient({holoConfig.angle}deg,
                #0e152e 0%, hsl(180,10%,60%) 3.8%, hsl(180,29%,66%) 4.5%,
                hsl(180,10%,60%) 5.2%, #0e152e 10%, #0e152e 12%
            );
            background-size: 300%;
            background-position: {dbgX}% {dbgY}%;
        "></div>
    </div>

    <!-- Layer 4: Radial -->
    <div>
        <div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">4. Radial</div>
        <div class="dbg-layer" style="
            background-image: radial-gradient(farthest-corner circle at {dbgX}% {dbgY}%,
                rgba(0,0,0,.1) 12%, rgba(0,0,0,.15) 20%, rgba(0,0,0,.25) 120%
            );
            background-size: 200%;
            background-position: {dbgX}% {dbgY}%;
        "></div>
    </div>

    <!-- Composite: main shine (all 4 blended) -->
    <div>
        <div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">5. Main (blended)</div>
        <div class="dbg-layer" style="
            background-image:
                url({selectedTexture}),
                repeating-linear-gradient(0deg,
                    rgb(255,119,115) calc({holoConfig.space}% * 1),
                    rgba(255,237,95,1) calc({holoConfig.space}% * 2),
                    rgba(168,255,95,1) calc({holoConfig.space}% * 3),
                    rgba(131,255,247,1) calc({holoConfig.space}% * 4),
                    rgba(120,148,255,1) calc({holoConfig.space}% * 5),
                    rgb(216,117,255) calc({holoConfig.space}% * 6),
                    rgb(255,119,115) calc({holoConfig.space}% * 7)
                ),
                repeating-linear-gradient({holoConfig.angle}deg,
                    #0e152e 0%, hsl(180,10%,60%) 3.8%, hsl(180,29%,66%) 4.5%,
                    hsl(180,10%,60%) 5.2%, #0e152e 10%, #0e152e 12%
                ),
                radial-gradient(farthest-corner circle at {dbgX}% {dbgY}%,
                    rgba(0,0,0,.1) 12%, rgba(0,0,0,.15) 20%, rgba(0,0,0,.25) 120%
                );
            background-blend-mode: exclusion, hue, hard-light, exclusion;
            background-size: {holoConfig.imgSize}%, 200% 700%, 300%, 200%;
            background-position: center, 0% {dbgY}%, {dbgX}% {dbgY}%, {dbgX}% {dbgY}%;
            filter: brightness(calc(0.3 + {holoConfig.brightness})) contrast({holoConfig.contrast}) saturate({holoConfig.saturate});
        "></div>
    </div>

    <!-- Composite: ::after (inverted stripes) -->
    <div>
        <div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">6. ::after (inverted)</div>
        <div class="dbg-layer" style="
            background-image:
                url({selectedTexture}),
                repeating-linear-gradient(0deg,
                    rgb(255,119,115) calc({holoConfig.space}% * 1),
                    rgba(255,237,95,1) calc({holoConfig.space}% * 2),
                    rgba(168,255,95,1) calc({holoConfig.space}% * 3),
                    rgba(131,255,247,1) calc({holoConfig.space}% * 4),
                    rgba(120,148,255,1) calc({holoConfig.space}% * 5),
                    rgb(216,117,255) calc({holoConfig.space}% * 6),
                    rgb(255,119,115) calc({holoConfig.space}% * 7)
                ),
                repeating-linear-gradient({holoConfig.angle}deg,
                    #0e152e 0%, hsl(180,10%,60%) 3.8%, hsl(180,29%,66%) 4.5%,
                    hsl(180,10%,60%) 5.2%, #0e152e 10%, #0e152e 12%
                ),
                radial-gradient(farthest-corner circle at {dbgX}% {dbgY}%,
                    rgba(0,0,0,.1) 12%, rgba(0,0,0,.15) 20%, rgba(0,0,0,.25) 120%
                );
            background-blend-mode: exclusion, hue, hard-light, exclusion;
            background-size: {holoConfig.imgSize}%, 200% 400%, 200%, 200%;
            background-position: center, 0% {dbgY}%, calc(100% - {dbgX}%) calc(100% - {dbgY}%), {dbgX}% {dbgY}%;
            filter: brightness(calc(0.5 + {holoConfig.afterBrightness})) contrast({holoConfig.afterContrast}) saturate({holoConfig.afterSaturate});
        "></div>
    </div>
</div>

<footer class="mt-16 pt-6 border-t border-zinc-100 text-xs text-zinc-400">
    Holographic card effect adapted from
    <a href="https://github.com/simeydotme/pokemon-cards-css" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-700">simeydotme/pokemon-cards-css</a>.
    Glow effect from
    <a href="https://codepen.io/simeydotme/pen/RNWoPRj" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-700">Colored, Glowing Edges</a>
    by <a href="https://github.com/simeydotme" target="_blank" rel="noopener noreferrer" class="text-zinc-500 hover:text-zinc-700">Simey</a>.
</footer>

<style>
    .dbg-layer {
        width: 100%;
        aspect-ratio: 3/4;
        border-radius: 0.5rem;
        border: 1px solid rgb(255 255 255 / 10%);
        background-color: #292F3D;
    }

    .pr-large {
        :global(> *) {
            height: 100%;
        }
        :global(.pr-card-rotator) {
            height: 100%;
        }
        :global(.pr-card) {
            height: 100%;
            border-radius: 1.768em;
            box-shadow:
                rgba(0, 0, 0, 0.1) 0px 1px 2px,
                rgba(0, 0, 0, 0.1) 0px 2px 4px,
                rgba(0, 0, 0, 0.1) 0px 4px 8px,
                rgba(0, 0, 0, 0.1) 0px 8px 16px,
                rgba(0, 0, 0, 0.1) 0px 16px 32px,
                rgba(0, 0, 0, 0.1) 0px 32px 64px;
        }
    }
</style>
