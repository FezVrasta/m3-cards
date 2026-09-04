import type { HomeAssistant } from "../types";

// Rendering other people's Lovelace cards inside one of ours.
//
// Home Assistant builds a card from a config through `loadCardHelpers()`, an
// async global it exposes to custom cards for exactly this. The nav card's
// sheet is the first place in this suite that needs it; it lives here rather
// than in that card because "host a list of arbitrary cards" is the kind of
// thing a second card eventually wants too, and copying the lifecycle rules
// below is how they drift.
//
// Two rules matter and both are easy to get wrong:
//
//   1. Build once, not per render. `createCardElement` is not cheap, and a
//      rebuilt card loses whatever state it was holding — a media card's
//      scrubber, an expanded section, a half-typed field. So the elements are
//      created when the *config* changes, never in the render path.
//   2. `hass` is pushed, not passed. Every Lovelace card takes its data from a
//      `hass` property set on it from outside; a nested card that never gets a
//      fresh one renders the state it was born with, forever.

// The one declaration of this global in the suite. `createCardElement` returns
// the element synchronously — only `loadCardHelpers()` itself is async — so a
// caller that awaits the result still works, but the type says what HA does.
export interface CardHelpers {
  createCardElement: (config: Record<string, unknown>) => HTMLElement;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

/**
 * Builds one element per config.
 *
 * A config Home Assistant cannot build comes back as its own error card rather
 * than throwing, which is what every other Lovelace container shows for a bad
 * card, so it is passed straight through instead of being caught and restyled.
 */
export async function createCards(
  configs: Record<string, unknown>[],
  hass: HomeAssistant | undefined,
): Promise<HTMLElement[]> {
  const loader = window.loadCardHelpers;
  if (!loader || !configs.length) return [];
  let helpers: CardHelpers;
  try {
    helpers = await loader();
  } catch {
    // The helpers are part of the frontend bundle a Lovelace card is loaded
    // by, so this should not happen — but an empty sheet beats a card that
    // throws during its own update.
    return [];
  }

  const out: HTMLElement[] = [];
  for (const config of configs) {
    const el = helpers.createCardElement(config);
    (el as HTMLElement & { hass?: HomeAssistant }).hass = hass;
    out.push(el);
  }
  return out;
}

/** Pushes a fresh `hass` into each nested card. Cheap enough to call per tick. */
export function updateCardsHass(
  cards: HTMLElement[],
  hass: HomeAssistant | undefined,
): void {
  for (const card of cards) {
    (card as HTMLElement & { hass?: HomeAssistant }).hass = hass;
  }
}
