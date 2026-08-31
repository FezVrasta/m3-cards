import { describe, it, expect, vi } from "vitest";
import { runHaAction, type RunActionContext } from "./actions";
import type { HomeAssistant } from "../types";

function fakeHass(): { hass: HomeAssistant; callService: ReturnType<typeof vi.fn> } {
  const callService = vi.fn().mockResolvedValue(undefined);
  return { hass: { callService } as unknown as HomeAssistant, callService };
}

function fakeCtx(overrides: Partial<RunActionContext> = {}): RunActionContext {
  return {
    entityId: "light.a",
    fireMoreInfo: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  };
}

describe("runHaAction", () => {
  it("defaults to more-info when no action is configured", () => {
    const { hass } = fakeHass();
    const ctx = fakeCtx();
    runHaAction(hass, undefined, ctx);
    expect(ctx.fireMoreInfo).toHaveBeenCalledWith("light.a");
  });

  it("none does nothing", () => {
    const { hass, callService } = fakeHass();
    const ctx = fakeCtx();
    runHaAction(hass, { action: "none" }, ctx);
    expect(callService).not.toHaveBeenCalled();
    expect(ctx.fireMoreInfo).not.toHaveBeenCalled();
  });

  it("toggle calls homeassistant.toggle on entityId by default", () => {
    const { hass, callService } = fakeHass();
    runHaAction(hass, { action: "toggle" }, fakeCtx());
    expect(callService).toHaveBeenCalledWith("homeassistant", "toggle", { entity_id: "light.a" });
  });

  it("toggle prefers ctx.toggle() when provided, and skips the service call", () => {
    const { hass, callService } = fakeHass();
    const toggle = vi.fn();
    runHaAction(hass, { action: "toggle" }, fakeCtx({ toggle }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(callService).not.toHaveBeenCalled();
  });

  it("popup calls ctx.openPopup when provided, and no-ops otherwise", () => {
    const { hass } = fakeHass();
    const openPopup = vi.fn();
    runHaAction(hass, { action: "popup" }, fakeCtx({ openPopup }));
    expect(openPopup).toHaveBeenCalledOnce();
    expect(() => runHaAction(hass, { action: "popup" }, fakeCtx())).not.toThrow();
  });

  it("perform-action calls the split domain.service with target/data merged", () => {
    const { hass, callService } = fakeHass();
    runHaAction(
      hass,
      { action: "perform-action", perform_action: "light.turn_on", data: { brightness: 128 } },
      fakeCtx(),
    );
    expect(callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.a",
      brightness: 128,
    });
  });

  it("navigate calls ctx.navigate with the configured path", () => {
    const { hass } = fakeHass();
    const ctx = fakeCtx();
    runHaAction(hass, { action: "navigate", navigation_path: "/lovelace/0" }, ctx);
    expect(ctx.navigate).toHaveBeenCalledWith("/lovelace/0");
  });
});
