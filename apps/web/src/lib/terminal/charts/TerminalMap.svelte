<script lang="ts">
	import { onMount } from 'svelte';
	import type L from 'leaflet';
	import type { OverlayRoute } from '../types';

	interface Props {
		coordinates: [number, number][];
		latlngStream?: [number, number][] | null;
		distanceStream?: number[] | null;
		crosshairOrigIdx?: number | null;
		highlightRange?: { start: number; end: number } | null;
		overlayRoutes?: OverlayRoute[];
	}

	let {
		coordinates,
		latlngStream = null,
		distanceStream = null,
		crosshairOrigIdx = null,
		highlightRange = null,
		overlayRoutes = [],
	}: Props = $props();

	let mapEl: HTMLDivElement;
	let leafletRef: typeof L | null = null;
	let mapRef: L.Map | null = null;
	let markerCircle: L.CircleMarker | null = null;
	let coveredPolyline: L.Polyline | null = null;
	let highlightPolyline: L.Polyline | null = null;
	let overlayPolylines: L.Polyline[] = [];
	let ready = $state(false);

	onMount(() => {
		import('leaflet').then((leaflet) => {
			const map = leaflet.map(mapEl, { zoomControl: false, attributionControl: false });

			leaflet.tileLayer(
				'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
				{ maxZoom: 19, keepBuffer: 5 },
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

	// Overlay routes
	$effect(() => {
		if (!ready || !leafletRef || !mapRef) return;
		for (const p of overlayPolylines) p.remove();
		overlayPolylines = [];

		for (const route of overlayRoutes) {
			const pts: L.LatLngTuple[] = route.coordinates.map(([lng, lat]) => [lat, lng]);
			const polyline = leafletRef.polyline(pts, {
				color: route.color,
				weight: 2,
				opacity: 0.7,
			}).addTo(mapRef);
			overlayPolylines.push(polyline);
		}

		// Fit bounds to include all routes
		if (overlayRoutes.length > 0) {
			const allLatLngs: L.LatLngTuple[] = coordinates.map(([lng, lat]) => [lat, lng]);
			for (const route of overlayRoutes) {
				for (const [lng, lat] of route.coordinates) {
					allLatLngs.push([lat, lng]);
				}
			}
			mapRef.fitBounds(leafletRef.latLngBounds(allLatLngs), { padding: [15, 15] });
		}
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
				const latLng = leafletRef.latLng(pt[0], pt[1]);
				markerCircle = leafletRef.circleMarker(latLng, {
					radius: 5,
					color: '#ffffff',
					fillColor: '#3b82f6',
					fillOpacity: 1,
					weight: 2,
				}).addTo(mapRef);

				if (!mapRef.getBounds().contains(latLng)) {
					mapRef.panTo(latLng, { animate: true, duration: 0.3 });
				}

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
		if (!ready || !leafletRef || !mapRef) return;
		highlightPolyline?.remove();
		highlightPolyline = null;

		if (highlightRange && latlngStream && distanceStream) {
			let si = 0, ei = distanceStream.length - 1;
			for (let i = 0; i < distanceStream.length; i++) {
				if (distanceStream[i] >= highlightRange.start) { si = i; break; }
			}
			for (let i = distanceStream.length - 1; i >= 0; i--) {
				if (distanceStream[i] <= highlightRange.end) { ei = i; break; }
			}
			if (si <= ei) {
				const pts: L.LatLngTuple[] = [];
				for (let i = si; i <= ei; i++) {
					pts.push([latlngStream[i][0], latlngStream[i][1]]);
				}
				if (pts.length > 1) {
					highlightPolyline = leafletRef.polyline(pts, {
						color: '#fbbf24',
						weight: 4,
						opacity: 0.9,
					}).addTo(mapRef);
				}
			}
		}
	});

	$effect(() => {
		if (!ready || !mapRef || !mapEl) return;
		const map = mapRef;
		let raf1: number;
		let raf2: number;
		const ro = new ResizeObserver(() => {
			map.invalidateSize();
			// Double-rAF: guarantees a full layout+paint cycle has completed,
			// so nested flex/grid dimensions have settled on mapEl.
			cancelAnimationFrame(raf1);
			raf1 = requestAnimationFrame(() => {
				raf2 = requestAnimationFrame(() => map.invalidateSize());
			});
		});
		ro.observe(mapEl);
		return () => {
			cancelAnimationFrame(raf1);
			cancelAnimationFrame(raf2);
			ro.disconnect();
		};
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
</svelte:head>

<div class="relative w-full h-full flex flex-col" style="min-height: 0;">
	<div bind:this={mapEl} class="flex-1" style="min-height: 0; border-radius: 2px;"></div>
</div>
