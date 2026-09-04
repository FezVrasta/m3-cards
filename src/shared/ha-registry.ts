import type { HomeAssistant } from "../types";

interface EntityRegistryEntry {
  entity_id: string;
  area_id?: string | null;
  device_id?: string | null;
  labels?: string[];
}

interface DeviceRegistryEntry {
  id: string;
  area_id?: string | null;
  name?: string | null;
  name_by_user?: string | null;
}

interface AreaRegistryEntry {
  area_id: string;
  name: string;
  icon?: string | null;
}

interface RegistrySnapshot {
  entityEntries: EntityRegistryEntry[];
  entryByEntityId: Map<string, EntityRegistryEntry>;
  deviceById: Map<string, DeviceRegistryEntry>;
  areaById: Map<string, AreaRegistryEntry>;
}

/**
 * The three registries, without asking the backend for them again.
 *
 * The frontend already holds all three on `hass` for its own use, which the
 * area functions at the bottom of this file have relied on all along. The
 * discover* functions did not: each one fired its own
 * `config/entity_registry/list` and friends, so a dashboard with six
 * discovering cards fetched the same several-thousand-entry registry six
 * times over the websocket, on every reconnect.
 *
 * Entity ids come from the record's keys rather than the entries, because the
 * frontend's display registry is a lighter shape than the full one and only
 * the keys are guaranteed.
 *
 * The websocket path stays for a frontend old enough to lack the snapshots.
 * One difference is worth knowing: the snapshot omits disabled entities. That
 * is harmless here — every caller starts from `hass.states`, and a disabled
 * entity has no state.
 */
async function getRegistries(hass: HomeAssistant): Promise<RegistrySnapshot> {
  const entities = hass.entities as Record<string, Omit<EntityRegistryEntry, "entity_id">> | undefined;
  const devices = hass.devices as Record<string, DeviceRegistryEntry> | undefined;
  const areas = hass.areas as Record<string, AreaRegistryEntry> | undefined;

  if (entities && devices && areas) {
    const entityEntries = Object.entries(entities).map(([entity_id, entry]) => ({
      ...entry,
      entity_id,
    }));
    return {
      entityEntries,
      entryByEntityId: new Map(entityEntries.map((e) => [e.entity_id, e])),
      deviceById: new Map(Object.entries(devices).map(([id, d]) => [id, { ...d, id }])),
      areaById: new Map(Object.entries(areas).map(([area_id, a]) => [area_id, { ...a, area_id }])),
    };
  }

  const [entityEntries, deviceEntries, areaEntries] = await Promise.all([
    hass.callWS<EntityRegistryEntry[]>({ type: "config/entity_registry/list" }),
    hass.callWS<DeviceRegistryEntry[]>({ type: "config/device_registry/list" }),
    hass.callWS<AreaRegistryEntry[]>({ type: "config/area_registry/list" }),
  ]);
  return {
    entityEntries,
    entryByEntityId: new Map(entityEntries.map((e) => [e.entity_id, e])),
    deviceById: new Map(deviceEntries.map((d) => [d.id, d])),
    areaById: new Map(areaEntries.map((a) => [a.area_id, a])),
  };
}

export interface DiscoverPowerOptions {
  includeAreas?: string[];
  includeLabels?: string[];
  excludeEntities?: string[];
}

// Looks up the integration (domain) that owns an entity, e.g. "utility_meter"
// — used to gate editor-only actions (like calibration) to entities backed
// by that specific platform, rather than showing them for arbitrary sensors.
export async function getEntityPlatform(
  hass: HomeAssistant,
  entityId: string,
): Promise<string | undefined> {
  try {
    const entry = await hass.callWS<{ platform?: string }>({
      type: "config/entity_registry/get",
      entity_id: entityId,
    });
    return entry.platform;
  } catch {
    return undefined;
  }
}

