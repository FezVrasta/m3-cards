import type { HomeAssistant } from "../types";

// Whether a collapsible thing is folded away, and where that answer is kept.
//
// Two cards need this — the heading card folds the cards below it, the room
// card folds its own body — and they need it to behave identically, so the
// rule lives here rather than in two copies that drift.
//
// An `input_boolean` is the better home when one is configured: the state then
// survives a different browser, syncs between phone and tablet, and an
// automation can fold a section away. Without one the browser remembers it,
// which is per-device and good enough for a display preference.

export interface CollapseTarget {
  /** An `input_boolean` holding the state, or nothing for localStorage. */
  entity?: string;
  /** Identifies this collapsible in localStorage. */
  storageKey: string;
  defaultCollapsed?: boolean;
}

export function readCollapsed(
  hass: HomeAssistant | undefined,
  target: CollapseTarget,
): boolean {
  if (target.entity) {
    const state = hass?.states[target.entity]?.state;
    if (state === "on") return true;
    if (state === "off") return false;
    // An unavailable helper falls back to the configured default rather than
    // silently reading as "expanded".
    return target.defaultCollapsed ?? false;
  }
  try {
    const stored = window.localStorage.getItem(target.storageKey);
    if (stored !== null) return stored === "1";
  } catch {
    // Private mode, or storage disabled. The default is still correct.
  }
  return target.defaultCollapsed ?? false;
}

export function writeCollapsed(
  hass: HomeAssistant | undefined,
  target: CollapseTarget,
  value: boolean,
): void {
  if (target.entity) {
    hass?.callService("input_boolean", value ? "turn_on" : "turn_off", {
      entity_id: target.entity,
    });
    return;
  }
  try {
    window.localStorage.setItem(target.storageKey, value ? "1" : "0");
  } catch {
    // Not being able to remember is survivable; not being able to fold would
    // not be.
  }
}
