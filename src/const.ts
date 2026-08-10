import type { CornerRadiusConfig, HvacMode, WeatherChipType } from "./types";
import { RADIUS, HEIGHT, SPACING, DURATION_MS, PALETTE } from "./shared/tokens";

export const CARD_VERSION = "1.0.0";

export const DEFAULT_CLIMATE_RADIUS = RADIUS.cardHero;
export const DEFAULT_MINI_RADIUS = RADIUS.card;

// Resolves a base radius + optional per-corner overrides into a CSS
// border-radius value ("TL TR BR BL"), enabling Material 3 Expressive-style
// asymmetric shapes.
export function resolveCornerRadius(
  base: number,
  corners?: CornerRadiusConfig,
): string {
  const tl = corners?.top_left ?? base;
  const tr = corners?.top_right ?? base;
  const br = corners?.bottom_right ?? base;
  const bl = corners?.bottom_left ?? base;
  return `${tl}px ${tr}px ${br}px ${bl}px`;
}

export const DEFAULT_MODE_COLORS: Record<HvacMode, string> = {
  off: PALETTE.off,
  heat: PALETTE.heat,
  cool: PALETTE.cool,
  dry: PALETTE.dryAuto,
  auto: PALETTE.dryAuto,
  fan_only: PALETTE.fan,
  heat_cool: "#e5a768",
};

export const MODE_ICONS: Record<HvacMode, string> = {
  off: "mdi:power",
  heat: "mdi:fire",
  cool: "mdi:snowflake",
  dry: "mdi:water-percent",
  fan_only: "mdi:fan",
  auto: "mdi:refresh-auto",
  heat_cool: "mdi:sun-snowflake-variant",
};

// Order in which modes are rendered when present in hvac_modes, "off" always first.
export const MODE_ORDER: HvacMode[] = [
  "off",
  "heat",
  "cool",
  "dry",
  "auto",
  "fan_only",
  "heat_cool",
];

export const PRESET_ICONS: Record<string, string> = {
  eco: "mdi:leaf",
  sleep: "mdi:sleep",
  boost: "mdi:rocket-launch",
  away: "mdi:bag-suitcase-outline",
  home: "mdi:home",
  comfort: "mdi:sofa",
  activity: "mdi:run",
  none: "mdi:tune-variant",
};

export const PRESET_ICON_FALLBACK = "mdi:tune-variant";

export const WINDOW_OPEN_COLOR = PALETTE.home;

export const DEFAULT_BATTERY_THRESHOLD = 20;

export const DEFAULT_TEMP_STEP = 0.5;

// Curated HA/tile-card-style color tokens. Anything not found here is used
// verbatim as a CSS color (hex, rgb(), CSS name, var(...), ...).
export const THEME_COLOR_TOKENS: Record<string, string> = {
  primary: "var(--primary-color)",
  accent: "var(--accent-color)",
  red: "#e57373",
  pink: "#f06292",
  purple: "#ba68c8",
  "deep-purple": "#9575cd",
  indigo: "#7986cb",
  blue: "#64b5f6",
  "light-blue": "#4fc3f7",
  cyan: "#4dd0e1",
  teal: "#4db6ac",
  green: "#81c784",
  "light-green": "#aed581",
  lime: "#dce775",
  yellow: "#fff176",
  amber: "#ffd54f",
  orange: "#ffb74d",
  "deep-orange": "#ff8a65",
  brown: "#a1887f",
  grey: "#bdbdbd",
  "dark-grey": "#616161",
  "blue-grey": "#90a4ae",
  black: "#000000",
  white: "#ffffff",
  disabled: "var(--disabled-text-color)",
};

export const DEFAULT_BUTTON_COLOR = "primary";
export const DEFAULT_BUTTON_RADIUS = RADIUS.card;

export const CLIMATE_RADIUS_PRESETS: Record<string, number> = {
  eckig: 12,
  leicht_rund: 20,
  rund: 32,
};

// Domains without a meaningful persistent "off" state — always render active/colored.
export const STATELESS_DOMAINS = new Set([
  "button",
  "script",
  "scene",
  "input_button",
]);

export const ACTIVE_STATES = new Set([
  "on",
  "open",
  "opening",
  "home",
  "playing",
  "true",
  "heat",
  "cool",
  "auto",
  "dry",
  "fan_only",
  "heat_cool",
  "locked",
  "active",
  "detected",
  "wet",
]);

