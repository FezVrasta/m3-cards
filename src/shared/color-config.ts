import { THEME_COLOR_TOKENS } from "../const";

// Resolves a config color value against the curated HA/tile-card token list
// (e.g. "red", "primary"); anything not found is used verbatim as a CSS
// color (hex, rgb(), var(...), color-mix(...), ...).
export function resolveThemeColor(value: string): string {
  return THEME_COLOR_TOKENS[value] ?? value;
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
