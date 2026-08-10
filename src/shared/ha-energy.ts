import type { HomeAssistant } from "../types";
import { mapWhHoursToLocalKwh } from "./ha-statistics";

interface GridSource {
  type: "grid";
  stat_energy_from?: string;
  stat_energy_to?: string;
}

interface SolarSource {
  type: "solar";
  stat_energy_from?: string;
  config_entry_solar_forecast?: string[] | null;
}

interface BatterySource {
  type: "battery";
  stat_energy_from?: string;
  stat_energy_to?: string;
}

interface DeviceConsumption {
  stat_consumption: string;
  name?: string;
}

interface EnergyPrefs {
  energy_sources: Array<{ type: string; [key: string]: unknown }>;
  device_consumption?: DeviceConsumption[];
}

export interface GridEntities {
  from: string[];
  to: string[];
}

// Reads the grid consumption/return statistic IDs configured in HA's
// Energy dashboard. A dashboard can have several grid sources (e.g. one per
// meter/tariff), so all of them are aggregated. Returns undefined if no
// energy dashboard / grid source is configured at all (distinct from
// "configured but zero today").
export async function getGridEntities(
  hass: HomeAssistant,
): Promise<GridEntities | undefined> {
  try {
    const prefs = await hass.callWS<EnergyPrefs>({ type: "energy/get_prefs" });
    const gridSources = prefs.energy_sources.filter(
      (s) => s.type === "grid",
    ) as GridSource[];
    if (gridSources.length === 0) return undefined;
    return {
      from: gridSources.map((s) => s.stat_energy_from).filter((v): v is string => !!v),
      to: gridSources.map((s) => s.stat_energy_to).filter((v): v is string => !!v),
    };
  } catch (e) {
    console.warn("m3-gauge-card: failed to load energy preferences", e);
    return undefined;
  }
}

export interface SolarEntities {
  from: string[];
  forecastConfigEntryIds: string[];
}

// Reads the solar production statistic IDs (and, if configured, the
// associated Forecast.Solar/Solcast config entry IDs) from HA's Energy
// dashboard. A dashboard can have several solar sources (e.g. multiple
// arrays/inverters), so all of them are aggregated. Returns undefined if no
// energy dashboard / solar source is configured at all.
export async function getSolarEntities(
  hass: HomeAssistant,
): Promise<SolarEntities | undefined> {
  try {
    const prefs = await hass.callWS<EnergyPrefs>({ type: "energy/get_prefs" });
    const solarSources = prefs.energy_sources.filter(
      (s) => s.type === "solar",
    ) as SolarSource[];
    if (solarSources.length === 0) return undefined;
    return {
      from: solarSources.map((s) => s.stat_energy_from).filter((v): v is string => !!v),
      forecastConfigEntryIds: solarSources.flatMap((s) => s.config_entry_solar_forecast ?? []),
    };
  } catch (e) {
    console.warn("m3-energy-card: failed to load energy preferences", e);
    return undefined;
  }
}

export interface EnergyDashboardEntities {
  solarFrom: string[];
  gridFrom: string[];
  gridTo: string[];
  batteryFrom: string[];
  batteryTo: string[];
  hasBattery: boolean;
}