// Friendly radius presets shown in the editor; "custom" reveals a raw px field.
export const RADIUS_PRESETS: Record<string, number> = {
  eckig: 8,
  leicht_rund: 16,
  rund: 28,
};

// A curated subset of ACTIVE_STATES offered as individual override fields in
// the editor. Any state string is still accepted at runtime via YAML.
export const EDITABLE_STATE_COLOR_KEYS = [
  "on",
  "open",
  "locked",
  "home",
  "playing",
  "active",
  "detected",
  "wet",
];

// Domains that expose a controllable numeric value the optional slider can drive.
export const SLIDER_DOMAINS = new Set([
  "light",
  "cover",
  "fan",
  "input_number",
  "number",
]);

export const DEFAULT_PROGRESS_RADIUS = RADIUS.card;

export const DEFAULT_RUNNING_STATES = [
  "wash",
  "waschen",
  "spin",
  "schleudern",
  "rinse",
  "spülen",
];
export const DEFAULT_PREPARING_STATES = ["beladungserkennung"];
export const DEFAULT_DONE_STATES = ["end", "beenden"];

export const DEFAULT_PROGRESS_ACCENT = PALETTE.home;

// M3 Expressive wavy progress indicator geometry/timing.
export const WAVE_AMPLITUDE = 3.5;
export const WAVE_WAVELENGTH = 24;
export const WAVE_PHASE_SPEED = 0.09;
export const WAVE_GAP = 12;
export const WAVE_STROKE_WIDTH = 6;
export const WAVE_DOT_RADIUS = 3.5;
export const INDETERMINATE_SEGMENT_FRACTION = 0.3;
export const INDETERMINATE_CYCLE_MS = 3000;

export const DEFAULT_ENERGY_RADIUS = RADIUS.card;
export const DEFAULT_ENERGY_ACCENT = PALETTE.ok;
export const DEFAULT_ENERGY_ICON = "mdi:lightning-bolt";
// `mode: consumption` isn't electricity-specific — a gas or water meter
// entity works just as well. Picks a sensible default icon from the
// entity's device_class when the user hasn't set one explicitly.
export const ENERGY_ICON_BY_DEVICE_CLASS: Record<string, string> = {
  gas: "mdi:fire",
  water: "mdi:water",
  energy: DEFAULT_ENERGY_ICON,
};
export const DEFAULT_ENERGY_DAYS = 7;
export const ENERGY_MIN_DAYS = 3;
export const ENERGY_MAX_DAYS = 14;
export const ENERGY_BAR_TINT_PERCENT = 28;
export const ENERGY_REFRESH_MS = 15 * 60 * 1000;

export const DEFAULT_ENERGY_HOURS = 6;
export const ENERGY_MIN_HOURS = 3;
export const ENERGY_MAX_HOURS = 24;
export const ENERGY_REFRESH_HOUR_MS = 5 * 60 * 1000;
// Above this many bars, the value row and every-other x-axis label are
// dropped to avoid the hour view becoming unreadably cramped.
export const ENERGY_DENSE_BAR_THRESHOLD = 12;

export const ENERGY_SOLAR_BAR_TINT_PERCENT = 30;
export const ENERGY_FORECAST_OUTLINE_OPACITY = 55;
export const ENERGY_SOLAR_LABEL_STEP = 3;
export const ENERGY_SOLAR_COMPARISON_DAYS = 7;
export const DEFAULT_SOLAR_ICON = "mdi:solar-power-variant";

export const DEFAULT_ENERGY_MONTHS = 12;
export const ENERGY_MIN_MONTHS = 3;
export const ENERGY_MAX_MONTHS = 24;
export const ENERGY_REFRESH_MONTH_MS = 60 * 60 * 1000;
export const ENERGY_MONTH_BAR_MAX_HEIGHT = 110;
export const ENERGY_MONTH_BAR_MIN_HEIGHT = 6;
export const ENERGY_MONTH_BAR_GAP = 5;
export const ENERGY_MONTH_BAR_RADIUS = 8;
export const ENERGY_PROJECTION_OUTLINE_OPACITY = 50;
export const ENERGY_MONTH_COMPARISON_BETTER_COLOR = PALETTE.ok;
export const ENERGY_MONTH_COMPARISON_WORSE_COLOR = PALETTE.heat;

