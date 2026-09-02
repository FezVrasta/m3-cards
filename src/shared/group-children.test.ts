import { describe, it, expect, vi, beforeEach } from "vitest";
import { GroupChildrenController } from "./group-children";
import type { PopupCardHandle } from "./popup-card";

type FakeCard = HTMLElement & PopupCardHandle;

function fakeCard(): FakeCard {
  return { setConfig: vi.fn(), hass: undefined } as unknown as FakeCard;
}

describe("GroupChildrenController", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports an empty array and builds nothing for an empty cards list", () => {
    const createCardElement = vi.fn();
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();

    new GroupChildrenController().sync({ cards: [], hass: {}, onChange });

    expect(onChange).toHaveBeenCalledWith([]);
    expect(createCardElement).not.toHaveBeenCalled();
  });

  it("reports an empty array instead of throwing when loadCardHelpers is unavailable", () => {
    vi.stubGlobal("window", {});
    const onChange = vi.fn();

    expect(() =>
      new GroupChildrenController().sync({ cards: [{ type: "thermostat" }], hass: {}, onChange }),
    ).not.toThrow();
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("builds one element per card, in order, and pushes hass onto each", async () => {
    const cardA = fakeCard();
    const cardB = fakeCard();
    const createCardElement = vi.fn().mockResolvedValueOnce(cardA).mockResolvedValueOnce(cardB);
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();
    const hass = { fake: true };

    new GroupChildrenController().sync({
      cards: [{ type: "thermostat" }, { type: "tile" }],
      hass,
      onChange,
    });

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith([cardA, cardB]));
    expect(cardA.hass).toBe(hass);
    expect(cardB.hass).toBe(hass);
  });

  it("reuses an existing element via setConfig() when its index keeps the same type", async () => {
    const card = fakeCard();
    const createCardElement = vi.fn(async () => card);
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();
    const controller = new GroupChildrenController();

    controller.sync({ cards: [{ type: "thermostat", entity: "a" }], hass: {}, onChange });
    await vi.waitFor(() => expect(createCardElement).toHaveBeenCalledTimes(1));

    controller.sync({ cards: [{ type: "thermostat", entity: "b" }], hass: {}, onChange });

    expect(createCardElement).toHaveBeenCalledTimes(1);
    expect(card.setConfig).toHaveBeenCalledWith({ type: "thermostat", entity: "b" });
  });

  it("rebuilds via createCardElement when an index's type changes", async () => {
    const cardA = fakeCard();
    const cardB = fakeCard();
    const createCardElement = vi.fn().mockResolvedValueOnce(cardA).mockResolvedValueOnce(cardB);
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();
    const controller = new GroupChildrenController();

    controller.sync({ cards: [{ type: "thermostat" }], hass: {}, onChange });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith([cardA]));

    controller.sync({ cards: [{ type: "tile" }], hass: {}, onChange });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith([cardB]));

    expect(createCardElement).toHaveBeenCalledTimes(2);
  });

  it("drops trailing elements when the cards list shrinks", async () => {
    const cardA = fakeCard();
    const cardB = fakeCard();
    const createCardElement = vi.fn().mockResolvedValueOnce(cardA).mockResolvedValueOnce(cardB);
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();
    const controller = new GroupChildrenController();

    controller.sync({ cards: [{ type: "thermostat" }, { type: "tile" }], hass: {}, onChange });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith([cardA, cardB]));

    controller.sync({ cards: [{ type: "thermostat" }], hass: {}, onChange });

    expect(onChange).toHaveBeenLastCalledWith([cardA]);
  });

  it("does not call onChange again when a sync() finds nothing changed (regression: this previously caused an infinite render loop on the host's @state field)", async () => {
    const cardA = fakeCard();
    const createCardElement = vi.fn(async () => cardA);
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();
    const controller = new GroupChildrenController();

    controller.sync({ cards: [{ type: "thermostat" }], hass: {}, onChange });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith([cardA]));

    onChange.mockClear();
    controller.sync({ cards: [{ type: "thermostat" }], hass: {}, onChange });
    controller.sync({ cards: [{ type: "thermostat" }], hass: {}, onChange });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange again on repeated sync() calls when loadCardHelpers stays unavailable", () => {
    vi.stubGlobal("window", {});
    const onChange = vi.fn();
    const controller = new GroupChildrenController();

    controller.sync({ cards: [{ type: "thermostat" }], hass: {}, onChange });
    expect(onChange).toHaveBeenCalledTimes(1);

    controller.sync({ cards: [{ type: "thermostat" }], hass: {}, onChange });
    controller.sync({ cards: [], hass: {}, onChange });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("reset() drops cached elements so the next sync() rebuilds", async () => {
    const cardA = fakeCard();
    const cardB = fakeCard();
    const createCardElement = vi.fn().mockResolvedValueOnce(cardA).mockResolvedValueOnce(cardB);
    vi.stubGlobal("window", { loadCardHelpers: async () => ({ createCardElement }) });
    const onChange = vi.fn();
    const controller = new GroupChildrenController();

    controller.sync({ cards: [{ type: "thermostat" }], hass: {}, onChange });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith([cardA]));

    controller.reset();
    controller.sync({ cards: [{ type: "thermostat" }], hass: {}, onChange });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith([cardB]));

    expect(createCardElement).toHaveBeenCalledTimes(2);
  });
});
