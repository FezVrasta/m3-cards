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

// Coarse "how long ago" used by the occupancy card's status line: minutes up
// to an hour, then hours up to a day, then days. Deliberately one unit and no
// decimals — "seit 2 Std." is what a glance needs, "seit 2 Std. 14 Min." is
// not. The caller supplies the localized unit strings.
export function formatSince(
  fromIso: string | undefined,
  units: { minutes: string; hours: string; days: string },
  now = Date.now(),
): string | undefined {
  if (!fromIso) return undefined;
  const then = Date.parse(fromIso);
  if (isNaN(then)) return undefined;
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 60) return units.minutes.replace("{n}", String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return units.hours.replace("{n}", String(hours));
  return units.days.replace("{n}", String(Math.floor(hours / 24)));
}
