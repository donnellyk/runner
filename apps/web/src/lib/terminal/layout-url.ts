import type {
	DataSource,
	ChartType,
	SpecialPanel,
	PanelConfig,
} from './terminal-state.svelte';
import { validatePlacement } from './grid-validation';

export interface PanelPlacement {
	col: number; // 0-11, left edge
	row: number; // 0-5, top edge
	colSpan: number; // 1-12
	rowSpan: number; // 1-6
}

export interface LayoutPanel {
	id: number; // stable identity for {#each} key
	config: PanelConfig;
	placement: PanelPlacement;
}

export interface SavedLayout {
	id: number;
	name: string;
	encoded: string;
	isDefault: boolean;
}

// --- Source / type code mappings ---

const SOURCE_TO_CODE: Record<DataSource | SpecialPanel, number> = {
	pace: 0,
	heartrate: 1,
	elevation: 2,
	cadence: 3,
	power: 4,
	grade: 5,
	map: 8,
	notes: 9,
	heatmap: 10,
	laps: 11,
};

const CODE_TO_SOURCE: Record<number, DataSource | SpecialPanel> = {};
for (const [k, v] of Object.entries(SOURCE_TO_CODE)) {
	CODE_TO_SOURCE[v] = k as DataSource | SpecialPanel;
}

const CHART_TYPE_TO_CODE: Record<string, number> = {
	line: 0,
	area: 1,
	bar: 2,
	'candlestick-splits': 3,
	'candlestick-laps': 4,
	'bar-splits': 5,
	'bar-laps': 6,
};

const CODE_TO_CHART_TYPE: Record<
	number,
	{ chartType: ChartType; candlestickMode?: 'splits' | 'laps'; barMode?: 'stream' | 'splits' | 'laps' }
> = {
	0: { chartType: 'line' },
	1: { chartType: 'area' },
	2: { chartType: 'bar' },
	3: { chartType: 'candlestick', candlestickMode: 'splits' },
	4: { chartType: 'candlestick', candlestickMode: 'laps' },
	5: { chartType: 'bar', barMode: 'splits' },
	6: { chartType: 'bar', barMode: 'laps' },
};

const SPECIAL_SOURCES = new Set<string>(['map', 'notes', 'heatmap', 'laps']);

// --- Base64url ---

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToBase64url(bytes: Uint8Array): string {
	let result = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const b0 = bytes[i];
		const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
		const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
		result += B64URL[(b0 >> 2) & 0x3f];
		result += B64URL[((b0 & 3) << 4) | ((b1 >> 4) & 0x0f)];
		if (i + 1 < bytes.length) result += B64URL[((b1 & 0x0f) << 2) | ((b2 >> 6) & 0x03)];
		if (i + 2 < bytes.length) result += B64URL[b2 & 0x3f];
	}
	return result;
}

function base64urlToBytes(str: string): Uint8Array | null {
	const lookup: Record<string, number> = {};
	for (let i = 0; i < B64URL.length; i++) lookup[B64URL[i]] = i;

	// Validate characters
	for (const ch of str) {
		if (lookup[ch] === undefined) return null;
	}

	// Pad to multiple of 4 for decoding
	const padLen = (4 - (str.length % 4)) % 4;
	const padded = str + 'A'.repeat(padLen);
	const bytes: number[] = [];
	for (let i = 0; i < padded.length; i += 4) {
		const a = lookup[padded[i]];
		const b = lookup[padded[i + 1]];
		const c = lookup[padded[i + 2]];
		const d = lookup[padded[i + 3]];
		bytes.push(((a << 2) | (b >> 4)) & 0xff);
		bytes.push(((b << 4) | (c >> 2)) & 0xff);
		bytes.push(((c << 6) | d) & 0xff);
	}
	// Trim padding bytes
	const realLen = bytes.length - padLen;
	return new Uint8Array(bytes.slice(0, realLen > 0 ? realLen : bytes.length));
}

// --- Encode / decode panels ---

function encodePanelToBytes(panel: LayoutPanel): [number, number, number] {
	let sourceCode: number;
	let typeCode: number;

	if (panel.config.kind === 'special') {
		sourceCode = SOURCE_TO_CODE[panel.config.specialType!];
		typeCode = 0;
	} else {
		sourceCode = SOURCE_TO_CODE[panel.config.dataSource!];
		if (panel.config.chartType === 'candlestick') {
			typeCode = panel.config.candlestickMode === 'laps' ? 4 : 3;
		} else if (panel.config.chartType === 'bar' && panel.config.barMode && panel.config.barMode !== 'stream') {
			typeCode = CHART_TYPE_TO_CODE[`bar-${panel.config.barMode}`];
		} else {
			typeCode = CHART_TYPE_TO_CODE[panel.config.chartType!];
		}
	}

	const { col, row, colSpan, rowSpan } = panel.placement;

	// Byte 0: [0 0 0 | source(4) | type(3)]
	const byte0 = ((sourceCode & 0x0f) << 3) | (typeCode & 0x07);
	// Byte 1: [col(4) | row(3) | X]
	const byte1 = ((col & 0x0f) << 4) | ((row & 0x07) << 1);
	// Byte 2: [colSpan(4) | rowSpan(3) | X]
	const byte2 = ((colSpan & 0x0f) << 4) | ((rowSpan & 0x07) << 1);

	return [byte0, byte1, byte2];
}

