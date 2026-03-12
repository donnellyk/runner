import { describe, it, expect } from "vitest";
import {
  findClosestIndex,
  resolveMouseIndex,
  trimChartData,
  TERM_PAD,
  TERM_PAD_WIDE,
} from "./chart-utils";

describe("findClosestIndex", () => {
  it("returns null for empty array", () => {
    expect(findClosestIndex(50, [])).toBeNull();
  });

  it("finds the closest position", () => {
    expect(findClosestIndex(25, [0, 10, 20, 30, 40])).toBe(2);
    expect(findClosestIndex(0, [0, 10, 20])).toBe(0);
    expect(findClosestIndex(100, [0, 10, 20])).toBe(2);
  });
});

describe("resolveMouseIndex", () => {
  it("returns null when svgEl is null", () => {
    const e = { clientX: 100 } as MouseEvent;
    expect(resolveMouseIndex(null, e, [0, 50, 100])).toBeNull();
  });
});

describe("trimChartData", () => {
  it("trims leading zeros", () => {
    const result = trimChartData([0, 0, 5, 10], [0, 100, 200, 300]);
    expect(result.startIdx).toBe(2);
    expect(result.trimData).toEqual([5, 10]);
    expect(result.trimXData).toEqual([200, 300]);
    expect(result.trimPausedMask).toBeNull();
  });

  it("returns original data when no leading zeros", () => {
    const result = trimChartData([5, 10, 15], [0, 100, 200]);
    expect(result.startIdx).toBe(0);
    expect(result.trimData).toEqual([5, 10, 15]);
    expect(result.trimXData).toEqual([0, 100, 200]);
  });

  it("trims paused mask in sync with data", () => {
    const result = trimChartData(
      [0, 0, 5, 10],
      [0, 100, 200, 300],
      [false, true, false, true],
    );
    expect(result.startIdx).toBe(2);
    expect(result.trimPausedMask).toEqual([false, true]);
  });

  it("handles null paused mask", () => {
    const result = trimChartData([0, 5], [0, 100], null);
    expect(result.trimPausedMask).toBeNull();
  });
});

describe("padding constants", () => {
  it("TERM_PAD has expected values", () => {
    expect(TERM_PAD).toEqual({ top: 6, bottom: 20, left: 4, right: 42 });
  });

  it("TERM_PAD_WIDE has wider right padding", () => {
    expect(TERM_PAD_WIDE.right).toBe(56);
    expect(TERM_PAD_WIDE.top).toBe(TERM_PAD.top);
    expect(TERM_PAD_WIDE.bottom).toBe(TERM_PAD.bottom);
    expect(TERM_PAD_WIDE.left).toBe(TERM_PAD.left);
  });
});
