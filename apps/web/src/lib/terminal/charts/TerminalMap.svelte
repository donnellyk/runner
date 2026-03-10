<script lang="ts">
	import { onMount } from 'svelte';
	import type L from 'leaflet';

	interface Props {
		coordinates: [number, number][];
		latlngStream?: [number, number][] | null;
		crosshairOrigIdx?: number | null;
	}

	let {
		coordinates,
		latlngStream = null,
		crosshairOrigIdx = null,
	}: Props = $props();

	let mapEl: HTMLDivElement;
	let leafletRef: typeof L | null = null;
	let mapRef: L.Map | null = null;
	let markerCircle: L.CircleMarker | null = null;
	let coveredPolyline: L.Polyline | null = null;
	let ready = $state(false);

	onMount(() => {
		import('leaflet').then((leaflet) => {
			const map = leaflet.map(mapEl, { zoomControl: false, attributionControl: false });

			leaflet.tileLayer(
				'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
				{ maxZoom: 19 },
			).addTo(map);

			const latLngs: L.LatLngTuple[] = coordinates.map(([lng, lat]) => [lat, lng]);
			leaflet.polyline(latLngs, { color: '#3b82f6', weight: 2, opacity: 0.4 }).addTo(map);
			map.fitBounds(leaflet.latLngBounds(latLngs), { padding: [15, 15] });

			leafletRef = leaflet;
			mapRef = map;
			ready = true;

			setTimeout(() => map.invalidateSize(), 100);
		});

		return () => mapRef?.remove();
	});

	$effect(() => {
		if (!ready || !leafletRef || !mapRef) return;
		markerCircle?.remove();
		markerCircle = null;
		coveredPolyline?.remove();
		coveredPolyline = null;

		if (crosshairOrigIdx != null && latlngStream) {
			const pt = latlngStream[crosshairOrigIdx];
			if (pt) {
				markerCircle = leafletRef.circleMarker([pt[0], pt[1]], {
					radius: 5,
					color: '#ffffff',
					fillColor: '#3b82f6',
					fillOpacity: 1,
					weight: 2,
				}).addTo(mapRef);

				const covered: L.LatLngTuple[] = [];
				for (let i = 0; i <= crosshairOrigIdx && i < latlngStream.length; i++) {
					covered.push([latlngStream[i][0], latlngStream[i][1]]);
				}
				if (covered.length > 1) {
					coveredPolyline = leafletRef.polyline(covered, {
						color: '#3b82f6',
						weight: 3,
						opacity: 1,
					}).addTo(mapRef);
				}
			}
		}
	});

	$effect(() => {
		if (!ready || !mapRef || !leafletRef) return;
		mapRef.invalidateSize();
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
</svelte:head>

<div class="relative w-full h-full flex flex-col" style="min-height: 0;">
	<div class="flex items-baseline justify-between px-2 py-1 shrink-0">
		<span class="text-[10px] uppercase tracking-widest" style="color: var(--term-text-muted); font-family: 'Geist Mono', monospace;">
			Map
		</span>
	</div>
	<div bind:this={mapEl} class="flex-1" style="min-height: 0; border-radius: 2px;"></div>
</div>
