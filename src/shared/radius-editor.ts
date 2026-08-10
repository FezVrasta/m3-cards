import { RADIUS_PRESETS } from "../const";
import { localize, type TranslationKey } from "../localize";
import type { SchemaEntry } from "./editor-helpers";

export const CORNER_KEYS = [
  "top_left",
  "top_right",
  "bottom_right",
  "bottom_left",
] as const;

export function radiusPreset(
  radius: number | undefined,
  defaultRadius: number,
  presets: Record<string, number> = RADIUS_PRESETS,
): string {
  const current = radius ?? defaultRadius;
  const match = Object.entries(presets).find(([, px]) => px === current);
  return match ? match[0] : "custom";
}

function presetOptions(language: string) {
  const t = (key: TranslationKey) => localize(key, language);
  return [
    { value: "eckig", label: t("editor_radius_square") },
    { value: "leicht_rund", label: t("editor_radius_soft") },
    { value: "rund", label: t("editor_radius_round") },
    { value: "custom", label: t("editor_radius_custom") },
  ];
}

export function radiusPresetSchema(language: string): SchemaEntry[] {
  return [
    {
      name: "radius_preset",
      selector: { select: { mode: "dropdown", options: presetOptions(language) } },
    },
  ];
}

export function radiusValueSchema(): SchemaEntry[] {
  return [
    {
      name: "radius",
      selector: { number: { mode: "box", min: 0, step: 1, unit_of_measurement: "px" } },
    },
  ];
}

export function cornersToggleSchema(): SchemaEntry[] {
  return [{ name: "use_corners", selector: { boolean: {} } }];
}

export function cornerPresetSchema(key: string, language: string): SchemaEntry[] {
  return [
    {
      name: key,
      selector: { select: { mode: "dropdown", options: presetOptions(language) } },
    },
  ];
}

export function cornerValueSchema(key: string): SchemaEntry[] {
  return [
    {
      name: key,
      selector: { number: { mode: "box", min: 0, step: 1, unit_of_measurement: "px" } },
    },
  ];
}

export const radiusLabelMap: Record<string, TranslationKey> = {
  radius: "editor_radius",
  radius_preset: "editor_radius_preset",
  use_corners: "editor_use_corners",
  top_left: "editor_corner_top_left",
  top_right: "editor_corner_top_right",
  bottom_right: "editor_corner_bottom_right",
  bottom_left: "editor_corner_bottom_left",
};
