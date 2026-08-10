// Shared locale-aware number formatting, used by every card that displays a
// numeric value (power, energy, percentages, totals). Centralizes the
// `new Intl.NumberFormat(language, options)` call that was previously
// reimplemented ad-hoc per card.
export function formatNumber(
  language: string,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(language, options).format(value);
}

// Locale's decimal separator (e.g. "," for de, "." for en) — used by the
// counter-card's digit-roll to pick the correct separator glyph.
export function decimalSeparator(language: string): string {
  const parts = new Intl.NumberFormat(language).formatToParts(1.1);
  return parts.find((p) => p.type === "decimal")?.value ?? ".";
}
