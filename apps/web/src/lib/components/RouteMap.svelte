<script lang="ts">
	import { onMount } from 'svelte';
	import type L from 'leaflet';

	interface Props {
		coordinates: [number, number][];
	}

	let { coordinates }: Props = $props();
	let mapEl: HTMLDivElement;

	onMount(() => {
		let map: L.Map | undefined;

		import('leaflet').then((leaflet) => {
			map = leaflet.map(mapEl, { zoomControl: false, attributionControl: false });

			leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
			}).addTo(map);

			const latLngs: L.LatLngTuple[] = coordinates.map(([lng, lat]) => [lat, lng]);
			const polyline = leaflet.polyline(latLngs, { color: '#3b82f6', weight: 3 }).addTo(map);
			map.fitBounds(polyline.getBounds(), { padding: [20, 20] });
		});

		return () => map?.remove();
	});
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		crossorigin=""
	/>
</svelte:head>

<div bind:this={mapEl} class="w-full h-64 rounded border border-zinc-200"></div>
