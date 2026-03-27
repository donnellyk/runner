<script lang="ts">
    import { resolve } from "$app/paths";
    import { NOISE_DATA_URI } from "$lib/mesh-gradient";

    interface Props {
        activityId: number;
    }

    let { activityId }: Props = $props();

    const meshOrbs = [
        { color: "80, 250, 123" },
        { color: "139, 233, 253" },
        { color: "189, 147, 249" },
        { color: "255, 184, 108" },
    ].map((orb) => ({
        ...orb,
        opacity: Math.random() * 0.1 + 0.1,
        x: Math.round(Math.random() * 60 + 20),
        y: Math.round(Math.random() * 60 + 20),
        size: Math.round(Math.random() * 20 + 60),
    }));
</script>

<a
    href={resolve(`/activities/${activityId}/terminal/layout`)}
    class="flex items-center rounded-lg px-4 py-3 no-underline transition-all hover:scale-[1.01]"
    style="
		background: #0b0f1a;
		border: 1px solid #1e2640;
		font-family: 'Geist Mono', monospace;
		position: relative;
		overflow: hidden;
	"
>
    <div style="position: absolute; inset: 0; pointer-events: none;">
        {#each meshOrbs as orb, i (i)}
            <div
                class="absolute rounded-full"
                style="
                    width: {orb.size}%;
                    aspect-ratio: 1;
                    left: {orb.x}%;
                    top: {orb.y}%;
                    translate: -50% -50%;
                    background: radial-gradient(
                        circle,
                        rgba({orb.color}, {orb.opacity}) 0%,
                        transparent 70%
                    )
                "
            ></div>
        {/each}
    </div>
    <div class="pointer-events-none absolute inset-0" style="background-image: {NOISE_DATA_URI}; background-repeat: repeat; opacity: 0.1;"></div>
    <div style="position: relative; z-index: 1;">
        <div class="text-xs" style="color: #6b7394;">Terminal Mode</div>
        <div
            class="text-2xl font-semibold"
            style="color: #eef0f6; font-variant-numeric: tabular-nums;"
        >
            <span style="color: #6b7394;">&#62;</span> Analysis
        </div>
    </div>
</a>
