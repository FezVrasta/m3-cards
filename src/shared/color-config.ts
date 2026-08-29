import { THEME_COLOR_TOKENS } from "../const";
import {
  contrastRatio,
  mixColors,
  parseColor,
  readableOn,
  readableOnCss,
  relativeLuminance,
  toHex,
} from "./contrast";
import type { Rgb } from "./contrast";

// Resolves a config color value against the curated HA/tile-card token list
// (e.g. "red", "primary"); anything not found is used verbatim as a CSS
// color (hex, rgb(), var(...), color-mix(...), ...).
export function resolveThemeColor(value: string): string {
  return THEME_COLOR_TOKENS[value] ?? value;
}

// Formats a `color-mix(...)` background-tint string. `opacityPercent` is the
// user-configured strength (0-100) from an editor opacityRow slider; when
// unset, falls back to `defaultPercent` — the value hardcoded at this call
// site before the slider existed, so unconfigured cards render identically.
export function tintBackground(
  colorCss: string,
  opacityPercent: number | undefined,
  defaultPercent: number,
): string {
  // Mixed into the card surface rather than toward transparent. Mixing toward
  // transparent leaves the result depending on everything behind the card —
  // the glass scrim, and through it the dashboard's wallpaper — so a 14% tint
  // rendered as a barely-there wash in a light theme over a dark background.
  // Against the surface the tint is definite and theme-correct at both ends:
  // the same percentage of accent over near-white in a light theme and over
  // near-black in a dark one. The card as a whole stays translucent; only
  // these inner fills become opaque, which is the Material tonal-surface
  // model and what keeps them legible.
  return `color-mix(in srgb, ${colorCss} ${opacityPercent ?? defaultPercent}%, var(--ha-card-background, var(--card-background-color)))`;
}

// Builds a `--prefix-key: value;` inline style string from a map, skipping
// undefined entries. Used by cards to assemble their CSS-custom-property
// theming block on the <ha-card> root in one line.
// Derives a readable foreground twin for each colour a card uses as *text*.
//
// The palette is built for dark backgrounds — every one of its colours falls
// below 4.5:1 on a light card surface (docs/light-theme-colors.md) — so an
// accent that reads well as a fill is washed out as a figure or a label. Each
// entry comes back with a `-fg` suffix, adjusted only as far as the target
// contrast demands and left alone when it already clears it, which means the
// dark theme is untouched.
//
// Deliberately explicit rather than derived from variable names: a card's
// foreground colours are not all called "-accent" (power-summary alone has
// `ps-main` and `ps-producer`), and guessing from names would silently miss
// them.
//
// The surface is read from the host's computed style because only the theme
// knows it. When it cannot be resolved — the element is not connected yet, or
// the theme sets nothing — every value is passed through unchanged, so the
// worst case is today's appearance.
function surfaceOf(host: HTMLElement | undefined): string {
  if (!host?.isConnected) return "";
  const cs = getComputedStyle(host);
  return (
    cs.getPropertyValue("--ha-card-background").trim() ||
    cs.getPropertyValue("--card-background-color").trim()
  );
}

// The bisection is cheap but list cards call this per row per render, and the
// set of (colour, surface) pairs a dashboard uses is tiny and stable.
const foregroundCache = new Map<string, string>();

function readableCached(colorCss: string, surface: string, target: number): string {
  const key = `${colorCss}|${surface}|${target}`;
  let out = foregroundCache.get(key);
  if (out === undefined) {
    out = readableOnCss(colorCss, surface, target);
    foregroundCache.set(key, out);
  }
  return out;
}

// Single colour in, readable colour out — for the places a card sets a text
// colour inline rather than through a CSS variable.
export function foregroundColor(
  host: HTMLElement | undefined,
  colorCss: string,
  target = 4.5,
): string {
  const surface = surfaceOf(host);
  return surface ? readableCached(colorCss, surface, target) : colorCss;
}

export function foregroundVars(
  host: HTMLElement | undefined,
  vars: Record<string, string | undefined>,
  target = 4.5,
): Record<string, string | undefined> {
  const surface = surfaceOf(host);
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) continue;
    out[`${key}-fg`] = surface ? readableCached(value, surface, target) : value;
  }
  return out;
}

export function buildCssVars(vars: Record<string, string | undefined>): string {
  return Object.entries(vars)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(" ");
}

export interface CommonColorConfig {
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
}

export interface CommonColors {
  textColorCss: string;
  secondaryTextColorCss: string;
  cardBackgroundCss: string | undefined;
}

