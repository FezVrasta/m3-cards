import type { HaActionConfig, HomeAssistant } from "../types";

// The tap/hold/double-tap action config every Lovelace card understands, run
// from one place.
//
// The button card has carried its own copy of this since it was the only card
// that needed more than `more-info`. The status card needs the same seven
// branches — toggle above all, which is what makes a "medication given" card
// tappable — so the logic moved here rather than being written twice. The
// button card still has its own copy; it is the most-used card in the suite and
// not worth destabilising for a refactor, but it should adopt this next time it
// is touched.

function fireMoreInfo(source: HTMLElement, entityId?: string): void {
  if (!entityId) return;
  source.dispatchEvent(
    new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId },
    }),
  );
}

function navigate(source: HTMLElement, path: string): void {
  window.history.pushState(null, "", path);
  source.dispatchEvent(
    new CustomEvent("location-changed", {
      bubbles: true,
      composed: true,
      detail: { replace: false },
    }),
  );
}

/**
 * Runs one action.
 *
 * `entityId` is the entity the action defaults to — the more-info target, the
 * toggle target, and the `entity_id` passed to a service that names no target
 * of its own. An action with no entity behind it (a `navigate`, or a service
 * call with an explicit target) works fine without one.
 */
export function handleAction(
  source: HTMLElement,
  hass: HomeAssistant | undefined,
  action: HaActionConfig | undefined,
  entityId?: string,
): void {
  if (!hass) return;
  const cfg = action ?? { action: "more-info" as const };

  switch (cfg.action) {
    case "none":
      return;
    case "toggle":
      if (!entityId) return;
      hass.callService("homeassistant", "toggle", { entity_id: entityId });
      return;
    case "more-info":
      fireMoreInfo(source, entityId);
      return;
    case "call-service":
    case "perform-action": {
      const serviceStr = cfg.perform_action ?? cfg.service;
      if (!serviceStr) return;
      const [domain, service] = serviceStr.split(".");
      if (!domain || !service) return;
      hass.callService(domain, service, {
        // An explicit target replaces the implied entity rather than joining
        // it: `homeassistant.turn_off` with a target list plus the card's own
        // entity would switch off one more thing than the config asked for.
        ...(cfg.target ? {} : entityId ? { entity_id: entityId } : {}),
        ...(cfg.target ?? {}),
        ...(cfg.data ?? cfg.service_data ?? {}),
      });
      return;
    }
    case "navigate":
      if (cfg.navigation_path) navigate(source, cfg.navigation_path);
      return;
    case "url":
      if (cfg.url_path)
        window.open(cfg.url_path, cfg.new_tab === false ? "_self" : "_blank");
      return;
    default:
      return;
  }
}

/** Whether an action would do nothing, so a card can skip the pointer affordances. */
export function isActionable(action: HaActionConfig | undefined): boolean {
  return (action?.action ?? "more-info") !== "none";
}