function decodePanelFromBytes(
	b0: number,
	b1: number,
	b2: number,
	id: number,
): LayoutPanel | null {
	const sourceCode = (b0 >> 3) & 0x0f;
	const typeCode = b0 & 0x07;
	const col = (b1 >> 4) & 0x0f;
	const row = (b1 >> 1) & 0x07;
	const colSpan = (b2 >> 4) & 0x0f;
	const rowSpan = (b2 >> 1) & 0x07;

	const sourceName = CODE_TO_SOURCE[sourceCode];
	if (!sourceName) return null;

	let config: PanelConfig;
	if (SPECIAL_SOURCES.has(sourceName)) {
		config = { kind: 'special', specialType: sourceName as SpecialPanel };
	} else {
		const chartInfo = CODE_TO_CHART_TYPE[typeCode];
		if (!chartInfo) return null;
		config = {
			kind: 'chart',
			dataSource: sourceName as DataSource,
			chartType: chartInfo.chartType,
		};
		if (chartInfo.candlestickMode) {
			config.candlestickMode = chartInfo.candlestickMode;
		}
		if (chartInfo.barMode) {
			config.barMode = chartInfo.barMode;
		}
	}

	return {
		id,
		config,
		placement: { col, row, colSpan, rowSpan },
	};
}

export function encodeLayout(panels: LayoutPanel[]): string {
	const bytes = new Uint8Array(panels.length * 3);
	for (let i = 0; i < panels.length; i++) {
		const [b0, b1, b2] = encodePanelToBytes(panels[i]);
		bytes[i * 3] = b0;
		bytes[i * 3 + 1] = b1;
		bytes[i * 3 + 2] = b2;
	}
	return bytesToBase64url(bytes);
}

export function decodeLayout(encoded: string): { panels: LayoutPanel[]; warning?: string } {
	if (!encoded) {
		return { panels: cloneDefaultLayout(), warning: 'Empty layout string' };
	}

	const bytes = base64urlToBytes(encoded);
	if (!bytes || bytes.length % 3 !== 0 || bytes.length === 0) {
		return { panels: cloneDefaultLayout(), warning: 'Invalid layout encoding' };
	}

	const panels: LayoutPanel[] = [];
	for (let i = 0; i < bytes.length; i += 3) {
		const panel = decodePanelFromBytes(bytes[i], bytes[i + 1], bytes[i + 2], panels.length + 1);
		if (!panel) {
			return { panels: cloneDefaultLayout(), warning: 'Invalid panel data' };
		}
		panels.push(panel);
	}

	// Validate decoded layout for overlaps, bounds, and minimum sizes
	const validation = validatePlacement(panels);
	if (!validation.valid) {
		return { panels: cloneDefaultLayout(), warning: `Invalid layout: ${validation.errors[0]}` };
	}

	return { panels };
}

export function cloneLayout(layout: LayoutPanel[]): LayoutPanel[] {
	return layout.map((p) => ({
		...p,
		config: { ...p.config },
		placement: { ...p.placement },
	}));
}

function cloneDefaultLayout(): LayoutPanel[] {
	return cloneLayout(DEFAULT_LAYOUT);
}

// --- Settings ---

export interface TerminalSettings {
	xAxis: 'distance' | 'time';
	showZones: boolean;
	showNotes: boolean;
	showPauseGaps: boolean;
	smoothingWindow: number;
	samplePoints: number;
	pauseThreshold: number;
	wickPercentile: number;
}

export const DEFAULT_SETTINGS: TerminalSettings = {
	xAxis: 'distance',
	showZones: false,
	showNotes: true,
	showPauseGaps: true,
	smoothingWindow: 2,
	samplePoints: 500,
	pauseThreshold: 1.0,
	wickPercentile: 1,
};

