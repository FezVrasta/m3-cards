import type { HomeAssistant, HassEntity } from "../types";

// Time handling shared by the m3-time-card variants: reading an
// input_datetime helper, deciding 12h vs 24h, and writing back without
// disturbing the parts of the value the card does not edit.

export interface TimeParts {
  hours: number;
  minutes: number;
  seconds: number;
  /** "YYYY-MM-DD" for helpers that also carry a date; undefined otherwise. */
  date?: string;
}

export function hasTime(state: HassEntity | undefined): boolean {
  return state?.attributes?.has_time === true;
}

export function hasDate(state: HassEntity | undefined): boolean {
  return state?.attributes?.has_date === true;
}

// The helper publishes hour/minute/second as attributes, which is more
// reliable than parsing the state string — that string is "HH:MM:SS" for a
// time helper but "YYYY-MM-DD HH:MM:SS" for a combined one.
export function readTime(state: HassEntity | undefined): TimeParts | undefined {
  if (!state) return undefined;
  const { hour, minute, second } = state.attributes as Record<string, unknown>;
  if (typeof hour !== "number" || typeof minute !== "number") return undefined;
  const parts: TimeParts = {
    hours: hour,
    minutes: minute,
    seconds: typeof second === "number" ? second : 0,
  };
  if (hasDate(state)) {
    // "YYYY-MM-DD HH:MM:SS" — take the date half verbatim so writing back
    // cannot shift the day through a timezone round-trip.
    const [datePart] = String(state.state).split(" ");
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) parts.date = datePart;
  }
  return parts;
}

// hass.locale.time_format is "12" | "24" | "language" | "system"; the last two
// defer to the locale, which Intl already knows how to resolve.
export function uses12Hour(hass: HomeAssistant | undefined): boolean {
  const format = hass?.locale?.time_format;
  if (format === "12") return true;
  if (format === "24") return false;
  const language =
    format === "system" ? undefined : (hass?.locale?.language ?? hass?.language);
  try {
    return !!new Intl.DateTimeFormat(language, { hour: "numeric" }).resolvedOptions().hour12;
  } catch {
    return false;
  }
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 24h hours -> the 1..12 shown in 12h mode, plus which half of the day. */
export function to12Hour(hours: number): { display: number; pm: boolean } {
  const pm = hours >= 12;
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return { display, pm };
}

export function from12Hour(display: number, pm: boolean): number {
  const base = display % 12;
  return pm ? base + 12 : base;
}

export function formatTime(hours: number, minutes: number, twelveHour: boolean): string {
  if (!twelveHour) return `${pad2(hours)}:${pad2(minutes)}`;
  const { display, pm } = to12Hour(hours);
  return `${display}:${pad2(minutes)} ${pm ? "PM" : "AM"}`;
}

/** Wraps hours 0..23 and minutes 0..59, carrying minutes over into hours. */
export function stepTime(
  parts: { hours: number; minutes: number },
  field: "hours" | "minutes",
  delta: number,
): { hours: number; minutes: number } {
  if (field === "hours") {
    return { ...parts, hours: (((parts.hours + delta) % 24) + 24) % 24 };
  }
  const total = parts.hours * 60 + parts.minutes + delta;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return { hours: Math.floor(wrapped / 60), minutes: wrapped % 60 };
}

export async function writeTime(
  hass: HomeAssistant,
  entityId: string,
  next: TimeParts,
): Promise<void> {
  const time = `${pad2(next.hours)}:${pad2(next.minutes)}:${pad2(next.seconds)}`;
  // A combined date+time helper rejects a bare `time`; it needs the whole
  // datetime, so the untouched date half is sent back along with the new time.
  const data = next.date ? { datetime: `${next.date} ${time}` } : { time };
  await hass.callService("input_datetime", "set_datetime", data, { entity_id: entityId });
}