export const DEFAULT_FLOW_RADIUS = RADIUS.card;
export const DEFAULT_FLOW_ICON = "mdi:home-lightning-bolt-outline";
export const FLOW_NODE_PV_COLOR = PALETTE.solar;
export const FLOW_NODE_GRID_COLOR = PALETTE.grid;
export const FLOW_NODE_HOME_COLOR = PALETTE.home;
export const FLOW_NODE_BATTERY_COLOR = PALETTE.ok;
export const FLOW_SELF_SUFFICIENCY_COLOR = PALETTE.ok;
export const FLOW_REFRESH_MS = 5 * 60 * 1000;
export const FLOW_NODE_SIZE = 72;
export const FLOW_NODE_RX = 26;
export const FLOW_MIN_STROKE = 4;
export const FLOW_MAX_STROKE = 20;

type FlowSpeedKey = "slow" | "normal" | "fast";
export const FLOW_DOT_DURATION_MS: Record<FlowSpeedKey, number> = {
  slow: 3600,
  normal: 2400,
  fast: 1200,
};

export const DEFAULT_GAUGE_RADIUS = RADIUS.card;
export const DEFAULT_GAUGE_SEGMENT_A = PALETTE.grid;
export const DEFAULT_GAUGE_SEGMENT_B = PALETTE.ok;
export const GAUGE_GAP_DEGREES = 7;
export const GAUGE_STROKE_WIDTH = 18;
export const GAUGE_BOX_WIDTH = 240;
export const GAUGE_BOX_HEIGHT = 140;

export const DEFAULT_COUNTER_RADIUS = RADIUS.card;
export const DEFAULT_COUNTER_ICON = "mdi:counter";
export const DEFAULT_COUNTER_ACCENT = PALETTE.home;
export const DEFAULT_COUNTER_DECIMALS = 2;
export const DEFAULT_COUNTER_MIN_DIGITS = 5;
export const COUNTER_CELL_WIDTH = 34;
export const COUNTER_CELL_HEIGHT = 52;
export const COUNTER_CELL_NARROW_WIDTH = 26;
export const COUNTER_CELL_NARROW_HEIGHT = 42;
export const COUNTER_CELL_GAP = 3;
export const COUNTER_CELL_RADIUS = 12;
export const COUNTER_DIGIT_FONT_SIZE = 24;
export const COUNTER_DIGIT_FONT_SIZE_NARROW = 18;
export const COUNTER_NARROW_BREAKPOINT = 340;
export const COUNTER_ROLL_DURATION_MS = DURATION_MS.roll;
export const COUNTER_ROLL_STAGGER_MS = 180;
export const COUNTER_POWER_CHIP_COLOR = PALETTE.ok;

export const DEFAULT_POWER_LIST_RADIUS = RADIUS.card;
export const DEFAULT_POWER_LIST_ICON = "mdi:power-socket-de";
export const DEFAULT_POWER_LIST_ACCENT = PALETTE.home;
export const DEFAULT_POWER_LIST_PRODUCER_COLOR = PALETTE.solar;
export const DEFAULT_POWER_LIST_THRESHOLD = 1;
export const POWER_LIST_ROW_HEIGHT = HEIGHT.rowStandard;
export const POWER_LIST_ROW_RADIUS = RADIUS.row;
export const POWER_LIST_ROW_RADIUS_ACTIVE = RADIUS.rowActive;
export const POWER_LIST_IDLE_ROW_HEIGHT = 40;
export const POWER_LIST_IDLE_ROW_RADIUS = 14;
export const POWER_LIST_TOGGLE_HEIGHT = HEIGHT.toggle;
export const POWER_LIST_TOGGLE_RADIUS = RADIUS.row;
export const POWER_LIST_TOGGLE_RADIUS_OPEN = 14;
export const POWER_LIST_ICON_SIZE = 32;
export const POWER_LIST_ICON_RADIUS = RADIUS.squircle32;
export const POWER_LIST_ROW_GAP = SPACING.rowGap;
export const POWER_LIST_FLIP_DURATION_MS = DURATION_MS.flip;

