import { describe, it, expect } from "vitest";
import {
  defaultEntityAction,
  isMissingState,
  isNumberDomain,
  isOnState,
  isSelectDomain,
  selectOptionDomain,
  setValueDomain,
} from "./entity-actions";

describe("defaultEntityAction", () => {
  it("presses a button", () => {
    expect(defaultEntityAction("button")).toEqual({
      action: "call-service",
      service: "button.press",
    });
    expect(defaultEntityAction("input_button")).toEqual({
      action: "call-service",
      service: "input_button.press",
    });
  });

  it("starts a script, a scene and an automation with their own service", () => {
    expect(defaultEntityAction("script").service).toBe("script.turn_on");
    expect(defaultEntityAction("scene").service).toBe("scene.turn_on");
    expect(defaultEntityAction("automation").service).toBe("automation.trigger");
  });

  it("toggles the switchable domains", () => {
    for (const domain of ["light", "switch", "fan", "input_boolean", "lock", "cover", "siren"]) {
      expect(defaultEntityAction(domain)).toEqual({ action: "toggle" });
    }
  });

  it("opens more-info for anything else", () => {
    expect(defaultEntityAction("sensor")).toEqual({ action: "more-info" });
    expect(defaultEntityAction("")).toEqual({ action: "more-info" });
  });
});

describe("service domains", () => {
  it("recognises the select and number pairs", () => {
    expect(isSelectDomain("select")).toBe(true);
    expect(isSelectDomain("input_select")).toBe(true);
    expect(isSelectDomain("sensor")).toBe(false);
    expect(isNumberDomain("number")).toBe(true);
    expect(isNumberDomain("input_number")).toBe(true);
    expect(isNumberDomain("select")).toBe(false);
  });

  it("keeps a helper on its own domain and sends anything else to the real one", () => {
    expect(selectOptionDomain("input_select")).toBe("input_select");
    expect(selectOptionDomain("sensor")).toBe("select");
    expect(setValueDomain("input_number")).toBe("input_number");
    expect(setValueDomain("sensor")).toBe("number");
  });
});

describe("state predicates", () => {
  it("treats the unreachable states as missing", () => {
    expect(isMissingState(undefined)).toBe(true);
    expect(isMissingState("unavailable")).toBe(true);
    expect(isMissingState("unknown")).toBe(true);
    expect(isMissingState("")).toBe(true);
    expect(isMissingState("off")).toBe(false);
  });

  it("calls a state on unless it is one of the words that mean off", () => {
    expect(isOnState("on")).toBe(true);
    expect(isOnState("cotton_eco")).toBe(true);
    expect(isOnState("off")).toBe(false);
    expect(isOnState("closed")).toBe(false);
    expect(isOnState("idle")).toBe(false);
    expect(isOnState("unavailable")).toBe(false);
  });
});
