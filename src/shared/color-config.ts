import { THEME_COLOR_TOKENS } from "../const";
import { readableOnCss } from "./contrast";

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