// Auto-discovers entities by domain + device_class from hass.states,
// narrowing by area/label only when the caller actually configured those
// filters — avoids the entity/device registry round-trips otherwise.
async function discoverByDeviceClass(
  hass: HomeAssistant,
  domains: string[],
  deviceClasses: string[],
  opts: DiscoverPowerOptions,
): Promise<string[]> {
  const exclude = new Set(opts.excludeEntities ?? []);
  const domainSet = new Set(domains);
  const classSet = new Set(deviceClasses);
  const candidates = Object.values(hass.states)
    .filter((s) => {
      const domain = s.entity_id.split(".", 1)[0];
      return (
        domainSet.has(domain) &&
        classSet.has(s.attributes.device_class) &&
        !exclude.has(s.entity_id)
      );
    })
    .map((s) => s.entity_id);

  const needsArea = !!opts.includeAreas?.length;
  const needsLabel = !!opts.includeLabels?.length;
  if (!needsArea && !needsLabel) return candidates;

  const { entryByEntityId, deviceById } = await getRegistries(hass);

  const includeAreas = new Set(opts.includeAreas ?? []);
  const includeLabels = new Set(opts.includeLabels ?? []);

  return candidates.filter((entityId) => {
    const entry = entryByEntityId.get(entityId);
    if (!entry) return !needsArea && !needsLabel;

    if (needsArea) {
      const area =
        entry.area_id ?? (entry.device_id ? deviceById.get(entry.device_id)?.area_id : undefined);
      if (!area || !includeAreas.has(area)) return false;
    }
    if (needsLabel) {
      const labels = entry.labels ?? [];
      if (!labels.some((l) => includeLabels.has(l))) return false;
    }
    return true;
  });
}

export async function discoverPowerEntities(
  hass: HomeAssistant,
  opts: DiscoverPowerOptions,
): Promise<string[]> {
  return discoverByDeviceClass(hass, ["sensor"], ["power"], opts);
}

export async function discoverBatteryEntities(
  hass: HomeAssistant,
  opts: DiscoverPowerOptions,
): Promise<string[]> {
  return discoverByDeviceClass(hass, ["sensor", "binary_sensor"], ["battery"], opts);
}

// Auto-discovers every `person.*` entity — unlike the device_class-based
// helpers above, `person` has no device_class, so this filters by domain
// alone (still supports the same area/label narrowing).
export async function discoverPersonEntities(
  hass: HomeAssistant,
  opts: DiscoverPowerOptions,
): Promise<string[]> {
  const exclude = new Set(opts.excludeEntities ?? []);
  const candidates = Object.keys(hass.states).filter(
    (id) => id.startsWith("person.") && !exclude.has(id),
  );

  const needsArea = !!opts.includeAreas?.length;
  const needsLabel = !!opts.includeLabels?.length;
  if (!needsArea && !needsLabel) return candidates;

  const { entryByEntityId, deviceById } = await getRegistries(hass);
  const includeAreas = new Set(opts.includeAreas ?? []);
  const includeLabels = new Set(opts.includeLabels ?? []);

  return candidates.filter((entityId) => {
    const entry = entryByEntityId.get(entityId);
    if (!entry) return !needsArea && !needsLabel;
    if (needsArea) {
      const area =
        entry.area_id ?? (entry.device_id ? deviceById.get(entry.device_id)?.area_id : undefined);
      if (!area || !includeAreas.has(area)) return false;
    }
    if (needsLabel) {
      const labels = entry.labels ?? [];
      if (!labels.some((l) => includeLabels.has(l))) return false;
    }
    return true;
  });
}

export interface DiscoverClimateRoomsOptions {
  includeAreas?: string[];
  excludeEntities?: string[];
  nameStrip?: string[];
}

export interface DiscoveredClimateRoom {
  key: string;
  areaId?: string;
  /**
   * The device the sensors sit on, when they have one. Only interesting for a
   * room that has no area: that is the one case where the device is the sole
   * remaining handle on what else belongs to this room.
   */
  deviceId?: string;
  name: string;
  icon?: string;
  temperatureEntity: string;
  humidityEntity?: string;
}

function stripFallbackName(raw: string, patterns: string[]): string {
  let name = raw;
  for (const pattern of patterns) {
    try {
      name = name.replace(new RegExp(pattern, "i"), "");
    } catch {
      // ignore invalid user-supplied regex
    }
  }
  return name.trim() || raw;
}

