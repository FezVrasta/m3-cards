import { describe, it, expect, vi, beforeEach } from "vitest";
import { DetailCardController } from "./detail-card";
import type { PopupCardHandle } from "./popup-card";

type FakeCard = HTMLElement & PopupCardHandle;

function fakeCard(): FakeCard {
  return { setConfig: vi.fn(), hass: undefined } as unknown as FakeCard;
}

describe("DetailCardController", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports undefined and builds nothing when no skeleton is configured", () => {
    const createCardElement = vi.fn();
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();

    new DetailCardController().sync({ skeleton: undefined, tokens: {}, hass: {}, onChange });

    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(createCardElement).not.toHaveBeenCalled();
  });

  it("reports undefined instead of throwing when loadCardHelpers is unavailable", () => {
    vi.stubGlobal("window", {});
    const onChange = vi.fn();

    expect(() =>
      new DetailCardController().sync({
        skeleton: { type: "thermostat" },
        tokens: {},
        hass: {},
        onChange,
      }),
    ).not.toThrow();
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("builds the card via createCardElement with the resolved config, and pushes hass onto it", async () => {
    const card = fakeCard();
    const createCardElement = vi.fn(async () => card);
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();
    const hass = { fake: true };

    new DetailCardController().sync({
      skeleton: { type: "thermostat", entity: "[[entity_id]]" },
      tokens: { entity_id: "climate.kitchen" },
      hass,
      onChange,
    });

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(card));
    expect(createCardElement).toHaveBeenCalledWith({ type: "thermostat", entity: "climate.kitchen" });
    expect(card.hass).toBe(hass);
  });

  it("reuses the existing element via setConfig() when the resolved type is unchanged", async () => {
    const card = fakeCard();
    const createCardElement = vi.fn(async () => card);
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();
    const controller = new DetailCardController();

    controller.sync({ skeleton: { type: "thermostat", entity: "a" }, tokens: {}, hass: {}, onChange });
    await vi.waitFor(() => expect(createCardElement).toHaveBeenCalledTimes(1));

    controller.sync({ skeleton: { type: "thermostat", entity: "b" }, tokens: {}, hass: {}, onChange });

    expect(createCardElement).toHaveBeenCalledTimes(1);
    expect(card.setConfig).toHaveBeenCalledWith({ type: "thermostat", entity: "b" });
  });

  it("rebuilds via createCardElement when the resolved type changes", async () => {
    const cardA = fakeCard();
    const cardB = fakeCard();
    const createCardElement = vi.fn().mockResolvedValueOnce(cardA).mockResolvedValueOnce(cardB);
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();
    const controller = new DetailCardController();

    controller.sync({ skeleton: { type: "thermostat" }, tokens: {}, hass: {}, onChange });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(cardA));

    controller.sync({ skeleton: { type: "tile" }, tokens: {}, hass: {}, onChange });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(cardB));

    expect(createCardElement).toHaveBeenCalledTimes(2);
  });

  it("reset() drops the cached element so the next sync() rebuilds", async () => {
    const cardA = fakeCard();
    const cardB = fakeCard();
    const createCardElement = vi.fn().mockResolvedValueOnce(cardA).mockResolvedValueOnce(cardB);
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();
    const controller = new DetailCardController();

    controller.sync({ skeleton: { type: "thermostat" }, tokens: {}, hass: {}, onChange });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(cardA));

    controller.reset();
    controller.sync({ skeleton: { type: "thermostat" }, tokens: {}, hass: {}, onChange });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(cardB));

    expect(createCardElement).toHaveBeenCalledTimes(2);
  });
});
