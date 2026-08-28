import type { HomeAssistant } from "../types";

// Builds the occupancy card's activity timeline: for each sensor, which slices
// of the recent past had any motion in them.
//
// The History API is asked once for every sensor on the card rather than once
// per sensor — a card with six rooms would otherwise open six round-trips on
// every refresh.

interface HistoryPoint {
  s?: string;
  lu?: number;
}

/**
 * A segment is active when the sensor was "on" at any moment inside it.
 * Anything else — off, unavailable, no data — leaves it inactive.
 */
export async function fetchOccupancySegments(
  hass: HomeAssistant,
  entityIds: string[],
  hours: number,
  segments: number,
): Promise<Map<string, boolean[]>> {
  const out = new Map<string, boolean[]>();
  if (!entityIds.length || segments < 1) return out;

  const nowMs = Date.now();
  const startMs = nowMs - hours * 3600_000;

  let response: Record<string, HistoryPoint[]> = {};
  try {
    response = await hass.callWS<Record<string, HistoryPoint[]>>({
      type: "history/history_during_period",
      start_time: new Date(startMs).toISOString(),
      end_time: new Date(nowMs).toISOString(),
      entity_ids: entityIds,
      minimal_response: true,
      no_attributes: true,
    });
  } catch (e) {
    console.warn("m3-occupancy-card: history_during_period failed", e);
    return out;
  }

  const width = (nowMs - startMs) / segments;
  for (const id of entityIds) {
    out.set(id, toSegments(response[id] ?? [], startMs, nowMs, segments, width));
  }
  return out;
}

function toSegments(
  points: HistoryPoint[],
  startMs: number,
  nowMs: number,
  segments: number,
  width: number,
): boolean[] {
  const slots = new Array<boolean>(segments).fill(false);
  const usable = points
    .filter((p) => p.lu !== undefined && p.s !== undefined)
    .map((p) => ({ t: p.lu! * 1000, on: p.s === "on" }))
    .sort((a, b) => a.t - b.t);
  if (!usable.length) return slots;

  // Each point states the value from its own timestamp until the next one;
  // the last runs to now. Marking whole intervals rather than single points is
  // what makes a sensor that stayed on for an hour fill an hour of the strip
  // instead of one slot.
  for (let i = 0; i < usable.length; i++) {
    if (!usable[i].on) continue;
    const from = Math.max(usable[i].t, startMs);
    const to = i + 1 < usable.length ? usable[i + 1].t : nowMs;
    if (to <= startMs) continue;
    const first = Math.max(0, Math.floor((from - startMs) / width));
    // The interval end is exclusive, so an interval that stops exactly on a
    // boundary must not light the slot it never entered.
    const last = Math.min(segments - 1, Math.ceil((to - startMs) / width) - 1);
    for (let s = first; s <= last; s++) slots[s] = true;
  }
  return slots;
}
