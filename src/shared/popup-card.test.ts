import { describe, it, expect, vi } from "vitest";
import { shouldCloseOnBackdropClick, syncPopupCardElement, syncDialogOpenState } from "./popup-card";

describe("shouldCloseOnBackdropClick", () => {
  it("closes on a backdrop click once the guard window has passed", () => {
    const target = {};
    const event = { target, currentTarget: target } as unknown as Event;
    expect(shouldCloseOnBackdropClick(event, 1000, 1300)).toBe(true);
  });

  it("does not close within the guard window (the opening click bubbling)", () => {
    const target = {};
    const event = { target, currentTarget: target } as unknown as Event;
    expect(shouldCloseOnBackdropClick(event, 1000, 1100)).toBe(false);
  });

  it("does not close when the click landed on content, not the backdrop", () => {
    const event = { target: {}, currentTarget: {} } as unknown as Event;
    expect(shouldCloseOnBackdropClick(event, 1000, 2000)).toBe(false);
  });
});

describe("syncPopupCardElement", () => {
  it("returns undefined el/key when there is no config (popup closed)", () => {
    const result = syncPopupCardElement({
      tagName: "m3-lights-overview-card",
      config: undefined,
      hass: {},
      existingEl: undefined,
      existingKey: undefined,
    });
    expect(result).toEqual({ el: undefined, key: undefined });
  });

  it("reuses the existing element and refreshes hass when the config key is unchanged", () => {
    const existingEl = { hass: undefined } as unknown as HTMLElement & { hass?: unknown };
    const hass = { fake: true };
    const config = { type: "custom:m3-lights-overview-card", include_area: ["kitchen"] };
    const result = syncPopupCardElement({
      tagName: "m3-lights-overview-card",
      config,
      hass,
      existingEl,
      existingKey: JSON.stringify(config),
    });
    expect(result.el).toBe(existingEl);
    expect(existingEl.hass).toBe(hass);
  });
});

describe("syncDialogOpenState", () => {
  it("calls showModal() only when it should be open and isn't yet", () => {
    const dialog = { open: false, showModal: vi.fn(), close: vi.fn() } as unknown as HTMLDialogElement;
    syncDialogOpenState(dialog, true);
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it("calls close() only when it should be closed and is currently open", () => {
    const dialog = { open: true, showModal: vi.fn(), close: vi.fn() } as unknown as HTMLDialogElement;
    syncDialogOpenState(dialog, false);
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(dialog.showModal).not.toHaveBeenCalled();
  });

  it("is a no-op when already in the desired state, or the dialog is missing", () => {
    const dialog = { open: true, showModal: vi.fn(), close: vi.fn() } as unknown as HTMLDialogElement;
    syncDialogOpenState(dialog, true);
    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(() => syncDialogOpenState(undefined, true)).not.toThrow();
  });
});
