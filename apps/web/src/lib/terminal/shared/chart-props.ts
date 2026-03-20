/**
 * Shared prop type definitions for terminal chart components.
 *
 * These interfaces document the common prop shapes used across
 * TerminalLineChart, CadenceBarChart, and CandlestickChart.
 * Components extend these in their inline `interface Props`.
 */

import type { Units } from '$lib/format';

/** Callbacks for crosshair interaction events. */
export interface CrosshairCallbacks {
	oncrosshairmove?: (index: number | null) => void;
	oncrosshairclick?: (index: number | null) => void;
	oncrosshairleave?: () => void;
}

/** Common data props shared by stream-based charts (line, bar). */
export interface ChartDataProps {
	distanceData?: number[];
	timeData?: number[];
	xAxis?: 'distance' | 'time';
	units?: Units;
	crosshairIndex?: number | null;
	crosshairLocked?: boolean;
	highlightRange?: { start: number; end: number } | null;
}

/** Label, color, and unit props shared by stream-based charts. */
export interface ChartLabelProps {
	label: string;
	color: string;
	unit: string;
	formatValue?: (v: number) => string;
}
