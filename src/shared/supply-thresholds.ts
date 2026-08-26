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
  if (item.pack_size) return item.pack_size;
  const max = (state?.attributes?.maximum ?? state?.attributes?.max) as number | undefined;
  return typeof max === "number" && max > 0 ? max : DEFAULT_SUPPLY_PACK_SIZE;
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