interface ClimateRoomBucket {
  key: string;
  areaId?: string;
  deviceId?: string;
  temp?: string;
  humidity?: string;
  fallbackName: string;
}

// Groups temperature/humidity sensors into "rooms": entities assigned to a
// Home Assistant area are grouped by that area (using the area's registry
// name/icon); entities without an area but sharing a device (e.g. a combo
// temp+humidity sensor) are grouped by device instead, using the device's
// name; anything left over becomes a solo room named from its own
// (name_strip-cleaned) friendly name. Rooms without a temperature entity are
// dropped — humidity alone doesn't make a room.
export async function discoverClimateRooms(
  hass: HomeAssistant,
  opts: DiscoverClimateRoomsOptions,
): Promise<DiscoveredClimateRoom[]> {
  const exclude = new Set(opts.excludeEntities ?? []);
  const nameStrip = opts.nameStrip ?? [];

  const isCandidate = (entityId: string, deviceClass: string): boolean => {
    if (!entityId.startsWith("sensor.") || exclude.has(entityId)) return false;
    const st = hass.states[entityId];
    return !!st && st.attributes.device_class === deviceClass;
  };

  const tempIds = Object.keys(hass.states).filter((id) => isCandidate(id, "temperature"));
  const humidityIds = Object.keys(hass.states).filter((id) => isCandidate(id, "humidity"));
  if (tempIds.length === 0) return [];

  const { entryByEntityId, deviceById, areaById } =
    await getRegistries(hass);

  const includeAreas = opts.includeAreas?.length ? new Set(opts.includeAreas) : undefined;

  function resolve(entityId: string): { areaId?: string; deviceId?: string } {
    const entry = entryByEntityId.get(entityId);
    if (!entry) return {};
    const device = entry.device_id ? deviceById.get(entry.device_id) : undefined;
    return {
      areaId: entry.area_id ?? device?.area_id ?? undefined,
      deviceId: entry.device_id ?? undefined,
    };
  }

  const buckets = new Map<string, ClimateRoomBucket>();

  function bucketFor(entityId: string, isTemp: boolean): void {
    const { areaId, deviceId } = resolve(entityId);
    if (includeAreas && (!areaId || !includeAreas.has(areaId))) return;
    const key = areaId ? `area:${areaId}` : deviceId ? `device:${deviceId}` : `solo:${entityId}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      const friendlyName = hass.states[entityId]?.attributes.friendly_name ?? entityId;
      bucket = { key, areaId, deviceId, fallbackName: stripFallbackName(friendlyName, nameStrip) };
      buckets.set(key, bucket);
    }
    if (isTemp && !bucket.temp) bucket.temp = entityId;
    if (!isTemp && !bucket.humidity) bucket.humidity = entityId;
  }

  for (const id of tempIds) bucketFor(id, true);
  for (const id of humidityIds) bucketFor(id, false);

  const rooms: DiscoveredClimateRoom[] = [];
  for (const bucket of buckets.values()) {
    if (!bucket.temp) continue;
    const area = bucket.areaId ? areaById.get(bucket.areaId) : undefined;
    const device = !area && bucket.deviceId ? deviceById.get(bucket.deviceId) : undefined;
    const rawName = area?.name ?? device?.name_by_user ?? device?.name ?? bucket.fallbackName;
    const name = area ? rawName : stripFallbackName(rawName, nameStrip);
    rooms.push({
      key: bucket.key,
      areaId: bucket.areaId,
      deviceId: bucket.deviceId,
      name,
      icon: area?.icon ?? undefined,
      temperatureEntity: bucket.temp,
      humidityEntity: bucket.humidity,
    });
  }
  return rooms;
}

// ---- occupancy sensors ----------------------------------------------------

export interface DiscoverOccupancyOptions {
  includeAreas?: string[];
  excludeEntities?: string[];
  nameStrip?: string[];
}

export interface DiscoveredOccupancyRoom {
  key: string;
  areaId?: string;
  name: string;
  icon?: string;
  /**
   * Every occupancy sensor in this room. A room is occupied when any of them
   * is — a camera that exposes person/pet/cell detection as three entities
   * would otherwise fill the card with three identical rows.
   */
  entities: string[];
  /** Sibling sensors found on the same device, when it exposes them. */
  illuminanceEntity?: string;
  batteryEntity?: string;
  signalEntity?: string;
  timeoutEntity?: string;
}

const OCCUPANCY_DEVICE_CLASSES = new Set(["occupancy", "motion", "presence"]);

// Finds motion/occupancy/presence binary sensors and names each one after the
// area it sits in, falling back to its own cleaned friendly name. The side
// sensors (illuminance, battery, signal, motion timeout) are looked up on the
// same device: a Zigbee presence sensor publishes them as separate entities,
// and pairing them by device is the only link that survives renaming.
export async function discoverOccupancyRooms(
  hass: HomeAssistant,
  opts: DiscoverOccupancyOptions,
): Promise<DiscoveredOccupancyRoom[]> {
  const exclude = new Set(opts.excludeEntities ?? []);
  const nameStrip = opts.nameStrip ?? [];

  const candidates = Object.keys(hass.states).filter((id) => {
    if (!id.startsWith("binary_sensor.") || exclude.has(id)) return false;
    const deviceClass = hass.states[id]?.attributes?.device_class;
    return typeof deviceClass === "string" && OCCUPANCY_DEVICE_CLASSES.has(deviceClass);
  });
  if (candidates.length === 0) return [];

  const { entityEntries, entryByEntityId, deviceById, areaById } =
    await getRegistries(hass);

  // entity id -> device id, for every entity, so siblings resolve in one pass.
  const byDevice = new Map<string, string[]>();
  for (const entry of entityEntries) {
    if (!entry.device_id) continue;
    byDevice.set(entry.device_id, [...(byDevice.get(entry.device_id) ?? []), entry.entity_id]);
  }

  const includeAreas = opts.includeAreas?.length ? new Set(opts.includeAreas) : undefined;

  const sibling = (
    deviceId: string | undefined,
    match: (entityId: string) => boolean,
  ): string | undefined => {
    if (!deviceId) return undefined;
    return (byDevice.get(deviceId) ?? []).find((id) => hass.states[id] && match(id));
  };

  const hasClass = (id: string, deviceClass: string): boolean =>
    hass.states[id]?.attributes?.device_class === deviceClass;

  const rooms = new Map<string, DiscoveredOccupancyRoom>();
  for (const entity of candidates) {
    const entry = entryByEntityId.get(entity);
    const device = entry?.device_id ? deviceById.get(entry.device_id) : undefined;
    const areaId = entry?.area_id ?? device?.area_id ?? undefined;
    if (includeAreas && !(areaId && includeAreas.has(areaId))) continue;

    const area = areaId ? areaById.get(areaId) : undefined;
    const rawName =
      area?.name ??
      device?.name_by_user ??
      device?.name ??
      (hass.states[entity]?.attributes?.friendly_name as string | undefined) ??
      entity;
    const name = area?.name ? rawName : stripFallbackName(rawName, nameStrip);
    const deviceId = entry?.device_id ?? undefined;

    // Group by area, then by device, then stand alone — the same fallback
    // ladder discoverClimateRooms uses, so a sensor with no area still shows
    // up instead of being silently dropped.
    const key = areaId ?? deviceId ?? entity;
    const existing = rooms.get(key);
    if (existing) {
      existing.entities.push(entity);
      existing.illuminanceEntity ??= sibling(deviceId, (id) => id.startsWith("sensor.") && hasClass(id, "illuminance"));
      existing.batteryEntity ??= sibling(deviceId, (id) => id.startsWith("sensor.") && hasClass(id, "battery"));
      existing.signalEntity ??= sibling(deviceId, (id) => id.startsWith("sensor.") && hasClass(id, "signal_strength"));
      existing.timeoutEntity ??= sibling(deviceId, (id) => id.startsWith("number.") && /timeout|_delay(_|$)/i.test(id));
      continue;
    }
    rooms.set(key, {
      key,
      entities: [entity],
      areaId,
      name,
      icon: area?.icon ?? undefined,
      illuminanceEntity: sibling(deviceId, (id) => id.startsWith("sensor.") && hasClass(id, "illuminance")),
      batteryEntity: sibling(deviceId, (id) => id.startsWith("sensor.") && hasClass(id, "battery")),
      // signal_strength is the device_class Zigbee2MQTT gives LQI/RSSI.
      signalEntity: sibling(deviceId, (id) => id.startsWith("sensor.") && hasClass(id, "signal_strength")),
      // Z2M exposes the motion-clear delay as a writable number, named
      // differently per model, so it is matched by name. It must say "timeout"
      // outright: matching "motion" alone also caught a camera's
      // motion_detection_sensitivity, and offering that as a timeout stepper
      // would have the user turning a completely different screw.
      timeoutEntity: sibling(deviceId, (id) => id.startsWith("number.") && /timeout|_delay(_|$)/i.test(id)),
    });
  }
  return [...rooms.values()];
}

// ---- Leak sensors ---------------------------------------------------------
export interface DiscoveredLeakSensor {
  entity: string;
  name: string;
  areaName?: string;
  batteryEntity?: string;
}

// Discovers moisture binary_sensors, one entry per sensor (not grouped into
// rooms — a leak card lists individual sensors), resolving each sensor's area
// name and a battery sibling on the same device.
export async function discoverLeakSensors(
  hass: HomeAssistant,
  opts: { includeAreas?: string[]; excludeEntities?: string[] },
): Promise<DiscoveredLeakSensor[]> {
  const exclude = new Set(opts.excludeEntities ?? []);
  const candidates = Object.keys(hass.states).filter((id) => {
    if (!id.startsWith("binary_sensor.") || exclude.has(id)) return false;
    return hass.states[id]?.attributes?.device_class === "moisture";
  });
  if (!candidates.length) return [];

  const { entityEntries, entryByEntityId, deviceById, areaById } =
    await getRegistries(hass);
  const byDevice = new Map<string, string[]>();
  for (const entry of entityEntries) {
    if (!entry.device_id) continue;
    byDevice.set(entry.device_id, [...(byDevice.get(entry.device_id) ?? []), entry.entity_id]);
  }
  const includeAreas = opts.includeAreas?.length ? new Set(opts.includeAreas) : undefined;

  const out: DiscoveredLeakSensor[] = [];
  for (const entity of candidates) {
    const entry = entryByEntityId.get(entity);
    const device = entry?.device_id ? deviceById.get(entry.device_id) : undefined;
    const areaId = entry?.area_id ?? device?.area_id ?? undefined;
    if (includeAreas && !(areaId && includeAreas.has(areaId))) continue;
    const areaName = areaId ? areaById.get(areaId)?.name : undefined;
    const battery = entry?.device_id
      ? (byDevice.get(entry.device_id) ?? []).find(
          (id) => id.startsWith("sensor.") && hass.states[id]?.attributes?.device_class === "battery",
        )
      : undefined;
    out.push({
      entity,
      name: (hass.states[entity]?.attributes?.friendly_name as string) ?? entity,
      areaName,
      batteryEntity: battery,
    });
  }
  return out;
}

// ---- Area contents ---------------------------------------------------------

/**
 * Every entity that belongs to an area, ready to use in a render path.
 *
 * Unlike the discover* functions above this needs no websocket round-trip: the
 * modern frontend hands the card `hass.areas`, `hass.devices` and
 * `hass.entities` directly, so an area's contents are already in memory. That
 * matters here because the room card resolves its whole layout from this, on
 * every tick, rather than once at setup.
 *
 * Three kinds of entity are dropped, and the first is the important one:
 *
 *   `entity_category` — a device's own config and diagnostic entities. A single
 *   Zigbee plug contributes a child lock, an indicator light and a power-on
 *   behaviour select, all in the `switch` and `select` domains. Measured on the
 *   author's install: the living room holds 32 switches, of which 2 are things
 *   a person would call a switch. Without this filter the card is unusable.
 *
 *   hidden and disabled entities, because the user has already said they do not
 *   want to see them.
 *
 *   entities with no state, which are in the registry but not loaded.
 */
interface AreaCache {
  devices: unknown;
  byArea: Map<string, string[]>;
  byDevice: Map<string, string[]>;
}

// Keyed on the entity registry object itself: every card on the dashboard is
// handed the same one, so the ~3400-entry walk happens once per registry
// version per area no matter how many room cards ask for it.
const areaCache = new WeakMap<object, AreaCache>();

export function areaEntityIds(hass: HomeAssistant, areaId: string): string[] {
  const registry = hass.entities as unknown as Record<string, RegistryEntity> | undefined;
  const devices = hass.devices as unknown as Record<string, { area_id?: string | null }> | undefined;
  if (!registry || !devices) return [];

  let cache = areaCache.get(registry);
  if (!cache || cache.devices !== devices) {
    cache = { devices, byArea: new Map(), byDevice: new Map() };
    areaCache.set(registry, cache);
  }
  const hit = cache.byArea.get(areaId);
  if (hit) return hit;

  const ids: string[] = [];
  for (const [entityId, entry] of Object.entries(registry)) {
    if (entry.entity_category) continue;
    if (entry.hidden || entry.hidden_by || entry.disabled_by) continue;
    const area = entry.area_id ?? (entry.device_id ? devices[entry.device_id]?.area_id : undefined);
    if (area !== areaId) continue;
    if (!hass.states[entityId]) continue;
    ids.push(entityId);
  }
  ids.sort();
  cache.byArea.set(areaId, ids);
  return ids;
}

/**
 * Every entity belonging to one device, filtered like `areaEntityIds`.
 *
 * The area lookup is the one to reach for normally. This exists for the rooms
 * that have no area at all: a thermostat that exposes both its own temperature
 * sensor and its `climate` entity groups by device, and then the device is the
 * only thing tying the two together.
 */
export function deviceEntityIds(hass: HomeAssistant, deviceId: string): string[] {
  const registry = hass.entities as unknown as Record<string, RegistryEntity> | undefined;
  const devices = hass.devices as unknown as Record<string, { area_id?: string | null }> | undefined;
  if (!registry || !devices) return [];

  let cache = areaCache.get(registry);
  if (!cache || cache.devices !== devices) {
    cache = { devices, byArea: new Map(), byDevice: new Map() };
    areaCache.set(registry, cache);
  }
  const hit = cache.byDevice.get(deviceId);
  if (hit) return hit;

  const ids: string[] = [];
  for (const [entityId, entry] of Object.entries(registry)) {
    if (entry.device_id !== deviceId) continue;
    if (entry.entity_category) continue;
    if (entry.hidden || entry.hidden_by || entry.disabled_by) continue;
    if (!hass.states[entityId]) continue;
    ids.push(entityId);
  }
  ids.sort();
  cache.byDevice.set(deviceId, ids);
  return ids;
}

interface RegistryEntity {
  area_id?: string | null;
  device_id?: string | null;
  entity_category?: string | null;
  hidden?: boolean;
  hidden_by?: string | null;
  disabled_by?: string | null;
}

export interface AreaInfo {
  areaId: string;
  name: string;
  icon?: string;
  /** Set in HA's own area settings; the best source for the climate chips. */
  temperatureEntity?: string;
  humidityEntity?: string;
}

export function areaInfo(hass: HomeAssistant, areaId: string): AreaInfo | undefined {
  const areas = hass.areas as unknown as Record<string, {
    area_id: string;
    name: string;
    icon?: string | null;
    temperature_entity_id?: string | null;
    humidity_entity_id?: string | null;
  }> | undefined;
  const area = areas?.[areaId];
  if (!area) return undefined;
  return {
    areaId: area.area_id,
    name: area.name,
    icon: area.icon ?? undefined,
    temperatureEntity: area.temperature_entity_id ?? undefined,
    humidityEntity: area.humidity_entity_id ?? undefined,
  };
}

export function listAreas(hass: HomeAssistant): AreaInfo[] {
  const areas = hass.areas as unknown as Record<string, { area_id: string }> | undefined;
  if (!areas) return [];
  return Object.keys(areas)
    .map((id) => areaInfo(hass, id))
    .filter((a): a is AreaInfo => !!a)
    .sort((a, b) => a.name.localeCompare(b.name));
}
