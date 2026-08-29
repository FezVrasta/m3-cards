import type { PropertyValues } from "lit";
import type { HomeAssistant } from "../types";

// Home Assistant hands every card a fresh `hass` object on every state change
// anywhere in the system — a single chatty power sensor on a two-second cycle
// re-renders every card on the dashboard, whether or not it has anything to do
// with that sensor. Measured on a real 35-card view here: 573 renders in 15
// seconds, almost all of them redrawing identical output.
//
// A card opts out by implementing shouldUpdate and naming what it actually
// reads:
//
//   protected shouldUpdate(changed: PropertyValues): boolean {
//     return hassChangeMatters(changed, this.hass, [this._config?.entity]);
//   }
//
// The one hazard is under-declaring: a card that reads an entity it does not
// list will stop reacting to it. List every entity the render path touches,
// including optional ones — an `undefined` in the list is ignored, so passing
// a config field that may be unset is safe.
export function hassChangeMatters(
  changed: PropertyValues,
  hass: HomeAssistant | undefined,
  entities: (string | undefined)[],
): boolean {
  // Anything other than `hass` alone — a config change, an internal @state —
  // always renders. Only the pure-hass tick is worth filtering.
  if (!changed.has("hass") || changed.size > 1) return true;

  const previous = changed.get("hass") as HomeAssistant | undefined;
  if (!previous || !hass) return true;

  // Locale, theme and connection changes repaint everything: they alter
  // formatting and colours without touching any entity state.
  if (
    previous.locale !== hass.locale ||
    previous.themes !== hass.themes ||
    previous.language !== hass.language ||
    previous.connected !== hass.connected
  ) {
    return true;
  }

  // HA replaces the state object for an entity when it changes, so identity
  // comparison is enough and no deep compare is needed.
  for (const id of entities) {
    if (!id) continue;
    if (previous.states[id] !== hass.states[id]) return true;
  }
  return false;
}

// Several cards accept a list of either bare entity ids or objects carrying
// one (plus, for cover pairs, an up/down/stop trio). Flattens both shapes into
// the list hassChangeMatters wants; undefined entries are ignored there.
export function listEntities(
  list?: (string | { entity?: string; up_entity?: string; down_entity?: string; stop_entity?: string })[],
): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  for (const item of list ?? []) {
    if (typeof item === "string") {
      out.push(item);
      continue;
    }
    out.push(item?.entity, item?.up_entity, item?.down_entity, item?.stop_entity);
  }
  return out;
}
