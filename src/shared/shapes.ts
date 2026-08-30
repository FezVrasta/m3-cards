// Lobed ("organic") shapes as SVG paths.
//
// Material 3 Expressive leans on rounded shapes that are not circles: cookie
// discs, clover leaves, scalloped edges. All of them are the same curve with
// different settings — a circle whose radius rises and falls a few times as it
// goes round — so one generator covers the whole family rather than a folder of
// hand-drawn paths.
//
// Kept here rather than inside the clock card because every card in the suite
// can use them: an icon well, a status badge, a progress track.

/** How many samples make up one closed path. */
const SAMPLES = 160;

/**
 * A closed SVG path for a lobed circle.
 *
 * `r(t) = R + R * ampRatio * cos(lobes * t + rotation)`
 *
 * @param cx        centre x
 * @param cy        centre y
 * @param R         base radius, before the lobes push in and out
 * @param lobes     how many bumps go round the shape
 * @param ampRatio  how far a bump reaches, as a share of `R`. 0 is a circle;
 *                  0.2 is a pronounced flower. Above ~0.35 the curve starts to
 *                  self-intersect for low lobe counts.
 * @param rotation  phase in radians — animate this to turn the shape
 */
export function lobedPath(
  cx: number,
  cy: number,
  R: number,
  lobes: number,
  ampRatio: number,
  rotation = 0,
): string {
  // Guard rather than emit a broken `d`: a NaN in a path silently draws
  // nothing, which is a hard bug to see.
  if (!Number.isFinite(R) || R <= 0) return "";

  let d = "";
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / SAMPLES) * Math.PI * 2;
    const r = R + R * ampRatio * Math.cos(lobes * t + rotation);
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d + "Z";
}

/** The named shapes the cards offer, as (lobes, amplitude) pairs. */
export const SHAPE_PRESETS = {
  /** Seven shallow bumps — reads as a disc with a soft, biscuit-like edge. */
  cookie: { lobes: 7, amp: 0.09 },
  /** Four deep lobes. */
  clover: { lobes: 4, amp: 0.16 },
  /** Five deep lobes. */
  flower: { lobes: 5, amp: 0.2 },
  /** Eight very shallow bumps — almost a circle, just not quite. */
  scallop: { lobes: 8, amp: 0.055 },
  /** No lobes at all: a plain circle, for a rounded-square look via CSS radius. */
  squircle: { lobes: 0, amp: 0 },
} as const;

export type ShapeName = keyof typeof SHAPE_PRESETS;

export const SHAPE_NAMES = Object.keys(SHAPE_PRESETS) as ShapeName[];

/** `lobedPath` for a named preset. */
export function shapePath(
  name: ShapeName,
  cx: number,
  cy: number,
  R: number,
  rotation = 0,
): string {
  const preset = SHAPE_PRESETS[name] ?? SHAPE_PRESETS.cookie;
  return lobedPath(cx, cy, R, preset.lobes, preset.amp, rotation);
}

/**
 * The base radius at which a named shape fits inside a square box, lobes and
 * all, with `margin` pixels to spare.
 *
 * The obvious `box / 2 * 0.94` is wrong: a lobe reaches `R * (1 + amp)`, so a
 * cookie at 94% of half the box extends to 1.025 of it and pushes past the
 * edge. Dividing by `(1 + amp)` is what actually bounds the outermost point —
 * and it has to, because the bounding box of a lobed shape changes as it turns:
 * a maximum that happens to point sideways now will point diagonally a second
 * later.
 */
export function fittedRadius(box: number, name: ShapeName, margin = 0): number {
  const preset = SHAPE_PRESETS[name] ?? SHAPE_PRESETS.cookie;
  return Math.max(0, (box / 2 - margin) / (1 + preset.amp));
}

/**
 * One base radius that fits *every* named shape in the list inside the box.
 *
 * Fitting each shape on its own makes them look unequal: a clover reaches
 * further from its centre than a cookie, so bounding it to the same box leaves
 * it with a smaller body — 28.45 against 30.28 in a 72px cell, which reads as
 * the minute pair being smaller than the hour pair. Sizing the whole set by its
 * deepest lobe gives them a common radius, so they look like siblings.
 */
export function sharedFittedRadius(box: number, names: ShapeName[], margin = 0): number {
  const worst = names.reduce(
    (amp, n) => Math.max(amp, (SHAPE_PRESETS[n] ?? SHAPE_PRESETS.cookie).amp),
    0,
  );
  return Math.max(0, (box / 2 - margin) / (1 + worst));
}
