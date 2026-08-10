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
}

export interface DiscoverPowerOptions {
  includeAreas?: string[];
  includeLabels?: string[];
  excludeEntities?: string[];
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

  const [entityEntries, deviceEntries] = await Promise.all([
    hass.callWS<EntityRegistryEntry[]>({ type: "config/entity_registry/list" }),
    needsArea
      ? hass.callWS<DeviceRegistryEntry[]>({ type: "config/device_registry/list" })
      : Promise.resolve([] as DeviceRegistryEntry[]),
  ]);

  const deviceAreaById = new Map(deviceEntries.map((d) => [d.id, d.area_id ?? undefined]));
  const entryByEntityId = new Map(entityEntries.map((e) => [e.entity_id, e]));

  const includeAreas = new Set(opts.includeAreas ?? []);
  const includeLabels = new Set(opts.includeLabels ?? []);

  return candidates.filter((entityId) => {
    const entry = entryByEntityId.get(entityId);
    if (!entry) return !needsArea && !needsLabel;

    if (needsArea) {
      const area = entry.area_id ?? (entry.device_id ? deviceAreaById.get(entry.device_id) : undefined);
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

  const [entityEntries, deviceEntries] = await Promise.all([
    hass.callWS<EntityRegistryEntry[]>({ type: "config/entity_registry/list" }),
    needsArea
      ? hass.callWS<DeviceRegistryEntry[]>({ type: "config/device_registry/list" })
      : Promise.resolve([] as DeviceRegistryEntry[]),
  ]);
  const deviceAreaById = new Map(deviceEntries.map((d) => [d.id, d.area_id ?? undefined]));
  const entryByEntityId = new Map(entityEntries.map((e) => [e.entity_id, e]));
  const includeAreas = new Set(opts.includeAreas ?? []);
  const includeLabels = new Set(opts.includeLabels ?? []);

  return candidates.filter((entityId) => {
    const entry = entryByEntityId.get(entityId);
    if (!entry) return !needsArea && !needsLabel;
    if (needsArea) {
      const area = entry.area_id ?? (entry.device_id ? deviceAreaById.get(entry.device_id) : undefined);
      if (!area || !includeAreas.has(area)) return false;
    }
    if (needsLabel) {
      const labels = entry.labels ?? [];
      if (!labels.some((l) => includeLabels.has(l))) return false;
    }
    return true;
  });
}
