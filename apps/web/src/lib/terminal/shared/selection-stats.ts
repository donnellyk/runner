export interface HorizontalSelection {
  mode: "horizontal";
  startIdx: number;
  endIdx: number;
}

export interface VerticalSelection {
  mode: "vertical";
  lowValue: number;
  highValue: number;
}

export type Selection = HorizontalSelection | VerticalSelection;

export interface HorizontalStats {
  mode: "horizontal";
  min: number;
  max: number;
  avg: number;
  points: number;
  xStart: number;
  xEnd: number;
}

export interface VerticalStats {
  mode: "vertical";
  lowValue: number;
  highValue: number;
  points: number;
  totalPoints: number;
  pct: number;
  avg: number;
}

export type SelectionStats = HorizontalStats | VerticalStats;

export function computeHorizontalStats(
  smoothData: number[],
  xData: number[],
  startIdx: number,
  endIdx: number,
  pausedMask: boolean[] | null,
): HorizontalStats | null {
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  if (lo < 0 || hi >= smoothData.length) return null;

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let count = 0;

  for (let i = lo; i <= hi; i++) {
    if (pausedMask?.[i]) continue;
    const v = smoothData[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    count++;
  }

  if (count === 0) return null;

  return {
    mode: "horizontal",
    min,
    max,
    avg: sum / count,
    points: count,
    xStart: xData[lo],
    xEnd: xData[hi],
  };
}

export function computeVerticalStats(
  smoothData: number[],
  lowValue: number,
  highValue: number,
  pausedMask: boolean[] | null,
): VerticalStats | null {
  const lo = Math.min(lowValue, highValue);
  const hi = Math.max(lowValue, highValue);

  let points = 0;
  let totalPoints = 0;
  let sum = 0;

  for (let i = 0; i < smoothData.length; i++) {
    if (pausedMask?.[i]) continue;
    totalPoints++;
    const v = smoothData[i];
    if (v >= lo && v <= hi) {
      points++;
      sum += v;
    }
  }

  if (points === 0) return null;

  return {
    mode: "vertical",
    lowValue: lo,
    highValue: hi,
    points,
    totalPoints,
    pct: (points / totalPoints) * 100,
    avg: sum / points,
  };
}
