import type { NotifyConfigBase } from "./shared/notify-editor";

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  locale: {
    language: string;
    number_format?: string;
    time_format?: string;
  };
  language: string;
  themes: Record<string, unknown>;
  config: {
    unit_system: {
      temperature: string;
      [key: string]: string;
    };
  };
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: { entity_id?: string | string[]; device_id?: string | string[]; area_id?: string | string[] },
  ) => Promise<void>;
  callWS: <T = unknown>(msg: Record<string, unknown>) => Promise<T>;
  // REST fallback for endpoints with no websocket equivalent (e.g. writing an
  // automation config). Refreshes the access token on its own, unlike a plain
  // fetch() with hass.auth.data.access_token.
  callApi: <T = unknown>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    parameters?: Record<string, unknown>,
  ) => Promise<T>;
  services: Record<string, Record<string, unknown>>;
  /** False while the websocket is down — states are the last known ones. */
  connected?: boolean;
  formatEntityState?: (stateObj: HassEntity) => string;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

export type HvacMode =
  | "off"
  | "heat"
  | "cool"
  | "dry"
  | "auto"
  | "fan_only"
  | "heat_cool";

export interface CornerRadiusConfig {
  top_left?: number;
  top_right?: number;
  bottom_right?: number;
  bottom_left?: number;
}

export interface ModeColorOverrides {
  off?: string;
  heat?: string;
  cool?: string;
  dry?: string;
  auto?: string;
  fan_only?: string;
  heat_cool?: string;
}

export interface M3ClimateCardConfig {
  type: string;
  entity: string;
  name?: string;
  icon?: string;
  show_presets?: boolean;
  show_sensors?: boolean;
  temperature_sensor?: string;
  humidity_sensor?: string;
  window_sensor?: string;
  battery_sensor?: string;
  battery_threshold?: number;
  mode_colors?: ModeColorOverrides;
  icon_active_color?: string;
  icon_inactive_color?: string;
  icon_opacity?: number;
  plus_active_color?: string;
  plus_inactive_color?: string;
  plus_opacity?: number;
  minus_active_color?: string;
  minus_inactive_color?: string;
  minus_opacity?: number;
  glass_background?: boolean;
  preset_style?: "chip" | "pill";
  temperature_chip_placement?: "info_row" | "header";
  hidden_modes?: string[];
  height?: number;
  radius?: number;
  corners?: CornerRadiusConfig;
  animation?: "auto" | "on" | "off";
  /** @deprecated use `animation` — kept for old-config migration only. */
  animations?: boolean;
  unavailable_style?: "dimmed" | "normal" | "hidden";
  card_version?: string;
}

export interface M3ClimateCardMiniConfig {
  type: string;
  entity: string;
  name?: string;
  icon?: string;
  mode_colors?: ModeColorOverrides;
  icon_active_color?: string;
  icon_active_opacity?: number;
  icon_inactive_color?: string;
  icon_inactive_opacity?: number;
  power_active_color?: string;
  power_active_opacity?: number;
  power_inactive_color?: string;
  power_inactive_opacity?: number;
  plus_active_color?: string;
  plus_inactive_color?: string;
  plus_opacity?: number;
  minus_active_color?: string;
  minus_inactive_color?: string;
  minus_opacity?: number;
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  animation?: "auto" | "on" | "off";
  /** @deprecated use `animation` — kept for old-config migration only. */
  animations?: boolean;
  unavailable_style?: "dimmed" | "normal" | "hidden";
  card_version?: string;
}

export interface HaActionConfig {
  action:
    | "more-info"
    | "toggle"
    | "call-service"
    | "perform-action"
    | "navigate"
    | "url"
    | "assist"
    | "none";
  service?: string;
  perform_action?: string;
  service_data?: Record<string, unknown>;
  data?: Record<string, unknown>;
  target?: Record<string, unknown>;
  navigation_path?: string;
  url_path?: string;
  new_tab?: boolean;
}