// Reads solar, grid, and battery statistic IDs from HA's Energy dashboard in
// a single `energy/get_prefs` call — used by m3-energy-flow-card, which
// needs all three at once. Returns undefined only if no energy dashboard is
// configured at all (no sources of any kind), distinct from "configured but
// missing e.g. a battery".
export async function getEnergyDashboardEntities(
  hass: HomeAssistant,
): Promise<EnergyDashboardEntities | undefined> {
  try {
    const prefs = await hass.callWS<EnergyPrefs>({ type: "energy/get_prefs" });
    const solarSources = prefs.energy_sources.filter((s) => s.type === "solar") as SolarSource[];
    const gridSources = prefs.energy_sources.filter((s) => s.type === "grid") as GridSource[];
    const batterySources = prefs.energy_sources.filter(
      (s) => s.type === "battery",
    ) as BatterySource[];
    if (solarSources.length === 0 && gridSources.length === 0 && batterySources.length === 0) {
      return undefined;
    }
    return {
      solarFrom: solarSources.map((s) => s.stat_energy_from).filter((v): v is string => !!v),
      gridFrom: gridSources.map((s) => s.stat_energy_from).filter((v): v is string => !!v),
      gridTo: gridSources.map((s) => s.stat_energy_to).filter((v): v is string => !!v),
      batteryFrom: batterySources.map((s) => s.stat_energy_from).filter((v): v is string => !!v),
      batteryTo: batterySources.map((s) => s.stat_energy_to).filter((v): v is string => !!v),
      hasBattery: batterySources.length > 0,
    };
  } catch (e) {
    console.warn("m3-energy-flow-card: failed to load energy preferences", e);
    return undefined;
  }
}

// Fetches solar generation forecasts (Wh per hour) for the given
// Forecast.Solar/Solcast config entries via HA's Energy dashboard forecast
// API, merged into a single local-hour-keyed kWh map. Returns undefined if
// no forecast integration is configured or the call fails — callers should
// treat that as "no forecast available", not an error.
export async function fetchSolarForecast(
  hass: HomeAssistant,
  configEntryIds: string[],
): Promise<Map<string, number> | undefined> {
  if (configEntryIds.length === 0) return undefined;
  try {
    const response = await hass.callWS<Record<string, { wh_hours?: Record<string, number> }>>({
      type: "energy/solar_forecast",
    });
    const merged = new Map<string, number>();
    let found = false;
    for (const id of configEntryIds) {
      const whHours = response[id]?.wh_hours;
      if (!whHours) continue;
      found = true;
      for (const [key, val] of mapWhHoursToLocalKwh(whHours)) {
        merged.set(key, (merged.get(key) ?? 0) + val);
      }
    }
    return found ? merged : undefined;
  } catch (e) {
    console.warn("m3-energy-card: failed to load solar forecast", e);
    return undefined;
  }
}

// Reads the individual device energy statistic IDs configured in HA's
// Energy dashboard "Individual devices" section. Returns undefined if the
// dashboard has no device section configured at all (distinct from "empty").
export async function getEnergyDeviceEntities(
  hass: HomeAssistant,
): Promise<string[] | undefined> {
  try {
    const prefs = await hass.callWS<EnergyPrefs>({ type: "energy/get_prefs" });
    const devices = prefs.device_consumption ?? [];
    if (devices.length === 0) return undefined;
    return devices.map((d) => d.stat_consumption).filter((v): v is string => !!v);
  } catch (e) {
    console.warn("m3-top-consumers-card: failed to load energy preferences", e);
    return undefined;
  }
}

// Sums today's "change" statistic (i.e. today-so-far total) across one or
// more statistic IDs — the Energy dashboard's grid flows are sometimes
// split across multiple meters/tariffs.
export async function fetchTodayChangeSum(
  hass: HomeAssistant,
  entityIds: string[],
): Promise<number> {
  if (entityIds.length === 0) return 0;
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const now = new Date();
  try {
    const response = await hass.callWS<Record<string, Array<{ change?: number }>>>({
      type: "recorder/statistics_during_period",
      start_time: todayMidnight.toISOString(),
      end_time: now.toISOString(),
      statistic_ids: entityIds,
      period: "day",
      types: ["change"],
      // Energy-dashboard sources are sometimes mixed Wh/kWh across
      // meters/inverters — normalize so summing multiple entities is valid.
      units: { energy: "kWh" },
    });
    let total = 0;
    for (const id of entityIds) {
      const rows = response[id];
      const last = rows?.[rows.length - 1];
      if (last && typeof last.change === "number") total += last.change;
    }
    return total;
  } catch (e) {
    console.warn("m3-gauge-card: failed to fetch grid statistics", e);
    return 0;
  }
}
