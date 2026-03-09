<script lang="ts">
	import { onMount } from 'svelte';
	import type L from 'leaflet';

	interface Props {
		coordinates: [number, number][];
		/** [lng, lat] of the crosshair position, or null */
		marker?: [number, number] | null;
	}

	let { coordinates, marker = null }: Props = $props();
	let mapEl: HTMLDivElement;

	// Non-reactive refs — Leaflet objects must not be wrapped in Svelte's proxy
	let leafletRef: typeof L | null = null;
	let mapRef: L.Map | null = null;
	let markerCircle: L.CircleMarker | null = null;
	let ready = $state(false);

	onMount(() => {
		import('leaflet').then((leaflet) => {
			const map = leaflet.map(mapEl, { zoomControl: false, attributionControl: false });

			leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
			}).addTo(map);

			const latLngs: L.LatLngTuple[] = coordinates.map(([lng, lat]) => [lat, lng]);
			const polyline = leaflet.polyline(latLngs, { color: '#3b82f6', weight: 3 }).addTo(map);
			map.fitBounds(polyline.getBounds(), { padding: [20, 20] });

			leafletRef = leaflet;
			mapRef = map;
			ready = true;
		});

		return () => mapRef?.remove();
	});

	$effect(() => {
		if (!ready || !leafletRef || !mapRef) return;
		markerCircle?.remove();
		markerCircle = null;
		if (marker) {
			const [lng, lat] = marker;
			markerCircle = leafletRef.circleMarker([lat, lng], {
				radius: 5,
				color: 'white',
				fillColor: '#3b82f6',
				fillOpacity: 1,
				weight: 2,
			}).addTo(mapRef);
		}
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