export interface M3ButtonCardConfig {
  type: string;
  entity?: string;
  name?: string;
  icon?: string;
  color?: string;
  color_opacity?: number;
  inactive_color?: string;
  inactive_opacity?: number;
  invert_colors?: boolean;
  state_colors?: Record<string, string>;
  show_state?: boolean;
  state_content?: "state" | "last_changed" | "last_updated";
  show_icon_background?: boolean;
  icon_size?: number;
  align_icons?: boolean;
  static_color?: boolean;
  unavailable_style?: "dimmed" | "normal" | "hidden";
  show_slider?: boolean;
  vertical?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  glass_background?: boolean;
  animation?: "auto" | "on" | "off";
  /** @deprecated use `animation` — kept for old-config migration only. */
  animations?: boolean;
  card_version?: string;
  tap_action?: HaActionConfig;
  hold_action?: HaActionConfig;
  double_tap_action?: HaActionConfig;
  icon_tap_action?: HaActionConfig;
  icon_hold_action?: HaActionConfig;
  icon_double_tap_action?: HaActionConfig;
}

export interface ProgressStateColors {
  running?: string;
  preparing?: string;
  done?: string;
}

export interface M3ProgressCardConfig extends NotifyConfigBase {
  // notify_service / notify_automation_id come from NotifyConfigBase — see
  // shared/notify-editor. The "appliance finished" automation needs no
  // schedule, so notify_mode/time/weekday stay unused here.
  type: string;
  entity: string;
  percentage_entity?: string;
  remaining_entity?: string;
  name?: string;
  icon?: string;
  status_text_running?: string;
  status_text_preparing?: string;
  status_text_done?: string;
  status_text_ready?: string;
  running_states?: string[];
  preparing_states?: string[];
  done_states?: string[];
  animation?: "auto" | "on" | "off";
  wave_style?: "wavy" | "flat";
  accent_color?: string;
  track_color?: string;
  dot_color?: string;
  icon_color?: string;
  icon_background?: string;
  icon_background_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  state_colors?: ProgressStateColors;
  hide_when_ready?: boolean;
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type EnergyNotifyMode = "day_end" | "month_end";

export interface M3EnergyCardConfig extends NotifyConfigBase {
  type: string;
  entity?: string;
  unit?: string;
  // notify_service / notify_time / notify_automation_id come from
  // NotifyConfigBase — see shared/notify-editor. notify_weekday is unused
  // here (both report modes are date-driven, not weekday-driven).
  notify_mode?: EnergyNotifyMode;
  /**
   * Sensor the notification reads instead of `entity`. The chart's entity is
   * often a lifetime counter (correct for statistics-backed bars, useless in
   * a Jinja template); this lets the report point at a period-scoped
   * utility_meter of the same source without changing what the chart draws.
   */
  notify_entity?: string;
  statistic_type?: "change" | "state";
  mode?: "consumption" | "solar";
  source?: "entity" | "energy";
  forecast_entity?: string;
  full_day?: boolean;
  show_legend?: boolean;
  period?: "day" | "hour" | "month";
  days?: number;
  hours?: number;
  months?: number;
  show_values?: boolean;
  show_projection?: boolean;
  show_comparison?: boolean;
  show_average?: boolean;
  higher_is_better?: boolean;
  comparison_better_color?: string;
  comparison_worse_color?: string;
  comparison_tint_opacity?: number;
  name?: string;
  icon?: string;
  subtitle?: string;
  accent_color?: string;
  accent_opacity?: number;
  bar_tint_color?: string;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type GaugeSource = "energy" | "entities";

export interface M3GaugeCardConfig {
  type: string;
  source?: GaugeSource;
  value_a_entity?: string;
  value_b_entity?: string;
  name?: string;
  icon?: string;
  subtitle?: string;
  label_positive?: string;
  label_negative?: string;
  label_a?: string;
  label_b?: string;
  segment_a_color?: string;
  segment_a_opacity?: number;
  segment_b_color?: string;
  track_color?: string;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type EnergyFlowSource = "energy" | "entities";
export type FlowBatteryVisibility = "auto" | "always" | "never";
export type FlowSpeed = "slow" | "normal" | "fast";

export interface M3EnergyFlowCardConfig {
  type: string;
  source?: EnergyFlowSource;
  solar_entity?: string;
  grid_import_entity?: string;
  grid_export_entity?: string;
  battery_entity?: string;
  name?: string;
  icon?: string;
  show_self_sufficiency?: boolean;
  show_battery?: FlowBatteryVisibility;
  pv_color?: string;
  grid_color?: string;
  home_color?: string;
  battery_color?: string;
  self_sufficiency_color?: string;
  text_color?: string;
  text_opacity?: number;
  node_tint_opacity?: number;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  flow_speed?: FlowSpeed;
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export interface PowerThreshold {
  above: number;
  color: string;
}

export interface M3CounterCardConfig {
  type: string;
  entity: string;
  power_entity?: string;
  daily_entity?: string;
  name?: string;
  icon?: string;
  subtitle?: string;
  decimals?: number;
  digits?: number | "auto";
  show_ticker?: boolean;
  /** Offers a control to correct the reading. */
  adjustable?: boolean;
  /**
   * The writable entity the correction goes to. Left unset it is `entity`
   * itself, which only works for a writable domain. Pointing it at a separate
   * helper switches to offset mode: the helper is moved by the same amount
   * the reading should move, which is what a template sensor needs.
   */
  adjust_entity?: string;
  accent_color?: string;
  accent_opacity?: number;
  cell_background?: string;
  power_chip_color?: string;
  power_chip_opacity?: number;
  power_thresholds?: PowerThreshold[];
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type PowerEntryType = "consumer" | "producer";

export interface PowerListEntity {
  entity: string;
  name?: string;
  icon?: string;
  type?: PowerEntryType;
}

export type PowerListSort = "power_desc" | "power_asc" | "name" | "config";

export interface M3PowerListCardConfig extends NotifyConfigBase {
  type: string;
  entities?: PowerListEntity[];
  auto_discover?: boolean;
  include_area?: string[];
  include_label?: string[];
  exclude_entities?: string[];
  threshold?: number;
  // notify_service / notify_mode / notify_time / notify_weekday /
  // notify_automation_id come from NotifyConfigBase — see shared/notify-editor.
  /** Watts a device must exceed before the "left running" clock starts. */
  notify_power_threshold?: number;
  /** How long it has to stay above that draw before notifying. */
  notify_duration_hours?: number;
  /** Devices that are meant to run around the clock (fridge, router, NAS). */
  notify_exclude_entities?: string[];
  sort?: PowerListSort;
  max_visible?: number;
  show_idle_toggle?: boolean;
  name?: string;
  icon?: string;
  subtitle?: string;
  accent_color?: string;
  accent_opacity?: number;
  producer_color?: string;
  producer_opacity?: number;
  bar_tint_color?: string;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type GridSignConvention = "negative_is_export" | "positive_is_export";

export interface PowerMetricConfig {
  entity: string;
  name?: string;
  icon?: string;
  color?: string;
  type?: PowerEntryType;
}

export interface M3PowerSummaryCardConfig {
  type: string;
  grid_entity: string;
  grid_sign?: GridSignConvention;
  consumption_entity?: string;
  solar_entity?: string | string[];
  metrics?: PowerMetricConfig[];
  label_export?: string;
  label_import?: string;
  show_self_sufficiency?: boolean;
  show_split_bar?: boolean;
  zero_threshold?: number;
  kw_threshold?: number;
  export_color?: string;
  import_color?: string;
  producer_color?: string;
  flow_tint_opacity?: number;
  accent_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type TopConsumersPeriod = "today" | "yesterday" | "week" | "month";
export type TopConsumersRestMode = "collapse" | "hide" | "show_all";
export type TopConsumersSource = "energy" | "entities";

export interface TopConsumerEntityConfig {
  entity: string;
  name?: string;
  icon?: string;
  color?: string;
}

export type TopConsumersUnitMode = "energy" | "cost";

export interface M3TopConsumersCardConfig extends PricingConfig, NotifyConfigBase {
  // notify_service / notify_mode / notify_time / notify_weekday /
  // notify_automation_id come from NotifyConfigBase — see
  // shared/notify-editor. The weekly digest only works for utility_meter
  // helpers on a weekly cycle (see the editor for why), so notify_mode here
  // selects which cycle to report: "current" | "last_week".
  type: string;
  source?: TopConsumersSource;
  entities?: TopConsumerEntityConfig[];
  period?: TopConsumersPeriod;
  top_count?: number;
  rest_mode?: TopConsumersRestMode;
  name_strip?: string[];
  unit_mode?: TopConsumersUnitMode;
  name?: string;
  icon?: string;
  subtitle?: string;
  accent_color?: string;
  accent_opacity?: number;
  palette?: string[];
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

// Shared by m3-cost-card and m3-top-consumers-card's unit_mode: "cost".
export type PriceSource = "energy_dashboard" | "input_number" | "fixed";
export type PriceUnit = "eur_per_kwh" | "ct_per_kwh" | "custom";

export interface PricingConfig {
  price_source?: PriceSource;
  price_entity?: string;
  price?: number;
  price_unit?: PriceUnit;
  // Only used when price_unit is "custom": a free-text unit label for
  // display (e.g. "€/m³", "$/gal"), and a factor the raw entity value is
  // multiplied by before pricing (e.g. 0.001 for a liter sensor priced per
  // m³) — lets any quantity/unit pairing work without hardcoding conversions
  // for every possible unit.
  price_unit_label?: string;
  price_quantity_factor?: number;
  base_fee?: number;
  currency?: string;
}

export type CostPeriod = "day" | "month" | "year";

export interface M3CostCardConfig extends PricingConfig, NotifyConfigBase {
  type: string;
  entity?: string;
  statistic_type?: "change" | "state";
  period?: CostPeriod;
  name?: string;
  icon?: string;
  subtitle?: string;
  show_projection?: boolean;
  show_comparison?: boolean;
  budget?: number;
  // notify_service / notify_mode / notify_time / notify_automation_id come
  // from NotifyConfigBase — see shared/notify-editor.
  // The card's own total comes from long-term statistics, which a Jinja
  // template can't read; the notification therefore needs an entity whose
  // *state* is the month-to-date value (a monetary one, or a consumption one
  // that gets multiplied by the configured price).
  notify_cost_entity?: string;
  /** Warn at this share of `budget` (%), so the warning arrives before the
   * budget is blown. Defaults to DEFAULT_COST_NOTIFY_PERCENT. */
  notify_budget_percent?: number;
  accent_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type LightWaveStyle = "wavy" | "flat";
export type LightColorTempStyle = "presets" | "slider";

export interface LightColorTempPresets {
  warm?: number;
  neutral?: number;
  cold?: number;
}

export interface LightSceneConfig {
  entity?: string;
  service?: string;
  service_data?: Record<string, unknown>;
  name?: string;
  icon?: string;
}

export interface M3LightCardConfig {
  type: string;
  entity: string;
  name?: string;
  icon?: string;
  transition?: number;
  show_members?: boolean;
  color_temp_style?: LightColorTempStyle;
  color_temp_presets?: LightColorTempPresets;
  color_palette?: string[];
  show_color_wheel?: boolean;
  scenes?: LightSceneConfig[];
  use_light_color?: boolean;
  accent_color?: string;
  accent_opacity?: number;
  track_color?: string;
  handle_color?: string;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  wave_style?: LightWaveStyle;
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export interface BatteryEntityConfig {
  entity: string;
  name?: string;
  icon?: string;
}

export interface BatteryThresholds {
  critical?: number;
  low?: number;
  medium?: number;
}

export type BatteryNotifyMode = "daily" | "weekly" | "on_change";

export interface M3BatteryCardConfig extends NotifyConfigBase {
  type: string;
  entities?: BatteryEntityConfig[];
  auto_discover?: boolean;
  include_area?: string[];
  include_label?: string[];
  exclude_entities?: string[];
  name_strip?: string[];
  thresholds?: BatteryThresholds;
  max_visible?: number;
  show_healthy_toggle?: boolean;
  show_trend?: boolean;
  // notify_service / notify_mode / notify_time / notify_weekday /
  // notify_automation_id come from NotifyConfigBase — see shared/notify-editor.
  notify_mode?: BatteryNotifyMode;
  notify_threshold?: number;
  notify_exclude_entities?: string[];
  name?: string;
  icon?: string;
  critical_color?: string;
  low_color?: string;
  medium_color?: string;
  ok_color?: string;
  unavailable_color?: string;
  stage_tint_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type WeatherChipType =
  | "apparent_temperature"
  | "wind_speed"
  | "humidity"
  | "pressure"
  | "uv_index"
  | "visibility";

export interface M3WeatherCardConfig {
  type: string;
  entity: string;
  name?: string;
  hours?: number;
  days?: number;
  chips?: WeatherChipType[];
  show_sun?: boolean;
  show_days_toggle?: boolean;
  accent_color?: string;
  accent_opacity?: number;
  precipitation_color?: string;
  gradient_color?: string;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type PresenceSortMode = "home_first" | "name";

export interface M3PresenceCardConfig {
  type: string;
  entities?: string[];
  auto_discover?: boolean;
  include_area?: string[];
  include_label?: string[];
  exclude_entities?: string[];
  name?: string;
  icon?: string;
  show_distance?: boolean;
  show_since?: boolean;
  show_map?: boolean;
  sort?: PresenceSortMode;
  home_color?: string;
  not_home_color?: string;
  zone_color?: string;
  unknown_color?: string;
  zone_colors?: Record<string, string>;
  presence_tint_opacity?: number;
  hold_action?: HaActionConfig;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export interface M3MediaCardConfig {
  type: string;
  entity: string;
  name?: string;
  show_source_select?: boolean;
  show_shuffle_repeat?: boolean;
  use_artwork_color?: boolean;
  accent_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type ClimateOverviewSort = "area" | "temp_desc" | "temp_asc" | "name";

export interface ClimateOverviewTempThresholds {
  cold?: number;
  cool?: number;
  comfortable?: number;
  warm?: number;
}

export interface ClimateOverviewRoomConfig {
  name: string;
  icon?: string;
  temperature_entity: string;
  humidity_entity?: string;
  color?: string;
}

export type ClimateOverviewNotifyMode = "daily" | "weekly";

export interface M3ClimateOverviewCardConfig extends NotifyConfigBase {
  type: string;
  auto_discover?: boolean;
  include_area?: string[];
  exclude_entities?: string[];
  rooms?: ClimateOverviewRoomConfig[];
  name_strip?: string[];
  name?: string;
  icon?: string;
  sort?: ClimateOverviewSort;
  show_scale?: boolean;
  /** Room names along the comparison scale; off leaves only the dots. */
  show_scale_labels?: boolean;
  show_outlier_chip?: boolean;
  show_trend?: boolean;
  show_mold_warning?: boolean;
  // notify_service / notify_time / notify_weekday / notify_automation_id come
  // from NotifyConfigBase — see shared/notify-editor.
  notify_mode?: ClimateOverviewNotifyMode;
  temp_thresholds?: ClimateOverviewTempThresholds;
  humidity_range?: [number, number];
  scale_min?: number;
  scale_max?: number;
  cold_color?: string;
  cool_color?: string;
  comfortable_color?: string;
  warm_color?: string;
  hot_color?: string;
  humidity_warn_color?: string;
  tile_tint_opacity?: number;
  accent_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export interface AquariumDeviceConfig {
  entity: string;
  name?: string;
  icon?: string;
  color?: string;
}

export interface AquariumScheduleEntry {
  device: "day" | "night";
  start: string;
  end: string;
  color?: string;
}

export type AquariumCameraStyle = "none" | "thumbnail" | "banner" | "live";

export interface M3AquariumCardConfig extends NotifyConfigBase {
  type: string;
  name?: string;
  icon?: string;
  water_temperature_entity?: string;
  target_range?: [number, number];
  light_day?: AquariumDeviceConfig;
  light_night?: AquariumDeviceConfig;
  pump?: AquariumDeviceConfig;
  heater?: AquariumDeviceConfig;
  co2?: AquariumDeviceConfig;
  extra_devices?: AquariumDeviceConfig[];
  heater_power_entity?: string;
  ph_entity?: string;
  tds_entity?: string;
  power_entity?: string;
  water_level_entity?: string;
  cleaning_entity?: string;
  cleaning_interval?: number;
  cleaning_interval_entity?: string;
  cleaning_notify_service?: string[];
  cleaning_notify_time?: string;
  camera_entity?: string;
  camera_style?: AquariumCameraStyle;
  camera_refresh?: number;
  camera_live_on_tap?: boolean;
  schedule?: AquariumScheduleEntry[];
  schedule_entity?: string;
  show_schedule?: boolean;
  accent_color?: string;
  accent_opacity?: number;
  tile_tint_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}


export type UpdateGroup =
  | "core"
  | "os"
  | "supervisor"
  | "addon"
  | "hacs"
  | "firmware"
  | "remote"
  | "other";

/** One volume row on the NAS card. */
export interface NasDiskConfig {
  /** Mount point as Glances reports it, e.g. "/rootfs/srv/dev-disk-by-uuid-...". */
  mount: string;
  name?: string;
  icon?: string;
}

export type HostSource = "glances" | "systemmonitor";

export interface M3NasCardConfig extends NotifyConfigBase {
  type: string;
  /** Which integration supplies the metrics. Defaults per card type. */
  source?: HostSource;
  /** Pick up every Glances entity of the chosen host automatically. */
  auto_discover?: boolean;
  /** Restrict discovery to one Glances config entry when several NAS exist. */
  config_entry_id?: string;
  /** Explicit volume list; overrides discovery order and naming. */
  disks?: NasDiskConfig[];
  exclude_mounts?: string[];
  /** Mount point → display name, applied on top of discovery. */
  mount_names?: Record<string, string>;
  disk_warn?: number;
  disk_critical?: number;
  temp_warn?: number;
  temp_critical?: number;
  /** Temperature sensors to average/max over; empty = all discovered ones. */
  temperature_labels?: string[];
  show_cpu?: boolean;
  show_memory?: boolean;
  show_temperature?: boolean;
  show_network?: boolean;
  show_uptime?: boolean;
  /** Syncthing folder sensors; empty falls back to every discovered one. */
  sync_entities?: string[];
  show_sync?: boolean;
  /** Alert when a Syncthing folder errors out. Paused is never an alert. */
  notify_sync_errors?: boolean;
  notify_disk_full?: boolean;
  notify_disk_threshold?: number;
  /** Alert when Glances stops reporting, i.e. the NAS is unreachable. */
  notify_offline?: boolean;
  notify_offline_minutes?: number;
  max_visible?: number;
  name?: string;
  icon?: string;
  ok_color?: string;
  warn_color?: string;
  critical_color?: string;
  offline_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export interface M3UpdatesCardConfig extends NotifyConfigBase {
  type: string;
  auto_discover?: boolean;
  entities?: string[];
  exclude_entities?: string[];
  include_types?: UpdateGroup[];
  /** Display order of the groups; anything omitted keeps the default order. */
  group_order?: UpdateGroup[];
  /** entity_id substring → group, overriding the platform-based mapping. */
  type_patterns?: Record<string, UpdateGroup>;
  /** Groups shown read-only — no install button. Defaults to firmware. */
  no_install_types?: UpdateGroup[];
  backup_entity?: string;
  backup_warn_days?: number;
  /** Update entities the notification ignores while the card still lists them. */
  notify_exclude_entities?: string[];
  require_confirm?: boolean;
  inline_install?: boolean;
  /**
   * How many pending updates are shown directly, most important first
   * (group_order decides what "important" means). The rest collapse behind
   * an expander, like the battery card's healthy-devices section.
   */
  max_visible?: number;
  show_uptodate?: boolean;
  show_skipped?: boolean;
  show_release_notes?: boolean;
  name?: string;
  icon?: string;
  ok_color?: string;
  update_color?: string;
  progress_color?: string;
  addon_color?: string;
  hacs_color?: string;
  firmware_color?: string;
  remote_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export interface SwitchPairConfig {
  up_entity?: string;
  down_entity?: string;
  stop_entity?: string;
}

export interface CoverEntityConfig {
  entity: string;
  name?: string;
  icon?: string;
}

export interface M3CoverCardConfig {
  type: string;
  mode?: "single" | "group";
  /** single mode: the cover (or, with entity_type switch_pair, ignored). */
  entity?: string;
  /** group mode: one row per cover. */
  entities?: (string | CoverEntityConfig)[];
  /** "cover" (default) or "switch_pair" for up/down/stop switch relays. */
  entity_type?: "cover" | "switch_pair";
  up_entity?: string;
  down_entity?: string;
  stop_entity?: string;
  name?: string;
  icon?: string;
  device_class?: string;
  show_preview?: boolean;
  slider_style?: "plain" | "wavy";
  show_master?: boolean;
  row_tap_action?: "more-info" | "toggle";
  invert_position?: boolean;
  tilt_step?: number;
  /** Seconds a positionless cover takes end to end; drives optimistic UI. */
  travel_time?: number;
  accent_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export interface LeakSensorConfig {
  entity: string;
  name?: string;
  icon?: string;
  area?: string;
  battery_entity?: string;
}

export interface M3LeakCardConfig {
  type: string;
  auto_discover?: boolean;
  include_area?: string[];
  exclude_entities?: string[];
  sensors?: LeakSensorConfig[];
  name_strip?: string[];
  valve_entity?: string;
  siren_entity?: string;
  ack_entity?: string;
  confirm_shutoff?: boolean;
  stale_hours?: number;
  battery_warn?: number;
  battery_critical?: number;
  test_interval_days?: number;
  last_test_entity?: string;
  collapse_ok?: boolean;
  name?: string;
  icon?: string;
  accent_color?: string;
  alarm_color?: string;
  stale_color?: string;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export interface WasteEntityConfig {
  entity: string;
  name?: string;
  icon?: string;
  color?: string;
}

export interface M3WasteCardConfig {
  type: string;
  mode?: "info" | "reminder";
  entities?: (string | WasteEntityConfig)[];
  auto_discover?: boolean;
  name_strip?: string[];
  hero_primary?: "days" | "weekday";
  hero_icon?: "first" | "multi";
  show_timeline?: boolean;
  timeline_days?: number;
  max_rows?: number;
  reminder_offset?: number;
  reminder_time?: string;
  ack_entity?: string;
  name?: string;
  icon?: string;
  accent_color?: string;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type M3CardConfig =
  | M3ClimateCardConfig
  | M3ClimateCardMiniConfig
  | M3ButtonCardConfig
  | M3ProgressCardConfig
  | M3EnergyCardConfig
  | M3GaugeCardConfig
  | M3EnergyFlowCardConfig
  | M3CounterCardConfig
  | M3PowerListCardConfig
  | M3PowerSummaryCardConfig
  | M3TopConsumersCardConfig
  | M3CostCardConfig
  | M3LightCardConfig
  | M3BatteryCardConfig
  | M3WeatherCardConfig
  | M3PresenceCardConfig
  | M3MediaCardConfig
  | M3ClimateOverviewCardConfig
  | M3AquariumCardConfig
  | M3UpdatesCardConfig
  | M3NasCardConfig
  | M3SupplyCardConfig
  | M3TodoCardConfig
  | M3TimeCardConfig
  | M3OccupancyCardConfig
  | M3CoverCardConfig
  | M3LeakCardConfig
  | M3WasteCardConfig;

export interface SupplyItemConfig {
  /** A `counter.*` or `input_number.*` helper holding the remaining count. */
  entity: string;
  name?: string;
  icon?: string;
  color?: string;
  /** Units in one full pack. Defaults to the helper's own maximum, then to
   * DEFAULT_SUPPLY_PACK_SIZE. */
  pack_size?: number;
  /** Plural noun shown under the hero value, e.g. "Pods". */
  unit?: string;
  low_threshold?: number;
  critical_threshold?: number;
  /** Text added to the todo list when this item runs critical. */
  shopping_item?: string;
  /** Overrides the history-derived consumption rate for this item. */
  usage_per_week?: number;
}

export type SupplyLayout = "hero_and_list" | "list_only" | "hero_only";
export type SupplyRefillMode = "set" | "add";
export type SupplyListTapAction = "hero" | "more-info";

/** Which state an item must reach before it is worth notifying about. */
export type SupplyNotifyLevel = "empty" | "critical" | "low";

export interface M3SupplyCardConfig extends NotifyConfigBase {
  type: string;
  items?: SupplyItemConfig[];
  // notify_service / notify_mode / notify_time / notify_weekday /
  // notify_automation_id come from NotifyConfigBase — see shared/notify-editor.
  notify_level?: SupplyNotifyLevel;
  /** Which supplies the notification covers. Empty or unset means all of them. */
  notify_items?: string[];
  /** Index into `items`, or an entity id. Unset picks the item with the
   * shortest remaining range. */
  hero?: number | string;
  layout?: SupplyLayout;
  refill_mode?: SupplyRefillMode;
  list_tap_action?: SupplyListTapAction;
  /** Days of history to derive the consumption rate from. */
  rate_window?: number;
  usage_per_week?: number;
  todo_entity?: string;
  auto_add_to_list?: boolean;
  name?: string;
  icon?: string;
  ok_color?: string;
  low_color?: string;
  critical_color?: string;
  unavailable_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type TodoAddPosition = "top" | "bottom";
export type TodoQuickAddMode = "none" | "fixed" | "recent" | "supplies";

export interface M3TodoCardConfig {
  type: string;
  entity: string;
  name?: string;
  icon?: string;
  add_position?: TodoAddPosition;
  prevent_duplicates?: boolean;
  quick_add_mode?: TodoQuickAddMode;
  quick_add?: string[];
  max_quick_add?: number;
  show_completed?: boolean;
  show_clear_completed?: boolean;
  group_by_category?: boolean;
  reorderable?: boolean;
  accent_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type TimeCardStyle = "stepper" | "wheel" | "compact";
export type TimeApplyMode = "button" | "instant";
/** Whether the apply button is always on screen or only once something changed. */
export type TimeApplyVisibility = "always" | "when_changed";

export interface M3TimeCardConfig {
  type: string;
  entity: string;
  name?: string;
  icon?: string;
  subtitle?: string;
  style?: TimeCardStyle;
  minute_step?: number;
  apply_mode?: TimeApplyMode;
  apply_visibility?: TimeApplyVisibility;
  show_revert?: boolean;
  presets?: string[];
  show_date?: boolean;
  keep_seconds?: boolean;
  accent_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export type OccupancySortMode = "occupied_first" | "name" | "last_active";

export interface OccupancySensorConfig {
  entity: string;
  name?: string;
  icon?: string;
  illuminance_entity?: string;
  battery_entity?: string;
  signal_entity?: string;
  timeout_entity?: string;
}

export interface M3OccupancyCardConfig {
  type: string;
  auto_discover?: boolean;
  include_area?: string[];
  exclude_entities?: string[];
  sensors?: OccupancySensorConfig[];
  name_strip?: string[];
  show_timeline?: boolean;
  timeline_hours?: number;
  timeline_segments?: number;
  sort?: OccupancySortMode;
  max_visible?: number;
  show_timeout?: boolean;
  battery_warn?: number;
  battery_critical?: number;
  lqi_warn?: number;
  name?: string;
  icon?: string;
  accent_color?: string;
  accent_opacity?: number;
  text_color?: string;
  secondary_text_color?: string;
  card_background?: string;
  animation?: "auto" | "on" | "off";
  glass_background?: boolean;
  radius?: number;
  corners?: CornerRadiusConfig;
  card_version?: string;
}

export interface LovelaceCardEditor<
  T extends M3CardConfig = M3CardConfig,
> extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: T): void;
}

export interface LovelaceGridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
  max_columns?: number;
  max_rows?: number;
}

export interface LovelaceCard<T extends M3CardConfig = M3CardConfig>
  extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: T): void;
  getCardSize?: () => number | Promise<number>;
  getGridOptions?: () => LovelaceGridOptions;
}
