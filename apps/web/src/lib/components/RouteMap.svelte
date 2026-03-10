<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type L from 'leaflet';

	export interface NoteMarker {
		id: number;
		content: string;
		point: [number, number];
		range?: [number, number][];
	}

	interface Props {
		coordinates: [number, number][];
		marker?: [number, number] | null;
		darkMap?: boolean;
		noteMarkers?: NoteMarker[];
		showNotes?: boolean;
		highlightedNoteId?: number | null;
	}

	let {
		coordinates,
		marker = null,
		darkMap = false,
		noteMarkers = [],
		showNotes = true,
		highlightedNoteId = null,
	}: Props = $props();
	let mapEl: HTMLDivElement;

	let leafletRef: typeof L | null = null;
	let mapRef: L.Map | null = null;
	let markerCircle: L.CircleMarker | null = null;
	let noteLayerGroup: L.LayerGroup | null = null;
	let noteLayers: SvelteMap<number, L.CircleMarker | L.Polyline> = new SvelteMap();
	let ready = $state(false);

	onMount(() => {
		import('leaflet').then((leaflet) => {
			const map = leaflet.map(mapEl, { zoomControl: false, attributionControl: false });

			const tileUrl = darkMap
				? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
				: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
			leaflet.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

			const latLngs: L.LatLngTuple[] = coordinates.map(([lng, lat]) => [lat, lng]);
			const polyline = leaflet.polyline(latLngs, { color: '#3b82f6', weight: 3 }).addTo(map);
			map.fitBounds(polyline.getBounds(), { padding: [20, 20] });

			noteLayerGroup = leaflet.layerGroup().addTo(map);

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

	$effect(() => {
		if (!ready || !leafletRef || !noteLayerGroup) return;
		noteLayerGroup.clearLayers();
		noteLayers.clear();

		if (!showNotes) return;

		for (const nm of noteMarkers) {
			if (nm.range && nm.range.length > 1) {
				const latLngs = nm.range.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
				const line = leafletRef.polyline(latLngs, {
					color: '#f59e0b',
					weight: 5,
					opacity: 0.7,
				}).bindTooltip(nm.content, { sticky: true });
				line.addTo(noteLayerGroup);
				noteLayers.set(nm.id, line);
			} else {
				const [lng, lat] = nm.point;
				const circle = leafletRef.circleMarker([lat, lng], {
					radius: 6,
					fillColor: '#f59e0b',
					color: '#ffffff',
					weight: 2,
					fillOpacity: 0.9,
				}).bindTooltip(nm.content, { direction: 'top', offset: [0, -8] });
				circle.addTo(noteLayerGroup);
				noteLayers.set(nm.id, circle);
			}
		}
	});

	$effect(() => {
		if (!ready || !mapRef || highlightedNoteId == null) return;
		const layer = noteLayers.get(highlightedNoteId);
		if (!layer) return;
		layer.openTooltip();
		const bounds = 'getBounds' in layer ? (layer as L.Polyline).getBounds() : (layer as L.CircleMarker).getLatLng();
		if (bounds instanceof leafletRef!.LatLng) {
			mapRef.panTo(bounds);
		} else {
			mapRef.panTo((bounds as L.LatLngBounds).getCenter());
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

<div bind:this={mapEl} class="w-full h-96 rounded border border-zinc-200"></div>
