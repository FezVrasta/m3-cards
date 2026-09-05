import { describe, it, expect } from "vitest";
import { findStateRule, matchesStateRule, numericState } from "./state-rules";
import type { StatusRule } from "../types";

describe("matchesStateRule", () => {
  it("matches value case-insensitively", () => {
    expect(matchesStateRule({ value: "RUN" }, "run", undefined)).toBe(true);
    expect(matchesStateRule({ value: "run" }, "pause", undefined)).toBe(false);
  });

  it("matches a regex against the raw state", () => {
    expect(matchesStateRule({ regex: "finish|end" }, "finished", undefined)).toBe(true);
    expect(matchesStateRule({ regex: "finish|end" }, "running", undefined)).toBe(false);
  });

  it("ignores an invalid regex instead of throwing", () => {
    expect(matchesStateRule({ regex: "([" }, "anything", undefined)).toBe(false);
  });

  it("compares above/below strictly, and only for numeric states", () => {
    expect(matchesStateRule({ above: 50 }, "60", 60)).toBe(true);
    expect(matchesStateRule({ above: 50 }, "50", 50)).toBe(false);
    expect(matchesStateRule({ below: 50 }, "49", 49)).toBe(true);
    expect(matchesStateRule({ below: 50 }, "run", undefined)).toBe(false);
  });

  it("treats a rule with no condition as the catch-all", () => {
    expect(matchesStateRule({ label: "Ready" }, "whatever", undefined)).toBe(true);
  });
});

describe("findStateRule", () => {
  const rules: StatusRule[] = [
    { value: "run", label: "Washing" },
    { regex: "finish|end", label: "Done" },
    { label: "Ready" },
  ];

  it("returns the first match, not the best one", () => {
    expect(findStateRule(rules, "run", undefined)?.label).toBe("Washing");
    expect(findStateRule(rules, "finished", undefined)?.label).toBe("Done");
  });

  it("falls through to the catch-all", () => {
    expect(findStateRule(rules, "idle", undefined)?.label).toBe("Ready");
  });

  it("returns undefined when there are no rules at all", () => {
    expect(findStateRule(undefined, "run", undefined)).toBeUndefined();
    expect(findStateRule([], "run", undefined)).toBeUndefined();
  });

  it("stops at a catch-all placed first, which is the config's own mistake", () => {
    expect(findStateRule([{ label: "Ready" }, { value: "run", label: "Washing" }], "run", undefined)?.label).toBe(
      "Ready",
    );
  });
});

describe("numericState", () => {
  it("reads plain numbers, including a comma decimal", () => {
    expect(numericState("42")).toBe(42);
    expect(numericState("-3.5")).toBe(-3.5);
    expect(numericState("21,5")).toBe(21.5);
    expect(numericState(" 7 ")).toBe(7);
  });

  it("refuses anything that is not only a number", () => {
    expect(numericState("3 running")).toBeUndefined();
    expect(numericState("run")).toBeUndefined();
    expect(numericState("")).toBeUndefined();
    expect(numericState("unavailable")).toBeUndefined();
  });
});
