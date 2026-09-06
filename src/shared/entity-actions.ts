import type { HaActionConfig } from "../types";

// What a tap on an entity should do when the config says nothing.
//
// A button is pressed, a script is started, a switch is toggled, and anything
// else opens more-info — obvious once written down, and wrong in a way people
// notice immediately when it isn't (a `button.` entity that opens a dialog
// instead of pressing is a card that appears not to work). The mapping was
// m3-button-card's private `_defaultTapAction`; the appliance card needs the
// same answer for every button it draws, so it lives here and the button card
// calls it.

/**
 * The default action for an entity's domain.
 *
 * `call-service` rather than `perform-action` because both spellings run
 * through the same branch of `handleAction`, and the older one still works on
 * the Home Assistant versions this suite supports.
 */
export function defaultEntityAction(domain: string): HaActionConfig {
  switch (domain) {
    case "automation":
      return { action: "call-service", service: "automation.trigger" };
    case "script":
      return { action: "call-service", service: "script.turn_on" };
    case "scene":
      return { action: "call-service", service: "scene.turn_on" };
    case "button":
    case "input_button":
      return { action: "call-service", service: `${domain}.press` };
    case "light":
    case "switch":
    case "fan":
    case "input_boolean":
    case "lock":
    case "cover":
    case "siren":
      return { action: "toggle" };
    default:
      return { action: "more-info" };
  }
}

/** `select` and `input_select` behave identically; helpers stand in for devices. */
export function isSelectDomain(domain: string): boolean {
  return domain === "select" || domain === "input_select";
}

/** `number` and `input_number` likewise, both answering to `set_value`. */
export function isNumberDomain(domain: string): boolean {
  return domain === "number" || domain === "input_number";
}

/**
 * The domain that owns `select_option` for a given entity.
 *
 * An entity that is not a select at all still gets `select` rather than its own
 * domain: calling `sensor.select_option` would fail loudly, and a config that
 * points a select row at the wrong entity is better served by Home Assistant's
 * own "unknown service" error than by a card inventing one.
 */
export function selectOptionDomain(domain: string): string {
  return isSelectDomain(domain) ? domain : "select";
}

/** The domain that owns `set_value` for a slider entity, same reasoning. */
export function setValueDomain(domain: string): string {
  return isNumberDomain(domain) ? domain : "number";
}

const OFF_STATES = new Set(["off", "false", "closed", "unlocked", "idle", "standby"]);
const MISSING_STATES = new Set(["unavailable", "unknown", "none", ""]);

/** Nothing to show: no entity, or one Home Assistant cannot currently reach. */
export function isMissingState(state: string | undefined): boolean {
  return state === undefined || MISSING_STATES.has(state.toLowerCase());
}

/**
 * Whether a toggleable entity is currently on, for the "filled while on" look.
 *
 * Only the states that genuinely mean off are treated as off, so a domain with
 * states of its own (a `select` holding a programme, a `sensor`) does not read
 * as switched off merely because its state is not the word "on".
 */
export function isOnState(state: string | undefined): boolean {
  if (isMissingState(state)) return false;
  return !OFF_STATES.has(String(state).toLowerCase());
}
