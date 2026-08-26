import type { HassEntity, SupplyItemConfig, SupplyNotifyLevel } from "../types";
import {
  DEFAULT_SUPPLY_PACK_SIZE,
  SUPPLY_LOW_FRACTION,
  SUPPLY_CRITICAL_FRACTION,
  SUPPLY_CRITICAL_FLOOR,
} from "../const";

// Shared by the card (which colours a row) and its editor (which bakes the
// same numbers into the notification automation's Jinja). Keeping one
// implementation means a notification can never fire at a different point
// than the row that turned red.

/** A counter helper exposes minimum/maximum/step, an input_number min/max/step. */
export function supplyPackSize(
  item: SupplyItemConfig,
  state: HassEntity | undefined,
): number {
  const max = (state?.attributes?.maximum ?? state?.attributes?.max) as number | undefined;
  const ceiling = typeof max === "number" && max > 0 ? max : undefined;
  if (!item.pack_size) return ceiling ?? DEFAULT_SUPPLY_PACK_SIZE;
  // A helper's maximum is a hard ceiling, not a label — Home Assistant refuses
  // to store anything above it. Showing a larger pack would promise a capacity
  // that can never be reached: the dot row could never fill, and "pack
  // refilled" would set the ceiling and appear to do nothing. Cap the display
  // at what the helper can actually hold; the editor tells the user to raise
  // the helper's maximum if they really do keep a larger pack.
  if (ceiling !== undefined && item.pack_size > ceiling) return ceiling;
  return item.pack_size;
}

export interface SupplyLimits {
  low: number;
  critical: number;
}

// "Low" at 25% of the pack, "critical" at 10%, each never below one unit so a
// small pack does not sit permanently in the warning state.
export function supplyLimits(packSize: number, item: SupplyItemConfig): SupplyLimits {
  return {
    low: item.low_threshold ?? Math.round(packSize * SUPPLY_LOW_FRACTION),
    critical:
      item.critical_threshold ??
      Math.max(SUPPLY_CRITICAL_FLOOR, Math.round(packSize * SUPPLY_CRITICAL_FRACTION)),
  };
}

/** The count at or below which the chosen notify level is reached. */
export function supplyNotifyLimit(
  level: SupplyNotifyLevel,
  limits: SupplyLimits,
): number {
  if (level === "empty") return 0;
  return level === "low" ? limits.low : limits.critical;
}
