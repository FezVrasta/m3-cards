// Shared M3-Expressive sine-wave math, used by every wavy slider/bar in
// this project (progress-card's indicator, the light-card's brightness and
// color-temperature sliders).

// Builds an SVG path string for a horizontal sine wave sampled every `step`
// px, offset by startX so it can be positioned anywhere along a longer
// logical wave (keeps the pattern continuous across active/track splits).
export function buildWavePath(
  startX: number,
  widthPx: number,
  amplitude: number,
  wavelength: number,
  phase: number,
  midY: number,
  step = 4,
): string {
  if (widthPx <= 0) return "";
  const parts: string[] = [];
  let x = 0;
  for (; x <= widthPx; x += step) {
    const absX = startX + x;
    const y =
      midY + amplitude * Math.sin((absX / wavelength) * 2 * Math.PI + phase);
    parts.push(`${x === 0 ? "M" : "L"}${absX.toFixed(2)},${y.toFixed(2)}`);
  }
  const absXEnd = startX + widthPx;
  const yEnd =
    midY + amplitude * Math.sin((absXEnd / wavelength) * 2 * Math.PI + phase);
  parts.push(`L${absXEnd.toFixed(2)},${yEnd.toFixed(2)}`);
  return parts.join(" ");
}

// Exponential lerp step, used to smoothly animate wave amplitude toward a
// target (e.g. collapsing to 0 when a card goes idle/off).
export function lerpStep(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}
