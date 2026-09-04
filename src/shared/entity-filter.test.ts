import { describe, it, expect } from "vitest";
import {
  buildEntityFilterPredicate,
  buildStatePredicate,
  hasStateFilter,
  mergeEntityFilters,
  type EntityFilterConfig,
} from "./entity-filter";
import type { HomeAssistant, HassEntity } from "../types";

function entity(state: string): HassEntity {
  return { entity_id: "light.x", state, attributes: {}, last_changed: "", last_updated: "" };
}

function hassWith(states: Record<string, string>): HomeAssistant {
  const s: Record<string, HassEntity> = {};
  for (const [id, state] of Object.entries(states)) s[id] = entity(state);
  return { states: s } as HomeAssistant;
}

describe("buildEntityFilterPredicate", () => {
  it("passes everything when no filter is set", () => {
    const predicate = buildEntityFilterPredicate(undefined);
    expect(predicate({ entityId: "light.a", areaId: "kitchen", labels: [] })).toBe(true);
  });

  it("include_area narrows to matching areas, entities without an area fail", () => {
    const predicate = buildEntityFilterPredicate({ include_area: ["kitchen"] });
    expect(predicate({ entityId: "light.a", areaId: "kitchen", labels: [] })).toBe(true);
    expect(predicate({ entityId: "light.a", areaId: "bedroom", labels: [] })).toBe(false);
    expect(predicate({ entityId: "light.a", areaId: undefined, labels: [] })).toBe(false);
  });

  it("exclude_area always wins even if include_area matches", () => {
    const predicate = buildEntityFilterPredicate({ include_area: ["kitchen"], exclude_area: ["kitchen"] });
    expect(predicate({ entityId: "light.a", areaId: "kitchen", labels: [] })).toBe(false);
  });

  it("exclude_entities wins regardless of area", () => {
    const predicate = buildEntityFilterPredicate({ exclude_entities: ["light.a"] });
    expect(predicate({ entityId: "light.a", areaId: "kitchen", labels: [] })).toBe(false);
  });

  it("include_entities narrows to the explicit list", () => {
    const predicate = buildEntityFilterPredicate({ include_entities: ["light.a"] });
    expect(predicate({ entityId: "light.a", areaId: undefined, labels: [] })).toBe(true);
    expect(predicate({ entityId: "light.b", areaId: undefined, labels: [] })).toBe(false);
  });

  it("labels: include requires at least one match, exclude blocks any match", () => {
    const includePredicate = buildEntityFilterPredicate({ include_labels: ["important"] });
    expect(includePredicate({ entityId: "light.a", labels: ["important"] })).toBe(true);
    expect(includePredicate({ entityId: "light.a", labels: ["other"] })).toBe(false);

    const excludePredicate = buildEntityFilterPredicate({ exclude_labels: ["hidden"] });
    expect(excludePredicate({ entityId: "light.a", labels: ["hidden", "other"] })).toBe(false);
    expect(excludePredicate({ entityId: "light.a", labels: ["other"] })).toBe(true);
  });
});

describe("buildStatePredicate", () => {
  it("passes everything when no state filter is set", () => {
    const hass = hassWith({ "light.a": "on" });
    expect(buildStatePredicate(hass, undefined)("light.a")).toBe(true);
  });

  it("include_state narrows to matching states, missing entity fails", () => {
    const hass = hassWith({ "light.a": "on", "light.b": "off" });
    const predicate = buildStatePredicate(hass, { include_state: ["on"] });
    expect(predicate("light.a")).toBe(true);
    expect(predicate("light.b")).toBe(false);
    expect(predicate("light.missing")).toBe(false);
  });

  it("exclude_state blocks matching states", () => {
    const hass = hassWith({ "light.a": "unavailable" });
    const predicate = buildStatePredicate(hass, { exclude_state: ["unavailable"] });
    expect(predicate("light.a")).toBe(false);
  });
});

describe("hasStateFilter", () => {
  it("is false for an empty/undefined filter and true once either side is set", () => {
    expect(hasStateFilter(undefined)).toBe(false);
    expect(hasStateFilter({})).toBe(false);
    expect(hasStateFilter({ include_state: ["on"] })).toBe(true);
    expect(hasStateFilter({ exclude_state: ["unavailable"] })).toBe(true);
  });
});

describe("mergeEntityFilters", () => {
  const base: EntityFilterConfig = {
    include_area: ["kitchen"],
    exclude_entities: ["light.base_excluded"],
  };

  it("with inherit=false, the override fully replaces the base", () => {
    const override: EntityFilterConfig = { include_area: ["bedroom"] };
    expect(mergeEntityFilters(base, override, false)).toEqual(override);
  });

  it("include_* from the override replaces the base's when non-empty", () => {
    const merged = mergeEntityFilters(base, { include_area: ["bedroom"] });
    expect(merged.include_area).toEqual(["bedroom"]);
  });

  it("include_* falls back to the base when the override leaves it empty", () => {
    const merged = mergeEntityFilters(base, {});
    expect(merged.include_area).toEqual(["kitchen"]);
  });

  it("exclude_* unions base and override rather than replacing", () => {
    const merged = mergeEntityFilters(base, { exclude_entities: ["light.override_excluded"] });
    expect(merged.exclude_entities).toEqual(
      expect.arrayContaining(["light.base_excluded", "light.override_excluded"]),
    );
    expect(merged.exclude_entities).toHaveLength(2);
  });
});