export const DEFAULT_SUMMARY_RADIUS = RADIUS.card;
export const DEFAULT_SUMMARY_EXPORT_COLOR = PALETTE.ok;
export const DEFAULT_SUMMARY_IMPORT_COLOR = PALETTE.grid;
export const DEFAULT_SUMMARY_PRODUCER_COLOR = PALETTE.solar;
export const DEFAULT_SUMMARY_NEUTRAL_COLOR = PALETTE.off;
export const DEFAULT_SUMMARY_ZERO_THRESHOLD = 10;
export const DEFAULT_SUMMARY_KW_THRESHOLD = 1000;
export const SUMMARY_MAIN_ICON_SIZE = 52;
export const SUMMARY_MAIN_ICON_RADIUS = RADIUS.squircle52;
export const SUMMARY_CHIP_RADIUS = RADIUS.chip;
export const SUMMARY_SPLIT_BAR_HEIGHT = 12;
export const SUMMARY_SPLIT_BAR_RADIUS = 6;
export const SUMMARY_SPLIT_BAR_GAP = 3;
export const SUMMARY_METRIC_RADIUS = RADIUS.row;
export const SUMMARY_METRIC_RADIUS_ACTIVE = RADIUS.rowActive;
export const SUMMARY_METRIC_ICON_SIZE = 28;
export const SUMMARY_METRIC_ICON_RADIUS = RADIUS.squircle28;
export const SUMMARY_METRIC_MIN_WIDTH = 96;
export const SUMMARY_VALUE_LERP_MS = DURATION_MS.flip;

export const DEFAULT_TOP_CONSUMERS_RADIUS = RADIUS.card;
export const DEFAULT_TOP_CONSUMERS_ICON = "mdi:trophy-outline";
export const DEFAULT_TOP_CONSUMERS_ACCENT = PALETTE.home;
export const DEFAULT_TOP_CONSUMERS_COUNT = 3;
export const TOP_CONSUMERS_MIN_COUNT = 3;
export const TOP_CONSUMERS_MAX_COUNT = 15;
export const TOP_CONSUMERS_ROW_HEIGHT = HEIGHT.rowStandard;
export const TOP_CONSUMERS_ROW_RADIUS = RADIUS.row;
export const TOP_CONSUMERS_ROW_RADIUS_ACTIVE = RADIUS.rowActive;
export const TOP_CONSUMERS_ICON_SIZE = 32;
export const TOP_CONSUMERS_ICON_RADIUS = RADIUS.squircle32;
export const TOP_CONSUMERS_ROW_GAP = SPACING.rowGap;
export const TOP_CONSUMERS_REST_ROW_HEIGHT = HEIGHT.toggle;
export const TOP_CONSUMERS_REST_ROW_RADIUS = RADIUS.row;
export const TOP_CONSUMERS_REST_ROW_RADIUS_OPEN = 12;
export const TOP_CONSUMERS_COMPACT_ROW_HEIGHT = HEIGHT.rowCompact;
export const TOP_CONSUMERS_COMPACT_ROW_RADIUS = 14;
export const TOP_CONSUMERS_FLIP_DURATION_MS = DURATION_MS.flip;
export const TOP_CONSUMERS_REFRESH_MS = 15 * 60 * 1000;
export const DEFAULT_TOP_CONSUMERS_NAME_STRIP = ["^Steckdose \\d+ - ", " Energie$"];
export const DEFAULT_TOP_CONSUMERS_PALETTE = [
  "#85b7eb",
  "#e57368",
  "#5dcaa5",
  "#8f79e0",
  "#f0a24a",
  "#e5a768",
  "#b8c4c9",
  "#dce775",
];

export const DEFAULT_COST_RADIUS = RADIUS.card;
export const DEFAULT_COST_ICON = "mdi:cash-multiple";
export const DEFAULT_COST_ACCENT = PALETTE.solar;
export const DEFAULT_COST_CURRENCY = "EUR";
export const COST_MAIN_ICON_SIZE = 52;
export const COST_MAIN_ICON_RADIUS = RADIUS.squircle52;
export const COST_CHIP_RADIUS = RADIUS.chip;
export const COST_BETTER_COLOR = PALETTE.ok;
export const COST_WORSE_COLOR = PALETTE.heat;
export const COST_BAR_HEIGHT = 76;
export const COST_BAR_GAP = 3;
export const COST_BAR_RADIUS = 5;
export const COST_BAR_MIN_HEIGHT = 5;
export const COST_TARIFF_ROW_HEIGHT = HEIGHT.rowStandard;
export const COST_TARIFF_ROW_RADIUS = RADIUS.row;
export const COST_TARIFF_ICON_SIZE = 30;
export const COST_TARIFF_ICON_RADIUS = RADIUS.squircle30;
export const COST_STEPPER_WIDTH = 44;
export const COST_STEPPER_HEIGHT = 52;
export const COST_STEPPER_RADIUS_OUTER = 26;
export const COST_STEPPER_RADIUS_INNER = 10;
export const COST_REFRESH_MS = 15 * 60 * 1000;

