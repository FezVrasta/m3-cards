// Pure logic behind m3-appliance-card, kept out of the element so it can be
// tested: the suite has no DOM, so anything that needs `hass` or a render root
// is untestable here by design (docs/TESTING.md). What is left — reading a
// number entity's range, turning "when will it be done" into minutes — is
// exactly the part that is worth a test, because every one of these has a
// wrong answer that looks plausible on screen.

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

export interface SliderRangeOverrides {
  min?: number;
  max?: number;
  step?: number;
}

/** Fallback range for an entity that reports none, which some templates do not. */
export const SLIDER_RANGE_FALLBACK: SliderRange = { min: 0, max: 100, step: 1 };

/**
 * The range a slider row works over.
 *
 * The entity's own `min`/`max`/`step` are the source of truth — a `number`
 * entity publishes all three — and the config only overrides them, so a card
 * cannot silently offer an oven a temperature its integration would reject.
 * An inverted or degenerate range (max <= min) falls back rather than
 * rendering a slider whose handle has nowhere to go.
 */
export function resolveSliderRange(
  attributes: Record<string, unknown> | undefined,
  overrides: SliderRangeOverrides = {},
): SliderRange {
  const attr = (key: string): number | undefined => {
    const value = attributes?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
  const min = overrides.min ?? attr("min") ?? SLIDER_RANGE_FALLBACK.min;
  const max = overrides.max ?? attr("max") ?? SLIDER_RANGE_FALLBACK.max;
  const step = overrides.step ?? attr("step") ?? SLIDER_RANGE_FALLBACK.step;
  const usableStep = Number.isFinite(step) && step > 0 ? step : SLIDER_RANGE_FALLBACK.step;
  if (!(max > min)) return { ...SLIDER_RANGE_FALLBACK, step: usableStep };
  return { min, max, step: usableStep };
}

/** Snaps a raw value onto the range's own grid, clamped to its ends. */
export function snapToRange(value: number, range: SliderRange): number {
  const stepped = Math.round((value - range.min) / range.step) * range.step + range.min;
  const clamped = Math.min(range.max, Math.max(range.min, stepped));
  // Floating-point steps (0.5, 0.1) accumulate visible dirt — 21.500000000000004
  // reaches the service call and, worse, the label above the slider.
  return Math.round(clamped * 1e6) / 1e6;
}

/**
 * How many minutes are left, from whatever shape the integration chose.
 *
 * There is no agreement on this at all. Home Connect gives a duration in
 * seconds, a Shelly template gives whole minutes, LG's integration gives an
 * absolute completion timestamp, and a Tuya washer gives "01:24:00". All four
 * are the same fact, and a card that understood only one of them would work for
 * a quarter of the appliances it is meant for.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the timestamp case
 * is testable; the card passes the real clock.
 */
export function remainingMinutes(
  raw: string | undefined,
  attributes: Record<string, unknown> | undefined,
  now: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const state = raw.trim();
  if (!state) return undefined;

  const deviceClass = attributes?.device_class;
  const unit = String(attributes?.unit_of_measurement ?? "").toLowerCase();

  // A duration written as a clock: "1:24:00" (h:mm:ss) or "24:00" (mm:ss when
  // it came from a timer, h:mm when it came from a template). Two fields are
  // read as h:mm, because that is what an appliance means by "1:24" — a washing
  // machine has never had 84 seconds left.
  const clock = state.match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = clock[3] === undefined ? 0 : Number(clock[3]);
    return hours * 60 + minutes + seconds / 60;
  }

  const numeric = Number(state);
  if (Number.isFinite(numeric) && /^-?[\d.]+$/.test(state)) {
    const minutes =
      unit.startsWith("s") ? numeric / 60 : unit.startsWith("h") ? numeric * 60 : numeric;
    return Math.max(0, minutes);
  }

  // An absolute completion time. Accepted whenever it parses, not only when the
  // entity declares `device_class: timestamp`, because plenty of template
  // sensors publish an ISO string and declare nothing.
  if (deviceClass === "timestamp" || /\d{4}-\d{2}-\d{2}/.test(state)) {
    const at = Date.parse(state);
    if (Number.isFinite(at)) return Math.max(0, (at - now) / 60000);
  }

  return undefined;
}

/** Whole hours and minutes, for a caption the card assembles in its own language. */
export function splitDuration(totalMinutes: number): { hours: number; minutes: number } {
  const rounded = Math.max(0, Math.round(totalMinutes));
  return { hours: Math.floor(rounded / 60), minutes: rounded % 60 };
}

/**
 * Title-cases a raw option/state string when no label was configured for it.
 *
 * Integration option strings are `heavy_duty`, `Mixed-Load`, `spin_1400`; none
 * of them belong on a pill as written.
 */
export function prettifyOption(raw: string): string {
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * The options a select row shows: the entity's own, narrowed and reordered by
 * an `options` allow-list when one is given.
 *
 * An allow-list entry the entity does not offer is dropped rather than shown —
 * a pill that calls `select_option` with an option the entity rejects is worse
 * than a pill that is not there.
 */
export function visibleOptions(
  entityOptions: unknown,
  allowList: string[] | undefined,
): string[] {
  const available = Array.isArray(entityOptions)
    ? entityOptions.filter((o): o is string => typeof o === "string")
    : [];
  if (!allowList?.length) return available;
  return allowList.filter((o) => available.includes(o));
}