export function encodeSettings(settings: TerminalSettings): string {
	const params: string[] = [];

	if (settings.xAxis !== DEFAULT_SETTINGS.xAxis) {
		params.push(`x=${settings.xAxis === 'time' ? 't' : 'd'}`);
	}
	if (settings.showZones !== DEFAULT_SETTINGS.showZones) {
		params.push(`z=${settings.showZones ? '1' : '0'}`);
	}
	if (settings.showNotes !== DEFAULT_SETTINGS.showNotes) {
		params.push(`n=${settings.showNotes ? '1' : '0'}`);
	}
	if (settings.showPauseGaps !== DEFAULT_SETTINGS.showPauseGaps) {
		params.push(`pg=${settings.showPauseGaps ? '1' : '0'}`);
	}
	if (settings.smoothingWindow !== DEFAULT_SETTINGS.smoothingWindow) {
		params.push(`sm=${settings.smoothingWindow}`);
	}
	if (settings.samplePoints !== DEFAULT_SETTINGS.samplePoints) {
		params.push(`sp=${settings.samplePoints}`);
	}
	if (settings.pauseThreshold !== DEFAULT_SETTINGS.pauseThreshold) {
		params.push(`pt=${settings.pauseThreshold}`);
	}
	if (settings.wickPercentile !== DEFAULT_SETTINGS.wickPercentile) {
		params.push(`wp=${settings.wickPercentile}`);
	}

	return params.join('&');
}

export function decodeSettings(params: URLSearchParams): TerminalSettings {
	return {
		xAxis: params.get('x') === 't' ? 'time' : 'distance',
		showZones: params.get('z') === '1',
		showNotes: params.get('n') !== '0',
		showPauseGaps: params.get('pg') !== '0',
		smoothingWindow: params.has('sm')
			? Number(params.get('sm'))
			: DEFAULT_SETTINGS.smoothingWindow,
		samplePoints: params.has('sp') ? Number(params.get('sp')) : DEFAULT_SETTINGS.samplePoints,
		pauseThreshold: params.has('pt')
			? Number(params.get('pt'))
			: DEFAULT_SETTINGS.pauseThreshold,
		wickPercentile: params.has('wp')
			? Number(params.get('wp'))
			: DEFAULT_SETTINGS.wickPercentile,
	};
}

// --- Default layout ---

export const DEFAULT_LAYOUT: LayoutPanel[] = [
	{
		id: 1,
		config: { kind: 'special', specialType: 'map' },
		placement: { col: 0, row: 0, colSpan: 4, rowSpan: 3 },
	},
	{
		id: 2,
		config: { kind: 'chart', dataSource: 'pace', chartType: 'line' },
		placement: { col: 4, row: 0, colSpan: 4, rowSpan: 3 },
	},
	{
		id: 3,
		config: { kind: 'chart', dataSource: 'heartrate', chartType: 'area' },
		placement: { col: 8, row: 0, colSpan: 4, rowSpan: 3 },
	},
	{
		id: 4,
		config: { kind: 'chart', dataSource: 'elevation', chartType: 'area' },
		placement: { col: 0, row: 3, colSpan: 4, rowSpan: 3 },
	},
	{
		id: 5,
		config: { kind: 'chart', dataSource: 'cadence', chartType: 'bar' },
		placement: { col: 4, row: 3, colSpan: 4, rowSpan: 3 },
	},
	{
		id: 6,
		config: { kind: 'chart', dataSource: 'pace', chartType: 'candlestick', candlestickMode: 'laps' },
		placement: { col: 8, row: 3, colSpan: 4, rowSpan: 3 },
	},
];

let _nextPanelId = 7;

export function getNextPanelId(): number {
	return _nextPanelId++;
}

export function resetNextPanelId(startFrom: number): void {
	_nextPanelId = startFrom;
}

// --- Build full URL ---

function layoutsEqual(a: LayoutPanel[], b: LayoutPanel[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const pa = a[i],
			pb = b[i];
		if (pa.config.kind !== pb.config.kind) return false;
		if (pa.config.dataSource !== pb.config.dataSource) return false;
		if (pa.config.chartType !== pb.config.chartType) return false;
		if (pa.config.specialType !== pb.config.specialType) return false;
		if (pa.config.candlestickMode !== pb.config.candlestickMode) return false;
		const pla = pa.placement,
			plb = pb.placement;
		if (
			pla.col !== plb.col ||
			pla.row !== plb.row ||
			pla.colSpan !== plb.colSpan ||
			pla.rowSpan !== plb.rowSpan
		)
			return false;
	}
	return true;
}

export function buildTerminalUrl(panels: LayoutPanel[], settings: TerminalSettings): string {
	const parts: string[] = [];

	if (!layoutsEqual(panels, DEFAULT_LAYOUT)) {
		parts.push(`l=${encodeLayout(panels)}`);
	}

	const settingsStr = encodeSettings(settings);
	if (settingsStr) {
		parts.push(settingsStr);
	}

	return parts.length > 0 ? `?${parts.join('&')}` : '';
}
