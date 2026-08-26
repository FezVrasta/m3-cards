import type { HomeAssistant, M3SupplyCardConfig, SupplyItemConfig } from "../types";
import { supplyPackSize, supplyLimits } from "./supply-thresholds";

// Bridges m3-supply-card and m3-todo-card: the shopping texts a user already
// configured on their supply card become one-tap chips on the shopping list,
// so a supply running low does not have to be typed out again.
//
// The supply configs live in the dashboard's Lovelace config, which a card can
// only reach by asking for it. That is a heavier read than a card would
// normally do, so it happens once per config rather than on every render.

interface LovelaceCardLike {
  type?: string;
  cards?: LovelaceCardLike[];
}

interface LovelaceConfigLike {
  views?: { cards?: LovelaceCardLike[]; sections?: { cards?: LovelaceCardLike[] }[] }[];
}

// The dashboard behind the current URL: the first path segment names it, and
// the default dashboard is addressed as null. An unknown segment (a card
// rendered outside a dashboard, e.g. in a preview) falls back to the default.
function dashboardPath(known: Set<string>): string | null {
  const segment = window.location.pathname.split("/").filter(Boolean)[0];
  return segment && known.has(segment) ? segment : null;
}

function walk(cards: LovelaceCardLike[] | undefined, out: LovelaceCardLike[]): void {
  for (const card of cards ?? []) {
    out.push(card);
    // Stacks and grids nest their children, and a supply card may well sit
    // inside one.
    walk(card.cards, out);
  }
}

export async function collectSupplyChips(hass: HomeAssistant): Promise<string[]> {
  try {
    const dashboards = await hass.callWS<{ url_path: string | null }[]>({
      type: "lovelace/dashboards/list",
    });
    const known = new Set(dashboards.map((d) => d.url_path).filter((p): p is string => !!p));
    const config = await hass.callWS<LovelaceConfigLike>({
      type: "lovelace/config",
      url_path: dashboardPath(known),
    });

    const all: LovelaceCardLike[] = [];
    for (const view of config.views ?? []) {
      walk(view.cards, all);
      for (const section of view.sections ?? []) walk(section.cards, all);
    }

    const supplies = all.filter(
      (c) => c.type === "custom:m3-supply-card",
    ) as unknown as M3SupplyCardConfig[];

    // Ranked by how close each supply is to running out, so the chips a user
    // actually needs come first when max_quick_add cuts the list short.
    const scored: { text: string; ratio: number }[] = [];
    for (const supply of supplies) {
      for (const item of supply.items ?? []) {
        const text = chipText(item, hass);
        if (!text) continue;
        scored.push({ text, ratio: fillRatio(item, hass) });
      }
    }
    scored.sort((a, b) => a.ratio - b.ratio);
    return scored.map((s) => s.text);
  } catch (e) {
    console.warn("m3-todo-card: could not read supply cards for quick add", e);
    return [];
  }
}

function chipText(item: SupplyItemConfig, hass: HomeAssistant): string | undefined {
  const explicit = item.shopping_item?.trim();
  if (explicit) return explicit;
  const name =
    item.name ?? (hass.states[item.entity]?.attributes.friendly_name as string | undefined);
  return name?.trim() || undefined;
}

// 0 means empty, 1 a full pack; anything at or below its own "low" threshold
// is pulled to the front by being scored as if it were emptier than it is.
function fillRatio(item: SupplyItemConfig, hass: HomeAssistant): number {
  const state = hass.states[item.entity];
  const value = Number(state?.state);
  if (!state || isNaN(value)) return Infinity;
  const packSize = supplyPackSize(item, state);
  if (packSize <= 0) return Infinity;
  const { low } = supplyLimits(packSize, item);
  const ratio = value / packSize;
  return value <= low ? ratio - 1 : ratio;
}