export const DEFAULT_LIGHT_RADIUS = RADIUS.card;
export const DEFAULT_LIGHT_ICON = "mdi:lightbulb";
export const DEFAULT_LIGHT_ACCENT = "#ffc773";
export const LIGHT_OFF_COLOR = PALETTE.off;
export const LIGHT_POWER_BTN_SIZE = 44;
export const LIGHT_POWER_BTN_RADIUS_ON = 22;
export const LIGHT_POWER_BTN_RADIUS_OFF = 15;
export const LIGHT_WAVE_HEIGHT = 56;
export const LIGHT_WAVE_AMPLITUDE = 4.5;
export const LIGHT_WAVE_WAVELENGTH = 26;
export const LIGHT_WAVE_PHASE_SPEED = 0.05;
export const LIGHT_WAVE_STROKE = 14;
export const LIGHT_WAVE_GAP = 14;
export const LIGHT_WAVE_AMPLITUDE_LERP = 0.12;
export const LIGHT_HANDLE_WIDTH = 6;
export const LIGHT_HANDLE_HEIGHT = 34;
export const LIGHT_HANDLE_RADIUS = 3;
export const LIGHT_THROTTLE_MS = 200;
export const LIGHT_DRAG_SETTLE_MS = 500;
export const LIGHT_MIN_BRIGHTNESS_PCT = 1;

// Fallback kelvin range for entities that don't report
// min/max_color_temp_kelvin (rare, but some legacy integrations only expose
// mireds or nothing at all).
export const LIGHT_COLOR_TEMP_MIN_KELVIN = 2000;
export const LIGHT_COLOR_TEMP_MAX_KELVIN = 6500;
export const LIGHT_COLOR_TEMP_PRESET_WARM = 2700;
export const LIGHT_COLOR_TEMP_PRESET_NEUTRAL = 4000;
export const LIGHT_COLOR_TEMP_PRESET_COLD = 6500;

export const LIGHT_WHEEL_SIZE = 160;
export const LIGHT_WHEEL_HANDLE_SIZE = 22;
export const LIGHT_PALETTE_SWATCH_SIZE = 32;
export const LIGHT_SCENE_CHIP_HEIGHT = 34;
export const LIGHT_MEMBER_ROW_HEIGHT = 44;

export const DEFAULT_BATTERY_RADIUS = RADIUS.card;
export const DEFAULT_BATTERY_ICON_OK = "mdi:battery-70";
export const DEFAULT_BATTERY_ICON_CRITICAL = "mdi:battery-alert-variant-outline";
export const DEFAULT_BATTERY_THRESHOLD_CRITICAL = 10;
export const DEFAULT_BATTERY_THRESHOLD_LOW = 20;
export const DEFAULT_BATTERY_THRESHOLD_MEDIUM = 40;
export const BATTERY_COLOR_CRITICAL = PALETTE.heat;
export const BATTERY_COLOR_LOW = PALETTE.solar;
export const BATTERY_COLOR_MEDIUM = PALETTE.light;
export const BATTERY_COLOR_OK = PALETTE.ok;
export const BATTERY_COLOR_UNAVAILABLE = PALETTE.off;
export const BATTERY_ROW_HEIGHT = HEIGHT.rowTall;
export const BATTERY_ROW_RADIUS = RADIUS.row;
export const BATTERY_ROW_RADIUS_ACTIVE = RADIUS.rowActive;
export const BATTERY_ICON_SIZE = 32;
export const BATTERY_ICON_RADIUS = RADIUS.squircle32;
export const BATTERY_ROW_GAP = SPACING.rowGap;
export const BATTERY_BAR_HEIGHT = 6;
export const BATTERY_BAR_RADIUS = 3;
export const BATTERY_BAR_MIN_WIDTH = 6;
export const BATTERY_CHIP_RADIUS = RADIUS.chip;
export const BATTERY_COMPACT_ROW_HEIGHT = HEIGHT.rowCompact;
export const BATTERY_COMPACT_ROW_RADIUS = 14;
export const BATTERY_TOGGLE_HEIGHT = HEIGHT.toggle;
export const BATTERY_TOGGLE_RADIUS = RADIUS.row;
export const BATTERY_TOGGLE_RADIUS_OPEN = 14;
export const BATTERY_FLIP_DURATION_MS = DURATION_MS.flip;
export const DEFAULT_BATTERY_NAME_STRIP = [
  " Battery Level$",
  " Batteriestand$",
  " Battery$",
  " Batterie$",
];

