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

// Counting the entity ids means walking every key in hass.states — about a
// thousand on a real install. Doing that once per card per tick would cost more
// than the renders this module exists to avoid, so the count is memoised
// against the states object itself: every card on the dashboard is handed the
// same one, so the walk happens once per tick no matter how many ask.
const stateCountCache = new WeakMap<object, number>();

function stateCount(hass: HomeAssistant): number {
  let n = stateCountCache.get(hass.states);
  if (n === undefined) {
    n = Object.keys(hass.states).length;
    stateCountCache.set(hass.states, n);
  }
  return n;
}

/**
 * For cards that find their entities by scanning `hass.states` rather than
 * reading them from config.
 *
 * They need one thing more than `hassChangeMatters` gives them: the discovery
 * itself runs from `updated()`, so a `shouldUpdate` that filters a tick out
 * also stops the card from ever noticing a newly added sensor. Listing the
 * entities it currently reads is not enough — the entity it should start
 * reading is by definition not in that list.
 *
 * So a change in the *number* of entities also lets the tick through. A count
 * catches every addition and removal, which is what discovery reacts to. It
 * misses a rename that removes one id and adds another within the same tick;
 * that is rare, it resolves on the next reload, and the alternative — comparing
 * a thousand keys on every state change anywhere in the system — costs more
 * than it is worth.
 */
export function discoveryChangeMatters(
  changed: PropertyValues,
  hass: HomeAssistant | undefined,
  entities: (string | undefined)[],
): boolean {
  if (hassChangeMatters(changed, hass, entities)) return true;

  const previous = changed.get("hass") as HomeAssistant | undefined;
  if (!previous || !hass) return true;
  return stateCount(previous) !== stateCount(hass);
}
