// Shared bar-geometry helper for chart-style cards (currently the weather
// card's precipitation bars). Scales a set of values to pixel heights
// against their shared maximum, with a floor so an all-zero set doesn't
// divide by zero and a minimum visible height for any non-zero value.
export interface BarGeometry {
  value: number;
  heightPx: number;
}

export function computeBarHeights(
  values: number[],
  maxHeightPx: number,
  minScaleMax = 0,
): BarGeometry[] {
  const max = Math.max(minScaleMax, ...values, 0.0001);
  return values.map((value) => ({
    value,
    heightPx: value > 0 ? Math.max(2, (value / max) * maxHeightPx) : 0,
  }));
}
