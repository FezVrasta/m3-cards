import { describe, it, expect } from "vitest";
import { computeScaleRange, placeScaleLabels } from "./compare-scale";

describe("computeScaleRange", () => {
  it("rounds outward to whole numbers around the min/max values", () => {
    expect(
      computeScaleRange({ values: [20.4, 23.6], configMin: undefined, configMax: undefined, minSpan: 1, fallbackMin: 0, fallbackMax: 1 }),
    ).toEqual([20, 24]);
  });

  it("widens a too-narrow auto range to at least minSpan, centered on the data", () => {
    const [min, max] = computeScaleRange({
      values: [21, 21.5],
      configMin: undefined,
      configMax: undefined,
      minSpan: 8,
      fallbackMin: 0,
      fallbackMax: 1,
    });
    expect(max - min).toBeGreaterThanOrEqual(8);
    expect((min + max) / 2).toBeCloseTo(21.25, 0);
  });

  it("uses the fallback range when there are no values at all", () => {
    expect(
      computeScaleRange({ values: [], configMin: undefined, configMax: undefined, minSpan: 8, fallbackMin: 16, fallbackMax: 26 }),
    ).toEqual([16, 26]);
  });

  it("configMin/configMax override the auto range", () => {
    expect(
      computeScaleRange({ values: [20, 22], configMin: 10, configMax: 30, minSpan: 8, fallbackMin: 0, fallbackMax: 1 }),
    ).toEqual([10, 30]);
  });

  it("falls back to [min, min + minSpan] if configMax <= configMin", () => {
    expect(
      computeScaleRange({ values: [20, 22], configMin: 15, configMax: 15, minSpan: 8, fallbackMin: 0, fallbackMax: 1 }),
    ).toEqual([15, 23]);
  });
});

describe("placeScaleLabels", () => {
  it("returns no placements when the track hasn't been measured yet (width 0)", () => {
    const placed = placeScaleLabels([{ pct: 0, name: "A" }, { pct: 100, name: "B" }], 0, 5, 70, 8);
    expect(placed.size).toBe(0);
  });

  it("places every label when there is plenty of room", () => {
    const points = [
      { pct: 0, name: "A" },
      { pct: 50, name: "B" },
      { pct: 100, name: "C" },
    ];
    const placed = placeScaleLabels(points, 1000, 5, 70, 8);
    expect(placed.size).toBe(3);
  });

  it("always keeps the two extremes even under heavy crowding", () => {
    const points = [
      { pct: 0, name: "Coldest Room" },
      { pct: 1, name: "Almost As Cold" },
      { pct: 2, name: "Still Cold" },
      { pct: 100, name: "Hottest Room" },
    ];
    const placed = placeScaleLabels(points, 200, 5, 70, 8);
    expect(placed.has(0)).toBe(true);
    expect(placed.has(3)).toBe(true);
  });

  it("drops a colliding label once both rows are already taken at that spot", () => {
    // Three long labels stacked at nearly the same position: the two rows
    // (above/below) can each take one, but the third has nowhere left to go.
    const points = [
      { pct: 49, name: "Room One Long Name" },
      { pct: 50, name: "Room Two Long Name" },
      { pct: 51, name: "Room Three Long Name" },
    ];
    const placed = placeScaleLabels(points, 300, 5, 70, 8);
    expect(placed.size).toBeLessThan(3);
  });
});
