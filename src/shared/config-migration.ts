import { CARD_VERSION } from "../const";
import type { AnimationMode } from "./animation";

// The 3 oldest cards (climate, climate-mini, button) predate the
// `animation: "auto"|"on"|"off"` convention every other card uses and still
// accept the old `animations: boolean` field. This maps a legacy config to
// the new field without discarding it, so existing YAML/dashboards keep
// working unchanged after the rename.
export function migrateAnimationsField<
  T extends { animations?: boolean; animation?: AnimationMode },
>(config: T): T {
  if (config.animation !== undefined || config.animations === undefined) {
    return config;
  }
  const { animations, ...rest } = config;
  return { ...rest, animation: animations ? "auto" : "off" } as T;
}

// Stamps the config with the card version that last touched it. Only takes
// effect for configs a visual editor re-saves (fired via config-changed);
// hand-written YAML that's never resaved is left as the user wrote it.
export function stampVersion<T extends { card_version?: string }>(config: T): T {
  if (config.card_version === CARD_VERSION) return config;
  return { ...config, card_version: CARD_VERSION };
}