// ---- Weather card -----------------------------------------------------------
export const DEFAULT_WEATHER_RADIUS = RADIUS.card;
export const DEFAULT_WEATHER_HOURS = 12;
export const DEFAULT_WEATHER_DAYS = 0;
export const DEFAULT_WEATHER_ACCENT = PALETTE.solar;
export const DEFAULT_WEATHER_PRECIPITATION_COLOR = "#6ba7dc";
export const DEFAULT_WEATHER_CHIPS: WeatherChipType[] = [
  "apparent_temperature",
  "wind_speed",
  "humidity",
];
export const WEATHER_HEADER_ICON_SIZE = 56;
export const WEATHER_HEADER_ICON_RADIUS = RADIUS.squircle56;
export const WEATHER_TEMP_FONT_SIZE = 34;
export const WEATHER_CHIP_HEIGHT = 30;
export const WEATHER_CHIP_RADIUS = RADIUS.chip;
export const WEATHER_DAY_ROW_HEIGHT = 44;
export const WEATHER_DAY_ROW_RADIUS = RADIUS.row;
export const WEATHER_PRECIP_BAR_MAX_HEIGHT = 28;
export const WEATHER_PRECIP_BAR_RADIUS = 6;
export const WEATHER_PRECIP_MIN_SCALE_MM = 1;
export const WEATHER_CURVE_STROKE = 2.5;
export const WEATHER_CURVE_DRAW_MS = 600;
export const WEATHER_HOUR_DOT_STRIDE = 3;
export const WEATHER_REFRESH_MS = 15 * 60 * 1000;
export const WEATHER_CHART_HEIGHT = 130;
export const WEATHER_DAILY_COLLAPSED_COUNT = 3;
export const WEATHER_DAYS_TOGGLE_HEIGHT = HEIGHT.toggle;
export const WEATHER_DAYS_TOGGLE_RADIUS = RADIUS.row;
export const WEATHER_DAYS_TOGGLE_RADIUS_OPEN = 14;
export const WEATHER_CHART_TOP_PADDING = 30;

// ---- Presence card ------------------------------------------------------------
export const DEFAULT_PRESENCE_RADIUS = RADIUS.card;
export const DEFAULT_PRESENCE_ICON = "mdi:account-group";
export const PRESENCE_AVATAR_SIZE = 56;
export const PRESENCE_AVATAR_RADIUS = RADIUS.squircle56;
export const PRESENCE_DOT_SIZE = 14;
export const PRESENCE_DOT_RADIUS = 5;
export const PRESENCE_RING_WIDTH = 2.5;
export const PRESENCE_GRID_GAP = 10;
export const PRESENCE_GRID_MIN_COL = 84;
export const PRESENCE_COLOR_HOME = PALETTE.ok;
export const PRESENCE_COLOR_NOT_HOME = PALETTE.home;
export const PRESENCE_COLOR_ZONE = PALETTE.media;
export const PRESENCE_COLOR_UNKNOWN = "#8f8b86";

// ---- Media card -----------------------------------------------------------
export const DEFAULT_MEDIA_RADIUS = RADIUS.card;
export const DEFAULT_MEDIA_ACCENT = PALETTE.media;
export const MEDIA_ARTWORK_SIZE = 88;
export const MEDIA_ARTWORK_RADIUS = 24;
export const MEDIA_PLAY_BTN_SIZE = 56;
export const MEDIA_PLAY_BTN_RADIUS = RADIUS.squircle56;
export const MEDIA_TRANSPORT_BTN_SIZE = 44;
export const MEDIA_TRANSPORT_BTN_RADIUS = 22;
export const MEDIA_WAVE_HEIGHT = 5;
export const MEDIA_VOLUME_WAVE_HEIGHT = 44;
export const MEDIA_VOLUME_THROTTLE_MS = 200;
export const MEDIA_MUTE_BTN_HEIGHT = 40;
export const MEDIA_ARTWORK_COLOR_CACHE_SIZE = 20;
