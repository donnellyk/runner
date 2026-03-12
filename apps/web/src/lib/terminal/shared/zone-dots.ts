import type { ZoneDefinition } from "@web-runner/shared";

export interface ZoneDotBand {
	color: string;
	dots: { cx: number; cy: number }[];
}

export function computeZoneDotGrid(opts: {
	zones: ZoneDefinition[];
	zoneMetric: "pace" | "heartrate";
	yMin: number;
	yMax: number;
	toY: (v: number) => number;
	padTop: number;
	padLeft: number;
	chartW: number;
	chartH: number;
}): ZoneDotBand[] {
	const { zones, zoneMetric, yMin, yMax, toY, padTop, padLeft, chartW, chartH } = opts;

	const bands = zones
		.map((z) => {
			const lo = zoneMetric === "pace" ? z.paceMin : z.hrMin;
			const hi = zoneMetric === "pace" ? z.paceMax : z.hrMax;
			const rawLo = lo ?? yMin;
			const rawHi = hi ?? yMax;
			const y1 = Math.min(toY(rawLo), toY(rawHi));
			const y2 = Math.max(toY(rawLo), toY(rawHi));
			const bandY = Math.max(y1, padTop);
			const bandH = Math.min(y2, padTop + chartH) - bandY;
			return { color: z.color, y: bandY, h: bandH };
		})
		.filter((b) => b.h > 0);

	if (bands.length === 0) return [];

	const totalTop = Math.min(...bands.map((b) => b.y));
	const totalBottom = Math.max(...bands.map((b) => b.y + b.h));
	const totalH = totalBottom - totalTop;
	const DOT_SPACING = 8;
	const cols = Math.max(1, Math.floor(chartW / DOT_SPACING));
	const totalRows = Math.max(1, Math.floor(totalH / DOT_SPACING));
	const hSpace = chartW / cols;
	const vSpace = totalH / totalRows;

	function isCorner(globalRow: number): boolean {
		const edge = Math.min(globalRow, totalRows - 1 - globalRow);
		return edge === 0;
	}

	return bands.map((band) => {
		const dots: { cx: number; cy: number }[] = [];
		for (let gr = 0; gr < totalRows; gr++) {
			const cy = totalTop + vSpace * (gr + 0.5);
			if (cy < band.y || cy >= band.y + band.h) continue;

			const skip = isCorner(gr) ? 1 : 0;
			for (let c = skip; c < cols - skip; c++) {
				dots.push({ cx: padLeft + hSpace * (c + 0.5), cy });
			}
		}
		return { color: band.color, dots };
	});
}
