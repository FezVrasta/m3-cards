// Shared locale-aware number formatting, used by every card that displays a
// numeric value (power, energy, percentages, totals). Centralizes the
// `new Intl.NumberFormat(language, options)` call that was previously
// reimplemented ad-hoc per card.
// Constructing an Intl formatter is markedly more expensive than formatting
// with one, and list cards build a formatter per value per render. Keyed by
// language plus the options object, so the handful of shapes this suite uses
// are each built once for the life of the page.
const numberFormatters = new Map<string, Intl.NumberFormat>();

// Returns a cached formatter, or undefined for a locale/options combination
// Intl rejects. Exposed so callers that need formatToParts (currency symbol
// splitting) share the same cache instead of building their own.
export function getNumberFormat(
  language: string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat | undefined {
  const key = language + "|" + (options ? JSON.stringify(options) : "");
  const cached = numberFormatters.get(key);
  if (cached) return cached;
  try {
    const fmt = new Intl.NumberFormat(language, options);
    numberFormatters.set(key, fmt);
    return fmt;
  } catch {
    // An unusable locale tag from hass.locale would otherwise throw mid
    // render. Two of the nine per-card copies guarded this, seven did not;
    // consolidating keeps the safer behaviour for all of them.
    return undefined;
  }
}

export function formatNumber(
  language: string,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  const fmt = getNumberFormat(language, options);
  return fmt ? fmt.format(value) : value.toFixed(options?.maximumFractionDigits ?? 0);
}

// Locale's decimal separator (e.g. "," for de, "." for en) — used by the
// counter-card's digit-roll to pick the correct separator glyph.
const separators = new Map<string, string>();

export function decimalSeparator(language: string): string {
  const cached = separators.get(language);
  if (cached !== undefined) return cached;
  const parts = getNumberFormat(language)?.formatToParts(1.1) ?? [];
  const sep = parts.find((p) => p.type === "decimal")?.value ?? ".";
  separators.set(language, sep);
  return sep;
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
