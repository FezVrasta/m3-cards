import { THEME_COLOR_TOKENS } from "../const";

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
