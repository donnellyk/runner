/**
 * Shared Y-axis coordinate transforms for terminal chart components.
 *
 * Extracts the duplicated `toY()` / `fromY()` pattern from
 * TerminalLineChart and CandlestickChart.
 */

export interface YAxisScaling {
	/** Map a data value to a pixel Y coordinate within the chart area. */
	toY: (yVal: number) => number;
	/** Map a pixel Y coordinate back to a data value (inverse of toY). */
	fromY: (px: number) => number;
}

/**
 * Create a pair of functions that convert between data values and pixel Y coordinates.
 *
 * @param yMin     - Minimum data value
 * @param yMax     - Maximum data value
 * @param padTop   - Top padding in pixels (chart area starts here)
 * @param chartH   - Height of the chart area in pixels
 * @param invertY  - When true, higher data values map to higher pixel Y (e.g. pace charts)
 */
export function createYAxisScaling(
	yMin: number,
	yMax: number,
	padTop: number,
	chartH: number,
	invertY = false,
): YAxisScaling {
	const yRange = yMax - yMin || 1;

	function toY(yVal: number): number {
		const t = (yVal - yMin) / yRange;
		return invertY ? padTop + t * chartH : padTop + chartH - t * chartH;
	}

	function fromY(px: number): number {
		const t = invertY
			? (px - padTop) / chartH
			: (padTop + chartH - px) / chartH;
		return yMin + t * yRange;
	}

	return { toY, fromY };
}
