import type { HomeAssistant } from "../types";

/** One view of the dashboard a nav card is being added to or edited on. */
export interface LovelaceViewLike {
  path?: string;
  title?: string;
  icon?: string;
  /** A view reached from another one rather than from the tab strip. */
  subview?: boolean;
}

/**
 * The first path segment, which is how a navigation path to a view begins.
 *
 * `/lovelace/kitchen` and `/energy-dashboard/solar` are both two segments, and
 * only the first identifies the dashboard.
 */
export function dashboardSegment(): string {
  return `/${location.pathname.split("/")[1] ?? "lovelace"}`;
}

/**
 * Where a view lives, as a navigation path.
 *
 * A view's `path` is optional and the first one usually has none — Home
 * Assistant addresses it by its index instead, which is why a hand-written bar
 * points at `/lovelace/0`. An empty string is not the same as "no path" to
 * `??`, so it has to be tested for what it is, or the first entry ends up
 * pointing at a trailing slash and never matches the page it is on.
 */
export function viewPath(view: LovelaceViewLike, index: number): string {
  return `${dashboardSegment()}/${view.path || index}`;
}

/**
 * The views of the dashboard currently open, asked of Home Assistant directly.
 *
 * The editor can walk up the DOM to the Lovelace root and read the config it is
 * holding, but a card's `getStubConfig` is static and has no element to walk up
 * from — it is called while the card picker is deciding what to offer, before
 * anything of this card exists. So this asks over the websocket instead.
 *
 * The default dashboard is addressed as `null` rather than by its `lovelace`
 * path, which is Home Assistant's convention and not a guess.
 *
 * Anything unexpected — a dashboard in YAML mode that refuses the call, a
 * shape that has moved on, no permission — means the caller gets an empty list
 * and falls back. A suggestion that cannot be made is not an error.
 */
export async function dashboardViews(
  hass: HomeAssistant | undefined,
): Promise<LovelaceViewLike[]> {
  if (!hass) return [];
  const segment = location.pathname.split("/")[1] ?? "";
  const urlPath = !segment || segment === "lovelace" ? null : segment;
  try {
    const config = await hass.callWS<{ views?: LovelaceViewLike[] }>({
      type: "lovelace/config",
      url_path: urlPath,
    });
    const views = config?.views;
    if (!Array.isArray(views)) return [];
    // A subview is opened from another view, never from a tab strip, so it has
    // no business in a navigation bar built out of the tabs.
    return views.filter((view) => view && !view.subview);
  } catch {
    return [];
  }
}
