import type { ZoneDefinition } from '@web-runner/shared';
import { KM_TO_MI_PACE, M_TO_FT, type Units } from '$lib/format';

export type DataSource = 'pace' | 'heartrate' | 'elevation' | 'cadence' | 'power' | 'grade';
export type ChartType = 'line' | 'area' | 'bar' | 'candlestick';
export type SpecialPanel = 'map' | 'notes' | 'heatmap' | 'laps';

export interface PanelConfig {
	kind: 'chart' | 'special';
	dataSource?: DataSource;
	chartType?: ChartType;
	specialType?: SpecialPanel;
	candlestickMode?: 'splits' | 'laps';
}

export interface ProcessingParams {
	smoothingWindow: number;
	samplePoints: number;
	pauseThreshold: number;
}

export interface StreamData {
	velocity: number[] | null;
	heartrate: number[] | null;
	altitude: number[] | null;
	cadence: number[] | null;
	power: number[] | null;
	grade: number[] | null;
	distance: number[] | null;
	time: number[] | null;
	latlng: [number, number][] | null;
}

export interface ActivityNote {
	id: number;
	distanceStart: number;
	distanceEnd: number | null;
	content: string;
}

export interface ActivityLap {
	id: number;
	lapIndex: number;
	distance: number | null;
	movingTime: number | null;
	averageSpeed: number | null;
	averageHeartrate: number | null;
	averageCadence: number | null;
}

export interface ActivitySegment {
	id: number;
	segmentIndex: number;
	distanceStart: number;
	distanceEnd: number;
	avgPace: number | null;
	minPace: number | null;
	maxPace: number | null;
	avgHeartrate: number | null;
	avgCadence: number | null;
	avgPower: number | null;
	elevationGain: number | null;
	elevationLoss: number | null;
}

export const CHART_TYPE_MATRIX: Record<DataSource, ChartType[]> = {
	pace: ['line', 'area', 'bar', 'candlestick'],
	heartrate: ['line', 'area'],
	elevation: ['line', 'area'],
	cadence: ['line', 'area', 'bar'],
	power: ['line', 'area'],
	grade: ['line', 'area'],
};

export const DATA_SOURCE_COLORS: Record<DataSource, string> = {
	pace: 'var(--term-pace)',
	heartrate: 'var(--term-hr)',
	elevation: 'var(--term-elevation)',
	cadence: 'var(--term-cadence)',
	power: 'var(--term-power)',
	grade: 'var(--term-grade)',
};

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
	pace: 'Pace',
	heartrate: 'Heart Rate',
	elevation: 'Elevation',
	cadence: 'Cadence',
	power: 'Power',
	grade: 'Grade',
};

export const DEFAULT_PANELS: PanelConfig[] = [
	{ kind: 'special', specialType: 'map' },
	{ kind: 'chart', dataSource: 'pace', chartType: 'line' },
	{ kind: 'chart', dataSource: 'heartrate', chartType: 'area' },
	{ kind: 'chart', dataSource: 'elevation', chartType: 'area' },
	{ kind: 'chart', dataSource: 'cadence', chartType: 'bar' },
	{ kind: 'chart', dataSource: 'pace', chartType: 'candlestick' },
];

export function createTerminalState() {
	let crosshairIndex = $state<number | null>(null);
	let crosshairLocked = $state(false);
	let highlightedNoteId = $state<number | null>(null);
	let xAxis = $state<'distance' | 'time'>('distance');
	let params = $state<ProcessingParams>({
		smoothingWindow: 2,
		samplePoints: 500,
		pauseThreshold: 1.0,
	});
	let panels = $state<PanelConfig[]>([...DEFAULT_PANELS]);
	let showZones = $state(true);
	let showNotes = $state(true);
	let showPauseGaps = $state(true);

	return {
		get crosshairIndex() { return crosshairIndex; },
		set crosshairIndex(v) { crosshairIndex = v; },
		get crosshairLocked() { return crosshairLocked; },
		set crosshairLocked(v) { crosshairLocked = v; },
		get highlightedNoteId() { return highlightedNoteId; },
		set highlightedNoteId(v) { highlightedNoteId = v; },
		get xAxis() { return xAxis; },
		set xAxis(v) { xAxis = v; },
		get params() { return params; },
		set params(v) { params = v; },
		get panels() { return panels; },
		set panels(v) { panels = v; },
		get showZones() { return showZones; },
		set showZones(v) { showZones = v; },
		get showNotes() { return showNotes; },
		set showNotes(v) { showNotes = v; },
		get showPauseGaps() { return showPauseGaps; },
		set showPauseGaps(v) { showPauseGaps = v; },
		resetPanels() { panels = [...DEFAULT_PANELS]; },
	};
}

export type TerminalState = ReturnType<typeof createTerminalState>;

export function getAvailableDataSources(streams: StreamData): DataSource[] {
	const sources: DataSource[] = [];
	if (streams.velocity) sources.push('pace');
	if (streams.heartrate) sources.push('heartrate');
	if (streams.altitude) sources.push('elevation');
	if (streams.cadence) sources.push('cadence');
	if (streams.power) sources.push('power');
	if (streams.grade) sources.push('grade');
	return sources;
}

export function getStreamForSource(
	streams: StreamData,
	source: DataSource,
	units: Units,
): number[] | null {
	switch (source) {
		case 'pace': {
			if (!streams.velocity) return null;
			const secPerKm = streams.velocity.map((ms) => (ms > 0 ? 1000 / ms : 0));
			return units === 'imperial' ? secPerKm.map((s) => s * KM_TO_MI_PACE) : secPerKm;
		}
		case 'heartrate':
			return streams.heartrate;
		case 'elevation': {
			if (!streams.altitude) return null;
			return units === 'imperial' ? streams.altitude.map((m) => m * M_TO_FT) : streams.altitude;
		}
		case 'cadence':
			return streams.cadence ? streams.cadence.map((v) => v * 2) : null;
		case 'power':
			return streams.power;
		case 'grade':
			return streams.grade;
	}
}

export function getUnitForSource(source: DataSource, units: Units): string {
	switch (source) {
		case 'pace': return '';
		case 'heartrate': return ' bpm';
		case 'elevation': return units === 'imperial' ? ' ft' : ' m';
		case 'cadence': return ' spm';
		case 'power': return ' W';
		case 'grade': return '%';
	}
}

export function isInvertedSource(source: DataSource): boolean {
	return source === 'pace';
}

export function getZonesForSource(
	source: DataSource,
	paceZones: ZoneDefinition[],
	hrZones: ZoneDefinition[],
	units: Units,
): { zones: ZoneDefinition[]; metric: 'pace' | 'heartrate' } | null {
	if (source === 'pace') {
		const zones = units === 'imperial'
			? paceZones.map((z) => ({
				...z,
				paceMin: z.paceMin != null ? z.paceMin * KM_TO_MI_PACE : null,
				paceMax: z.paceMax != null ? z.paceMax * KM_TO_MI_PACE : null,
			}))
			: paceZones;
		return { zones, metric: 'pace' };
	}
	if (source === 'heartrate') {
		return { zones: hrZones, metric: 'heartrate' };
	}
	return null;
}

