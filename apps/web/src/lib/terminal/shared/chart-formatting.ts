/**
 * Shared Y-axis value formatting for terminal chart components.
 *
 * Extracts the duplicated `fmt()` / `fmtShort()` pattern from
 * TerminalLineChart and CadenceBarChart.
 */

/** Format a Y-axis value with its unit suffix (e.g. "142 bpm"). */
export function formatYValue(
	value: number,
	unit: string,
	formatValue?: (v: number) => string,
): string {
	return formatValue ? formatValue(value) : `${value.toFixed(0)}${unit}`;
}

/** Format a Y-axis value without the trailing "/unit" suffix (e.g. "5:30" instead of "5:30 /km"). */
export function formatYValueShort(
	value: number,
	formatValue?: (v: number) => string,
): string {
	if (formatValue) {
		return formatValue(value).replace(/\s*\/\w+$/, '');
	}
	return value.toFixed(0);
}
