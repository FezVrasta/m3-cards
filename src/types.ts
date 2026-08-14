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

export interface M3ProgressCardConfig {
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

export interface M3EnergyCardConfig {
  type: string;
  entity?: string;
  unit?: string;
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

export interface M3PowerListCardConfig {
  type: string;
  entities?: PowerListEntity[];
  auto_discover?: boolean;
  include_area?: string[];
  include_label?: string[];
  exclude_entities?: string[];
  threshold?: number;
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

export interface M3TopConsumersCardConfig extends PricingConfig {
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

export interface M3CostCardConfig extends PricingConfig {
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

export interface M3BatteryCardConfig {
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
  notify_service?: string;
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

export interface M3ClimateOverviewCardConfig {
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
  show_outlier_chip?: boolean;
  show_trend?: boolean;
  show_mold_warning?: boolean;
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

export interface M3AquariumCardConfig {
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
  | M3AquariumCardConfig;

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
