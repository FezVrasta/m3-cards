import type { StatusRule } from "../types";

// First-match-wins state rules, as a pure function.
//
// The shape — `{value|regex|above|below}` plus `label`/`icon`/`color`, and a
// rule with no condition acting as the catch-all — was invented by the status
// card and is the one vocabulary in this suite for "turn a raw state into
// something a person reads". The appliance card needs exactly the same thing
// for its status line and for its chips, so the matching moved here rather than
// being written a second (and third) time. The status card calls this too.

/**
 * Whether one rule matches a state.
 *
 * `numeric` is the state parsed as a number when it is one, and `undefined`
 * when it is not — `above`/`below` simply never match a non-numeric state
 * rather than comparing NaN and quietly returning false for the wrong reason.
 */
export function matchesStateRule(
  rule: StatusRule,
  raw: string,
  numeric: number | undefined,
): boolean {
  if (rule.value !== undefined) return raw.toLowerCase() === String(rule.value).toLowerCase();
  if (rule.regex !== undefined) {
    try {
      return new RegExp(rule.regex).test(raw);
    } catch {
      // A half-typed pattern in the editor must not throw mid-render.
      return false;
    }
  }
  if (rule.above !== undefined) return numeric !== undefined && numeric > rule.above;
  if (rule.below !== undefined) return numeric !== undefined && numeric < rule.below;
  // No condition at all is a deliberate catch-all — it is how a rule list ends
  // with "and otherwise, grey".
  return true;
}

/** The first rule that matches, or undefined when none does. */
export function findStateRule(
  rules: StatusRule[] | undefined,
  raw: string,
  numeric: number | undefined,
): StatusRule | undefined {
  return (rules ?? []).find((rule) => matchesStateRule(rule, raw, numeric));
}

/**
 * The state as a number, or undefined when it is not one.
 *
 * Deliberately stricter than `parseFloat`: "3 running" would otherwise parse as
 * 3 and start matching numeric thresholds nobody wrote for it. A comma decimal
 * is accepted because a template sensor formatted for a German locale emits it.
 */
export function numericState(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!/^-?[\d.,]+$/.test(trimmed)) return undefined;
  const parsed = parseFloat(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}
