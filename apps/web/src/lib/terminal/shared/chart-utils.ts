import { trimLeadingZeros } from "./axes";

export const TERM_PAD = { top: 6, bottom: 20, left: 4, right: 42 } as const;
export const TERM_PAD_WIDE = { top: 6, bottom: 20, left: 4, right: 56 } as const;

export type Padding = { top: number; bottom: number; left: number; right: number };

export function findClosestIndex(
  mouseX: number,
  xPositions: number[],
): number | null {
  if (xPositions.length === 0) return null;
  let closest = 0;
  let minDist = Infinity;
  for (let i = 0; i < xPositions.length; i++) {
    const d = Math.abs(xPositions[i] - mouseX);
    if (d < minDist) {
      minDist = d;
      closest = i;
    }
  }
  return closest;
}

export function resolveMouseIndex(
  svgEl: SVGSVGElement | null,
  e: MouseEvent,
  xPositions: number[],
): number | null {
  if (!svgEl) return null;
  const rect = svgEl.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  return findClosestIndex(mouseX, xPositions);
}

export interface TrimmedData {
  startIdx: number;
  trimData: number[];
  trimXData: number[];
  trimPausedMask: boolean[] | null;
}

export function trimChartData(
  data: number[],
  xData: number[],
  pausedMask?: boolean[] | null,
): TrimmedData {
  const startIdx = trimLeadingZeros(data);
  const idx = startIdx > 0 ? startIdx : 0;
  return {
    startIdx: idx,
    trimData: idx > 0 ? data.slice(idx) : data,
    trimXData: idx > 0 ? xData.slice(idx) : xData,
    trimPausedMask: pausedMask
      ? idx > 0
        ? pausedMask.slice(idx)
        : pausedMask
      : null,
  };
}
