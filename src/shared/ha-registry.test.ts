import { describe, it, expect } from "vitest";
import { discoverLightRooms } from "./ha-registry";
import type { HomeAssistant, HassEntity } from "../types";

interface RegistryFixture {
  states: Record<string, { state: string; attributes?: Record<string, unknown> }>;
  entities: { entity_id: string; area_id?: string; device_id?: string; labels?: string[] }[];
  devices?: { id: string; area_id?: string; labels?: string[] }[];
  areas?: { area_id: string; name: string; icon?: string }[];
}

function hassFromFixture(fixture: RegistryFixture): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  for (const [id, s] of Object.entries(fixture.states)) {
    states[id] = { entity_id: id, state: s.state, attributes: s.attributes ?? {}, last_changed: "", last_updated: "" };
  }
  return {
    states,
    callWS: async <T,>(msg: Record<string, unknown>): Promise<T> => {
      switch (msg.type) {
        case "config/entity_registry/list":
          return fixture.entities as unknown as T;
        case "config/device_registry/list":
          return (fixture.devices ?? []) as unknown as T;
        case "config/area_registry/list":
          return (fixture.areas ?? []) as unknown as T;
        default:
          throw new Error(`unexpected callWS type: ${String(msg.type)}`);
      }
    },
  } as unknown as HomeAssistant;
}

describe("discoverLightRooms", () => {
  it("groups lights by area and names/icons the room from the area registry", async () => {
    const hass = hassFromFixture({
      states: { "light.kitchen_1": { state: "on" }, "light.kitchen_2": { state: "off" } },
      entities: [
        { entity_id: "light.kitchen_1", area_id: "kitchen" },
        { entity_id: "light.kitchen_2", area_id: "kitchen" },
      ],
      areas: [{ area_id: "kitchen", name: "Küche", icon: "mdi:silverware-fork-knife" }],
    });

    const rooms = await discoverLightRooms(hass, {});
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({
      areaId: "kitchen",
      name: "Küche",
      icon: "mdi:silverware-fork-knife",
      entities: ["light.kitchen_1", "light.kitchen_2"],
      toggleEntities: ["light.kitchen_1", "light.kitchen_2"],
    });
  });

  it("drops lights that resolve to no area at all", async () => {
    const hass = hassFromFixture({
      states: { "light.orphan": { state: "on" } },
      entities: [{ entity_id: "light.orphan" }],
    });
    expect(await discoverLightRooms(hass, {})).toEqual([]);
  });

  it("applies a separate toggle filter independent of the display filter", async () => {
    const hass = hassFromFixture({
      states: { "light.a": { state: "on" }, "light.b": { state: "on" } },
      entities: [
        { entity_id: "light.a", area_id: "kitchen" },
        { entity_id: "light.b", area_id: "kitchen" },
      ],
      areas: [{ area_id: "kitchen", name: "Kitchen" }],
    });

    const rooms = await discoverLightRooms(hass, {
      toggleFilter: { exclude_entities: ["light.b"] },
    });
    expect(rooms[0].entities).toEqual(["light.a", "light.b"]);
    expect(rooms[0].toggleEntities).toEqual(["light.a"]);
  });

  it("prefer_groups keeps the group and drops its members", async () => {
    const hass = hassFromFixture({
      states: {
        "light.group": { state: "on", attributes: { entity_id: ["light.member_1", "light.member_2"] } },
        "light.member_1": { state: "on" },
        "light.member_2": { state: "off" },
      },
      entities: [
        { entity_id: "light.group", area_id: "living_room" },
        { entity_id: "light.member_1", area_id: "living_room" },
        { entity_id: "light.member_2", area_id: "living_room" },
      ],
      areas: [{ area_id: "living_room", name: "Living Room" }],
    });

    const rooms = await discoverLightRooms(hass, { groupHandling: "prefer_groups" });
    expect(rooms[0].entities).toEqual(["light.group"]);
  });

  it("prefer_members keeps the members and drops the group", async () => {
    const hass = hassFromFixture({
      states: {
        "light.group": { state: "on", attributes: { entity_id: ["light.member_1"] } },
        "light.member_1": { state: "on" },
      },
      entities: [
        { entity_id: "light.group", area_id: "living_room" },
        { entity_id: "light.member_1", area_id: "living_room" },
      ],
      areas: [{ area_id: "living_room", name: "Living Room" }],
    });

    const rooms = await discoverLightRooms(hass, { groupHandling: "prefer_members" });
    expect(rooms[0].entities).toEqual(["light.member_1"]);
  });

  it("resolves area via the device when the entity itself has none", async () => {
    const hass = hassFromFixture({
      states: { "light.a": { state: "on" } },
      entities: [{ entity_id: "light.a", device_id: "dev1" }],
      devices: [{ id: "dev1", area_id: "kitchen" }],
      areas: [{ area_id: "kitchen", name: "Kitchen" }],
    });
    const rooms = await discoverLightRooms(hass, {});
    expect(rooms[0].areaId).toBe("kitchen");
  });

  it("include_area/exclude_entities narrow the display filter", async () => {
    const hass = hassFromFixture({
      states: { "light.a": { state: "on" }, "light.b": { state: "on" } },
      entities: [
        { entity_id: "light.a", area_id: "kitchen" },
        { entity_id: "light.b", area_id: "bedroom" },
      ],
      areas: [
        { area_id: "kitchen", name: "Kitchen" },
        { area_id: "bedroom", name: "Bedroom" },
      ],
    });
    const rooms = await discoverLightRooms(hass, { filter: { include_area: ["kitchen"] } });
    expect(rooms.map((r) => r.areaId)).toEqual(["kitchen"]);
  });
});
