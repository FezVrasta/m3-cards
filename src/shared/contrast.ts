// Contrast helpers for the accent colours.
//
// The suite's palette is built for dark backgrounds: every one of its colours
// clears 4.5:1 on #1c1c1c and every one falls below it on #fafafa (measured in
// docs/light-theme-colors.md). Used as a fill that is fine — the glass scrim
// and tintBackground give fills their own ground. Used as *foreground* text it
// is not, and a light theme leaves those values washed out.
//
// The correction cannot be a fixed mix percentage: how far a colour has to move
// depends on its own luminance, and across the palette the required share of
// accent ranges from 64% to 99% for 3:1 and 47% to 81% for 4.5:1. So it is
// driven by the target ratio instead, which also makes it work for a colour the
// user configured rather than only for the palette.

export type Rgb = [number, number, number];

// WCAG relative luminance.
export function relativeLuminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Parses the colour notations that actually reach these helpers: #rgb, #rrggbb,
// rgb()/rgba() and the color(srgb …) form getComputedStyle returns in Chromium
// once a color-mix() has been resolved. Anything else — a bare var(), a named
// colour, hsl() — returns undefined, and callers fall back rather than guess.
export function parseColor(css: string): Rgb | undefined {
  const s = css.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => !isNaN(n))) {
      return parts.slice(0, 3) as Rgb;
    }
  }
  const srgb = s.match(/^color\(\s*srgb\s+([^)]+)\)$/i);
  if (srgb) {
    const parts = srgb[1].split(/[\s/]+/).filter(Boolean).map(parseFloat);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => !isNaN(n))) {
      return parts.slice(0, 3).map((n) => Math.round(n * 255)) as Rgb;
    }
  }
  return undefined;
}

export function toHex([r, g, b]: Rgb): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

// Rounds as it blends. The search has to measure the colour that will actually
// be emitted: bisecting on floats and rounding afterwards let five of the
// thirteen palette colours land a hundredth below the target.
function blend(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
}

/**
 * Returns `color` moved just far enough away from `surface` to reach `target`
 * contrast, or `color` unchanged when it already does.
 *
 * It moves toward black on a light surface and toward white on a dark one, so
 * the hue survives and only lightness changes — on a light theme this produces
 * the deep, muted tones Material 3 uses for "on-container" text, which is the
 * intended look rather than a loss.
 *
 * Bisects on the blend fraction: black and white are the extremes and always
 * pass, so the search converges on the least-changed colour that clears the bar.
 */
export function readableOn(color: Rgb, surface: Rgb, target = 4.5): Rgb {
  if (contrastRatio(color, surface) >= target) return color;
  const towards: Rgb = relativeLuminance(surface) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  if (contrastRatio(towards, surface) < target) return towards; // unreachable target
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const t = (lo + hi) / 2;
    if (contrastRatio(blend(color, towards, t), surface) >= target) hi = t;
    else lo = t;
  }
  let out = blend(color, towards, hi);
  // Belt and braces: 12 halvings leave a step of ~1/4096, and a rounded
  // channel can still sit a hair under. Walk the last few steps explicitly
  // rather than hand back a colour that misses the bar it was asked for.
  for (let i = 0; i < 8 && contrastRatio(out, surface) < target; i++) {
    hi = Math.min(1, hi + 1 / 256);
    out = blend(color, towards, hi);
  }
  return out;
}

/**
 * String-in, string-out wrapper. Returns the original CSS untouched when either
 * colour cannot be parsed — a bare `var(--primary-color)`, say — so a card never
 * ends up with a broken declaration just because a value was not resolvable.
 */
export function readableOnCss(colorCss: string, surfaceCss: string, target = 4.5): string {
  const color = parseColor(colorCss);
  const surface = parseColor(surfaceCss);
  if (!color || !surface) return colorCss;
  return toHex(readableOn(color, surface, target));
}

/** Linear mix of `a` into `b`; `t` is the share of `a`. Rounds as it blends. */
export function mixColors(a: Rgb, b: Rgb, t: number): Rgb {
  return blend(b, a, t);
}