// Resolves the text_color/secondary_text_color/card_background triplet that
// every card exposes identically, with the same fallbacks
// (var(--primary-text-color) for text, theme default for the card
// background). Previously duplicated inline in every card's render().
export function resolveCommonColors(config: CommonColorConfig): CommonColors {
  return {
    textColorCss: config.text_color
      ? resolveThemeColor(config.text_color)
      : "var(--primary-text-color)",
    secondaryTextColorCss: config.secondary_text_color
      ? resolveThemeColor(config.secondary_text_color)
      : "var(--primary-text-color)",
    cardBackgroundCss: config.card_background
      ? resolveThemeColor(config.card_background)
      : undefined,
  };
}

// The reference dark surface the palette was designed against. Used to ask what
// contrast a tint *already achieves* in a dark theme, which is then the target
// for the same tint in a light one.
const DARK_REFERENCE: Rgb = [28, 28, 28];

const tintCache = new Map<string, string>();

/**
 * Host-aware `tintBackground`: resolves the mix itself and, on a light surface,
 * darkens the result until it is as visible as the identical tint is in a dark
 * theme.
 *
 * `tintBackground` mixes the accent into the card surface, which fixed the
 * old "mixes toward transparent" bug but left a second one: the palette is made
 * of light colours, so a light accent mixed into a light surface stays light. A
 * 30% energy-card bar renders rgb(53,83,92) on #111e1c — 2.05:1, clearly
 * visible — and rgb(205,236,242) on #e8f7f3, which is 1.06:1 and effectively
 * invisible. That is what "man erkennt die Balken kaum" looks like as a number.
 *
 * The target is not invented: it is whatever *this* colour at *this* percentage
 * reaches on the reference dark surface. That makes the correction
 * self-scaling — a 10% chip wash asks for barely any contrast and stays a wash,
 * a 30% data bar asks for real separation and gets it — and a no-op in a dark
 * theme, where the mix already clears its own target.
 */
export function tintOn(
  host: HTMLElement | undefined,
  colorCss: string,
  opacityPercent: number | undefined,
  defaultPercent: number,
): string {
  const percent = opacityPercent ?? defaultPercent;
  const surfaceCss = surfaceOf(host);
  const surface = parseColor(surfaceCss);
  const color = parseColor(colorCss);
  // Unresolvable — a bare var(), a theme colour not yet applied — so hand back
  // the CSS-level mix and let the browser do what it did before.
  if (!surface || !color) return tintBackground(colorCss, opacityPercent, defaultPercent);

  const key = `${colorCss}|${surfaceCss}|${percent}`;
  const cached = tintCache.get(key);
  if (cached !== undefined) return cached;

  // A dark surface is what the palette was built for, so there is nothing to
  // correct and the reference below would only nudge it by a hundredth. Leave
  // dark themes byte-identical rather than almost-identical.
  if (relativeLuminance(surface) <= 0.5) {
    return tintBackground(colorCss, opacityPercent, defaultPercent);
  }

  const share = percent / 100;
  const mixed = mixColors(color, surface, share);
  const wanted = contrastRatio(mixColors(color, DARK_REFERENCE, share), DARK_REFERENCE);
  const out = toHex(
    contrastRatio(mixed, surface) >= wanted ? mixed : readableOn(mixed, surface, wanted),
  );
  tintCache.set(key, out);
  return out;
}

/**
 * A solid data fill — a chart bar, a progress segment — moved far enough from a
 * light surface to read as a mark rather than a wash.
 *
 * Deliberately not the `tintOn` rule. A tint can aim for the contrast the same
 * tint reaches in a dark theme, because both ends are mixtures. A *solid*
 * accent cannot: a light accent on a dark ground is inherently high-contrast
 * (#89CFF0 on #1c1c1c is 10.7:1), and demanding that on near-white would mean a
 * near-black bar. So this uses the WCAG floor for graphical objects instead,
 * 3:1, which is also comfortably above the ~2:1 the tinted bars land on — the
 * emphasis stays an emphasis.
 *
 * Only for fills that carry nothing on top. Several solid accent surfaces in
 * these cards hold dark ink (#1c1c1c), and darkening those would trade a
 * fill-vs-surface problem for an ink-vs-fill one.
 */
export function fillColor(
  host: HTMLElement | undefined,
  colorCss: string,
  target = 3,
): string {
  const surfaceCss = surfaceOf(host);
  const surface = parseColor(surfaceCss);
  if (!surface || relativeLuminance(surface) <= 0.5) return colorCss;
  return readableCached(colorCss, surfaceCss, target);
}
