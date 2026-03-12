import { describe, it, expect } from "vitest";
import {
  computeHorizontalStats,
  computeVerticalStats,
} from "./selection-stats";

describe("computeHorizontalStats", () => {
  const data = [10, 20, 30, 40, 50];
  const xData = [0, 100, 200, 300, 400];

  it("computes min, max, avg over a range", () => {
    const result = computeHorizontalStats(data, xData, 1, 3, null);
    expect(result).toEqual({
      mode: "horizontal",
      min: 20,
      max: 40,
      avg: 30,
      points: 3,
      xStart: 100,
      xEnd: 300,
    });
  });

  it("handles single-point selection", () => {
    const result = computeHorizontalStats(data, xData, 2, 2, null);
    expect(result).toEqual({
      mode: "horizontal",
      min: 30,
      max: 30,
      avg: 30,
      points: 1,
      xStart: 200,
      xEnd: 200,
    });
  });

  it("orders indices correctly when startIdx > endIdx", () => {
    const result = computeHorizontalStats(data, xData, 3, 1, null);
    expect(result).toEqual({
      mode: "horizontal",
      min: 20,
      max: 40,
      avg: 30,
      points: 3,
      xStart: 100,
      xEnd: 300,
    });
  });

  it("excludes paused points", () => {
    const mask = [false, true, false, false, true];
    const result = computeHorizontalStats(data, xData, 0, 4, mask);
    expect(result).toEqual({
      mode: "horizontal",
      min: 10,
      max: 40,
      avg: (10 + 30 + 40) / 3,
      points: 3,
      xStart: 0,
      xEnd: 400,
    });
  });

  it("returns null if all points in range are paused", () => {
    const mask = [true, true, true, true, true];
    const result = computeHorizontalStats(data, xData, 0, 4, mask);
    expect(result).toBeNull();
  });

  it("returns null for out-of-bounds indices", () => {
    const result = computeHorizontalStats(data, xData, -1, 2, null);
    expect(result).toBeNull();
  });
});

describe("computeVerticalStats", () => {
  const data = [10, 20, 30, 40, 50];

  it("counts points within value range", () => {
    const result = computeVerticalStats(data, 15, 35, null);
    expect(result).toEqual({
      mode: "vertical",
      lowValue: 15,
      highValue: 35,
      points: 2,
      totalPoints: 5,
      pct: 40,
      avg: 25,
    });
  });

  it("includes boundary values", () => {
    const result = computeVerticalStats(data, 20, 40, null);
    expect(result).toEqual({
      mode: "vertical",
      lowValue: 20,
      highValue: 40,
      points: 3,
      totalPoints: 5,
      pct: 60,
      avg: 30,
    });
  });

  it("orders values correctly when low > high", () => {
    const result = computeVerticalStats(data, 40, 20, null);
    expect(result).toEqual({
      mode: "vertical",
      lowValue: 20,
      highValue: 40,
      points: 3,
      totalPoints: 5,
      pct: 60,
      avg: 30,
    });
  });

  it("excludes paused points from total and count", () => {
    const mask = [false, false, true, false, false];
    const result = computeVerticalStats(data, 15, 35, mask);
    expect(result).toEqual({
      mode: "vertical",
      lowValue: 15,
      highValue: 35,
      points: 1,
      totalPoints: 4,
      pct: 25,
      avg: 20,
    });
  });

  it("returns null if no points in range", () => {
    const result = computeVerticalStats(data, 55, 60, null);
    expect(result).toBeNull();
  });

  it("handles all points in range", () => {
    const result = computeVerticalStats(data, 0, 100, null);
    expect(result).toEqual({
      mode: "vertical",
      lowValue: 0,
      highValue: 100,
      points: 5,
      totalPoints: 5,
      pct: 100,
      avg: 30,
    });
  });
});
