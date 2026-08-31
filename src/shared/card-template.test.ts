import { describe, it, expect } from "vitest";
import { resolveCardTemplate } from "./card-template";

describe("resolveCardTemplate", () => {
  it("replaces an exact-token string with the raw resolved value", () => {
    const result = resolveCardTemplate(
      { include_area: ["[[area_id]]"] },
      { area_id: "kitchen" },
    );
    expect(result).toEqual({ include_area: ["kitchen"] });
  });

  it("interpolates a token embedded in surrounding text", () => {
    const result = resolveCardTemplate({ title: "Details: [[name]]" }, { name: "Kitchen" });
    expect(result).toEqual({ title: "Details: Kitchen" });
  });

  it("resolves multiple tokens in nested objects and arrays", () => {
    const result = resolveCardTemplate(
      {
        type: "custom:m3-lights-overview-card",
        include_area: ["[[area_id]]"],
        rooms: [{ name: "[[name]]", entities: ["[[entity_id]]"] }],
      },
      { area_id: "kitchen", name: "Kitchen", entity_id: "climate.kitchen" },
    );
    expect(result).toEqual({
      type: "custom:m3-lights-overview-card",
      include_area: ["kitchen"],
      rooms: [{ name: "Kitchen", entities: ["climate.kitchen"] }],
    });
  });

  it("resolves an unresolvable token to an empty string instead of crashing", () => {
    const result = resolveCardTemplate({ entity: "[[device_id]]" }, { area_id: "kitchen" });
    expect(result).toEqual({ entity: "" });
  });

  it("leaves non-string values untouched", () => {
    const result = resolveCardTemplate(
      { type: "thermostat", show_current_as_primary: true, count: 3, extra: null },
      {},
    );
    expect(result).toEqual({ type: "thermostat", show_current_as_primary: true, count: 3, extra: null });
  });

  it("leaves strings without any token untouched", () => {
    const result = resolveCardTemplate({ type: "thermostat" }, { area_id: "kitchen" });
    expect(result).toEqual({ type: "thermostat" });
  });
});
