export interface OverlaySeries {
	data: number[];
	xData: number[];
	color: string;
	label: string;
}

export interface OverlayRoute {
	coordinates: [number, number][];
	color: string;
	label: string;
}

export interface ActivityData {
	distance: number | null;
	movingTime: number | null;
	averageSpeed: number | null;
	averageHeartrate: number | null;
	totalElevationGain: number | null;
	averageCadence: number | null;
	routeGeoJson?: string | null;
}

export function isNumberArray(data: unknown): data is number[] {
	return Array.isArray(data) && data.every((v) => typeof v === 'number');
}

export function isLatLngArray(data: unknown): data is [number, number][] {
	return (
		Array.isArray(data) &&
		data.every(
			(v) =>
				Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number',
		)
	);
}
