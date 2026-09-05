import { describe, it, expect } from "vitest";
import {
  prettifyOption,
  remainingMinutes,
  resolveSliderRange,
  snapToRange,
  splitDuration,
  visibleOptions,
} from "./appliance";

describe("resolveSliderRange", () => {
  it("reads the entity's own min/max/step", () => {
    expect(resolveSliderRange({ min: 50, max: 250, step: 5 })).toEqual({
      min: 50,
      max: 250,
      step: 5,
    });
  });

  it("lets the config override each field on its own", () => {
    expect(resolveSliderRange({ min: 0, max: 100, step: 1 }, { max: 60 })).toEqual({
      min: 0,
      max: 60,
      step: 1,
    });
  });

  it("falls back when the entity reports nothing", () => {
    expect(resolveSliderRange(undefined)).toEqual({ min: 0, max: 100, step: 1 });
    expect(resolveSliderRange({})).toEqual({ min: 0, max: 100, step: 1 });
  });

  it("falls back on a degenerate range rather than drawing an unusable slider", () => {
    expect(resolveSliderRange({ min: 100, max: 20, step: 2 })).toEqual({
      min: 0,
      max: 100,
      step: 2,
    });
  });

  it("ignores a zero or negative step", () => {
    expect(resolveSliderRange({ min: 0, max: 10, step: 0 }).step).toBe(1);
  });
});

describe("snapToRange", () => {
  const range = { min: 50, max: 250, step: 5 };

  it("snaps onto the grid and clamps to the ends", () => {
    expect(snapToRange(123, range)).toBe(125);
    expect(snapToRange(10, range)).toBe(50);
    expect(snapToRange(999, range)).toBe(250);
  });

  it("keeps a fractional step clean", () => {
    expect(snapToRange(21.3, { min: 16, max: 30, step: 0.5 })).toBe(21.5);
  });

  it("respects a min that is not a multiple of the step", () => {
    expect(snapToRange(4, { min: 1, max: 10, step: 2 })).toBe(5);
  });
});

describe("remainingMinutes", () => {
  const now = Date.parse("2026-09-05T10:00:00Z");

  it("reads whole minutes", () => {
    expect(remainingMinutes("84", { unit_of_measurement: "min" }, now)).toBe(84);
    expect(remainingMinutes("84", undefined, now)).toBe(84);
  });

  it("converts seconds and hours", () => {
    expect(remainingMinutes("5040", { unit_of_measurement: "s" }, now)).toBe(84);
    expect(remainingMinutes("1.5", { unit_of_measurement: "h" }, now)).toBe(90);
  });

  it("reads a clock-style duration, two fields meaning h:mm", () => {
    expect(remainingMinutes("1:24:00", undefined, now)).toBe(84);
    expect(remainingMinutes("01:24", undefined, now)).toBe(84);
    expect(remainingMinutes("0:00:30", undefined, now)).toBe(0.5);
  });

  it("reads an absolute completion timestamp against the given clock", () => {
    expect(remainingMinutes("2026-09-05T11:24:00Z", { device_class: "timestamp" }, now)).toBe(84);
    // Undeclared device_class, which is what a template sensor usually has.
    expect(remainingMinutes("2026-09-05T11:24:00Z", undefined, now)).toBe(84);
  });

  it("never goes negative for a time that has already passed", () => {
    expect(remainingMinutes("2026-09-05T09:00:00Z", undefined, now)).toBe(0);
    expect(remainingMinutes("-5", undefined, now)).toBe(0);
  });

  it("gives up on anything it cannot read", () => {
    expect(remainingMinutes(undefined, undefined, now)).toBeUndefined();
    expect(remainingMinutes("", undefined, now)).toBeUndefined();
    expect(remainingMinutes("unavailable", undefined, now)).toBeUndefined();
    expect(remainingMinutes("soon", undefined, now)).toBeUndefined();
  });
});

describe("splitDuration", () => {
  it("splits into whole hours and minutes", () => {
    expect(splitDuration(84)).toEqual({ hours: 1, minutes: 24 });
    expect(splitDuration(24)).toEqual({ hours: 0, minutes: 24 });
    expect(splitDuration(120)).toEqual({ hours: 2, minutes: 0 });
  });

  it("rounds rather than truncating, and never goes negative", () => {
    expect(splitDuration(59.6)).toEqual({ hours: 1, minutes: 0 });
    expect(splitDuration(-3)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe("prettifyOption", () => {
  it("turns an integration's option string into a label", () => {
    expect(prettifyOption("heavy_duty")).toBe("Heavy duty");
    expect(prettifyOption("Mixed-Load")).toBe("Mixed Load");
    expect(prettifyOption("  spin  1400 ")).toBe("Spin 1400");
    expect(prettifyOption("")).toBe("");
  });
});

describe("visibleOptions", () => {
  it("passes the entity's own options through when nothing is restricted", () => {
    expect(visibleOptions(["a", "b"], undefined)).toEqual(["a", "b"]);
    expect(visibleOptions(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("narrows and reorders to the allow-list", () => {
    expect(visibleOptions(["a", "b", "c"], ["c", "a"])).toEqual(["c", "a"]);
  });

  it("drops an allow-listed option the entity does not offer", () => {
    expect(visibleOptions(["a"], ["a", "z"])).toEqual(["a"]);
  });

  it("copes with an entity that has no options attribute at all", () => {
    expect(visibleOptions(undefined, ["a"])).toEqual([]);
    expect(visibleOptions("not a list", undefined)).toEqual([]);
  });
});
