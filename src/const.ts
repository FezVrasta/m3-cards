import type { CornerRadiusConfig, HvacMode, WeatherChipType, ClimateOverviewTempThresholds } from "./types";
import { RADIUS, HEIGHT, SPACING, DURATION_MS, PALETTE } from "./shared/tokens";

export const CARD_VERSION = "2.1.0";

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
  // German aliases for the same tokens above — editor fields are labeled in
  // German, so "grau" is a natural first guess and, unlike a real CSS color
  // name, silently invalidates the color-mix() it's used in (rendering as
  // no background at all) rather than erroring visibly.
  rot: "#e57373",
  rosa: "#f06292",
  lila: "#ba68c8",
  violett: "#ba68c8",
  blau: "#64b5f6",
  hellblau: "#4fc3f7",
  türkis: "#4dd0e1",
  tuerkis: "#4dd0e1",
  grün: "#81c784",
  gruen: "#81c784",
  hellgrün: "#aed581",
  hellgruen: "#aed581",
  gelb: "#fff176",
  braun: "#a1887f",
  grau: "#bdbdbd",
  dunkelgrau: "#616161",
  schwarz: "#000000",
  weiß: "#ffffff",
  weiss: "#ffffff",
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

// Evening default for the energy report: late enough that "today" is nearly
// complete, early enough that the push still gets read the same day. Also
// used for the month report (which fires on the 1st and reports the *closed*
// previous month, so the time of day doesn't affect its correctness).
export const DEFAULT_ENERGY_NOTIFY_TIME = "21:00:00";
// A utility_meter's cycle is derived from next_reset - last_reset; these are
// the tolerance bands that map that span onto "daily" / "monthly".

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
export const DEFAULT_POWER_LIST_NOTIFY_THRESHOLD = 10;
export const DEFAULT_POWER_LIST_NOTIFY_DURATION_HOURS = 3;
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
// Warn at 90 % of the budget: early enough to still react, late enough not to
// cry wolf every month.
export const DEFAULT_COST_NOTIFY_PERCENT = 90;
// Late on the last day of the month — the month-to-date counter resets at
// midnight, so the report has to run before that.
export const DEFAULT_COST_NOTIFY_TIME = "23:55:00";
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
// Wave geometry mirrors the progress-card ("washing machine") bar so it reads
// as a clean wave, not a thick lump: a slim 6px stroke over a 3.5px-amplitude,
// 24px-wavelength sine. (Was 14px/4.5/26 — the fat stroke swallowed the wave.)
export const LIGHT_WAVE_AMPLITUDE = 3.5;
export const LIGHT_WAVE_WAVELENGTH = 24;
export const LIGHT_WAVE_PHASE_SPEED = 0.09;
export const LIGHT_WAVE_STROKE = 6;
export const LIGHT_WAVE_GAP = 12;
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
// Deliberately lower than the "critical" display stage: the card colors a
// battery red well before it dies, but a push notification should only fire
// when it actually needs swapping.
export const DEFAULT_BATTERY_NOTIFY_THRESHOLD = 1;
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

// ---- Presence card ------------------------------------------------------------
export const DEFAULT_PRESENCE_RADIUS = RADIUS.card;
export const DEFAULT_PRESENCE_ICON = "mdi:account-group";
export const PRESENCE_AVATAR_SIZE = 56;
export const PRESENCE_AVATAR_RADIUS = RADIUS.squircle56;
export const PRESENCE_DOT_SIZE = 14;
export const PRESENCE_RING_WIDTH = 2.5;
export const PRESENCE_GRID_GAP = 10;
export const PRESENCE_GRID_MIN_COL = 84;
export const PRESENCE_COLOR_HOME = PALETTE.ok;
export const PRESENCE_COLOR_NOT_HOME = PALETTE.home;
export const PRESENCE_COLOR_ZONE = PALETTE.media;
export const PRESENCE_COLOR_UNKNOWN = "#8f8b86";

// ---- Climate overview card --------------------------------------------------
export const DEFAULT_CLIMATE_OVERVIEW_RADIUS = RADIUS.card;
export const DEFAULT_CLIMATE_OVERVIEW_ICON = "mdi:thermometer";
export const CLIMATE_OVERVIEW_GRID_GAP = 8;
export const CLIMATE_OVERVIEW_GRID_MIN_COL = 104;
export const CLIMATE_OVERVIEW_TILE_RADIUS = 18;
export const DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS: Required<ClimateOverviewTempThresholds> = {
  cold: 19,
  cool: 20.5,
  comfortable: 23.5,
  warm: 25,
};
export const DEFAULT_CLIMATE_OVERVIEW_HUMIDITY_RANGE: [number, number] = [35, 65];
export const CLIMATE_OVERVIEW_COLOR_COLD = PALETTE.cool;
export const CLIMATE_OVERVIEW_COLOR_COOL = "#7fc4d6";
export const CLIMATE_OVERVIEW_COLOR_COMFORTABLE = PALETTE.dryAuto;
export const CLIMATE_OVERVIEW_COLOR_WARM = PALETTE.light;
export const CLIMATE_OVERVIEW_COLOR_HOT = PALETTE.heat;
export const CLIMATE_OVERVIEW_HUMIDITY_WARN_COLOR = PALETTE.solar;
export const DEFAULT_CLIMATE_OVERVIEW_NAME_STRIP = [
  " Temperature$",
  " Temperatur$",
  "^Thermometer\\s*\\d*\\s*-?\\s*",
  "^Thermostat\\s+",
];
export const CLIMATE_OVERVIEW_SCALE_MIN_SPAN = 8;
/**
 * Label sizing for the comparison scale. Widths are estimated rather than
 * measured per label: at 9px the average glyph is about 5px, and the estimate
 * only has to be good enough to decide whether two names collide.
 */
export const CLIMATE_OVERVIEW_LABEL_CHAR_PX = 5;
export const CLIMATE_OVERVIEW_LABEL_MAX_PX = 70;
export const CLIMATE_OVERVIEW_LABEL_GAP_PX = 8;
export const CLIMATE_OVERVIEW_DOT_SIZE = 14;
export const CLIMATE_OVERVIEW_DOT_RADIUS = 5;
export const CLIMATE_OVERVIEW_DOT_TRANSITION_MS = DURATION_MS.flip;
export const CLIMATE_OVERVIEW_CHIP_RADIUS = RADIUS.chip;
export const CLIMATE_OVERVIEW_TREND_REFRESH_MS = 15 * 60 * 1000;
export const CLIMATE_OVERVIEW_TREND_THRESHOLD_K = 0.5;
export const CLIMATE_OVERVIEW_MOLD_HUMIDITY_THRESHOLD = 65;
export const CLIMATE_OVERVIEW_MOLD_TEMP_THRESHOLD = 18;

// ---- Media card -----------------------------------------------------------
export const DEFAULT_MEDIA_RADIUS = RADIUS.card;
export const DEFAULT_MEDIA_ACCENT = PALETTE.media;
export const MEDIA_ARTWORK_SIZE = 88;
export const MEDIA_ARTWORK_RADIUS = 24;
// Transport bar. The play/pause button is the row's state indicator: a
// squircle while playing, morphing to a full circle when paused. Every icon is
// an inline SVG (see shared/icons.ts), so the icon sizes are explicit here
// rather than coming from --mdc-icon-size.
export const MEDIA_PLAY_BTN_SIZE = 62;
export const MEDIA_PLAY_BTN_RADIUS_PLAYING = 22;
export const MEDIA_PLAY_BTN_RADIUS_PAUSED = MEDIA_PLAY_BTN_SIZE / 2;
export const MEDIA_PLAY_ICON_SIZE = 30;
export const MEDIA_TRANSPORT_BTN_SIZE = 48;
export const MEDIA_TRANSPORT_BTN_RADIUS = 24;
export const MEDIA_TRANSPORT_ICON_SIZE = 24;
export const MEDIA_PILL_BTN_SIZE = 40;
export const MEDIA_PILL_BTN_RADIUS = 20;
export const MEDIA_PILL_ICON_SIZE = 20;
// The play/pause glyph cross-fades over the same duration as the radius morph,
// so the button reads as one gesture rather than two overlapping ones.
export const MEDIA_ICON_MORPH_MS = 350;
// Playback progress is a wavy indicator in the progress-card ("washing
// machine") form: a wave for the elapsed part, a gap, a straight track, and a
// dot at the far end. The wave flattens to a straight line when playback is
// paused, so the bar itself carries the play state.
export const MEDIA_PROGRESS_HEIGHT = 20;
export const MEDIA_PROGRESS_STROKE = 5;
export const MEDIA_PROGRESS_AMPLITUDE = 2.6;
export const MEDIA_PROGRESS_WAVELENGTH = 20;
export const MEDIA_PROGRESS_GAP = 8;
export const MEDIA_PROGRESS_DOT_RADIUS = 4;
export const MEDIA_PROGRESS_HANDLE_RADIUS = 6;
// Per-frame easing of the amplitude toward its target, matching the light
// card's wave. Low enough that pausing reads as the wave settling flat rather
// than snapping.
export const MEDIA_PROGRESS_AMPLITUDE_LERP = 0.1;
export const MEDIA_PROGRESS_PHASE_SPEED = 0.06;
// A stream with no duration cannot show a position, so a short segment of
// wave travels the bar instead.
export const MEDIA_INDETERMINATE_FRACTION = 0.28;
export const MEDIA_INDETERMINATE_CYCLE_MS = 2200;
// Seeks are throttled while dragging so a scrub does not flood the player.
export const MEDIA_SEEK_THROTTLE_MS = 200;
// Every transport button briefly morphs to this radius when tapped.
export const MEDIA_PRESS_RADIUS = 14;
export const MEDIA_VOLUME_WAVE_HEIGHT = 44;
// Wavy volume bar geometry, matching the progress-card ("washing machine")
// form: a visible wave, a gap, a straight track, and a round end-dot.
export const MEDIA_VOLUME_AMPLITUDE = 3.5;
export const MEDIA_VOLUME_WAVELENGTH = 24;
export const MEDIA_VOLUME_GAP = 10;
export const MEDIA_VOLUME_DOT_RADIUS = 4;
export const MEDIA_VOLUME_THROTTLE_MS = 200;
export const MEDIA_MUTE_BTN_HEIGHT = 40;
export const MEDIA_ARTWORK_COLOR_CACHE_SIZE = 20;
// Artwork is sampled at this resolution before the dominant colour is picked.
export const MEDIA_ARTWORK_SAMPLE_SIZE = 32;
// Hue is bucketed at 20° so shades of one colour count as the same hue.
export const MEDIA_ARTWORK_HUE_BUCKETS = 18;
// Pixels outside this lightness band are backdrop, not subject: near-black and
// near-white dominate most covers by area and say nothing about their colour.
export const MEDIA_ARTWORK_MIN_LIGHTNESS = 0.12;
export const MEDIA_ARTWORK_MAX_LIGHTNESS = 0.92;
// Below this saturation a pixel counts as grey and carries no hue vote.
export const MEDIA_ARTWORK_MIN_SATURATION = 0.15;
// The accent is distributed as a CSS variable; the properties that consume it
// cross-fade over this so buttons and waves never jump on a track change.
export const MEDIA_ACCENT_FADE_MS = 400;

// Meta chips under the title. Deliberately shorter than the suite's standard
// chip (RADIUS.chip / 15px) — these sit directly under two text lines and a
// full-height chip would crowd them.
export const MEDIA_CHIP_HEIGHT = 24;
export const MEDIA_CHIP_RADIUS = 9;

// Browser section (queue + library). The toggle row is the same shape as the
// list rows elsewhere in the suite; the tab pills morph to a tighter radius
// when active, like the todo card's chips.
export const MEDIA_BROWSE_TOGGLE_HEIGHT = 44;
export const MEDIA_BROWSE_TOGGLE_RADIUS = 19;
export const MEDIA_BROWSE_TAB_HEIGHT = 32;
export const MEDIA_BROWSE_TAB_RADIUS = 16;
export const MEDIA_BROWSE_TAB_RADIUS_ACTIVE = 10;
export const MEDIA_BROWSE_ROW_HEIGHT = 46;
export const MEDIA_BROWSE_ROW_RADIUS = 15;
export const MEDIA_BROWSE_ROW_ICON_SIZE = 32;
export const MEDIA_BROWSE_ROW_ICON_RADIUS = RADIUS.squircle32;
export const DEFAULT_MEDIA_BROWSE_HEIGHT = 190;
// Skeleton rows shown while a browse level loads — a fixed count reads as a
// list taking shape, where a spinner reads as "something might be wrong".
export const MEDIA_BROWSE_SKELETON_ROWS = 4;
// A directory can hold thousands of entries (a real library here has 2147
// artist folders); rendering them all locks the frame. Rows beyond this are
// reachable by drilling in, not by scrolling forever.
export const MEDIA_BROWSE_MAX_ROWS = 100;
// Minimum WCAG contrast the accent must reach against the dark on-accent ink.
// Artwork-derived accents are NOT guaranteed to be light pastels the way the
// built-in palette is, so the extracted color is lightened until a filled
// button's glyph is actually legible. 3:1 is the AA bar for large graphics.
export const MEDIA_ACCENT_MIN_CONTRAST = 3.2;

// ---- Aquarium card ----------------------------------------------------------
export const DEFAULT_AQUARIUM_RADIUS = RADIUS.card;
export const DEFAULT_AQUARIUM_ICON = "mdi:fishbowl-outline";
export const DEFAULT_AQUARIUM_ACCENT = PALETTE.dryAuto;
export const DEFAULT_AQUARIUM_TARGET_RANGE: [number, number] = [24, 26];
export const DEFAULT_AQUARIUM_CLEANING_INTERVAL_DAYS = 14;
export const DEFAULT_AQUARIUM_CAMERA_REFRESH_S = 10;
// Deliberately deviates from the shared squircle scale (tokens.ts only has
// 44/16) — the reference design's header icon is a size/radius pair unique
// to this card.
export const AQUARIUM_HEADER_ICON_SIZE = 46;
export const AQUARIUM_HEADER_ICON_RADIUS = 17;
export const AQUARIUM_TILE_GAP = 6;
export const AQUARIUM_TILE_MIN_COL = 64;
export const AQUARIUM_TILE_RADIUS_OFF = 19;
export const AQUARIUM_TILE_RADIUS_ON = 13;
export const AQUARIUM_TILE_ICON_BOX = 28;
export const AQUARIUM_TILE_ICON_RADIUS_OFF = 14;
export const AQUARIUM_TILE_ICON_RADIUS_ON = 9;
export const AQUARIUM_TILE_MORPH_MS = 350;
export const AQUARIUM_WATER_COLOR_OK = PALETTE.dryAuto;
export const AQUARIUM_WATER_COLOR_BELOW = PALETTE.cool;
export const AQUARIUM_WATER_COLOR_ABOVE = PALETTE.light;
export const AQUARIUM_WATER_COLOR_WARN = PALETTE.heat;
export const AQUARIUM_WATER_WARN_DEVIATION_K = 1;
export const AQUARIUM_SCHEDULE_TRACK_HEIGHT = 7;
export const AQUARIUM_SCHEDULE_TRACK_RADIUS = 3.5;
export const AQUARIUM_SCHEDULE_MARKER_WIDTH = 4;
export const AQUARIUM_SCHEDULE_MARKER_HEIGHT = 17;
export const AQUARIUM_SCHEDULE_MARKER_RADIUS = 2;
export const AQUARIUM_SCHEDULE_REFRESH_MS = 60 * 1000;
export const AQUARIUM_CAMERA_BANNER_RADIUS = 20;
export const AQUARIUM_CAMERA_BANNER_PADDING = 10;
export const AQUARIUM_CAMERA_THUMB_SIZE = 56;
export const AQUARIUM_CAMERA_THUMB_RADIUS = 19;
export const AQUARIUM_CAMERA_THUMB_RADIUS_ACTIVE = 13;
export const AQUARIUM_CAMERA_LIVE_DOT_SIZE = 8;
export const AQUARIUM_CAMERA_EXPAND_MS = 350;
export const AQUARIUM_CAMERA_BADGE_HEIGHT = 24;
export const AQUARIUM_CAMERA_BADGE_RADIUS = 9;
export const AQUARIUM_CAMERA_CHIP_HEIGHT = 28;
export const AQUARIUM_CAMERA_CHIP_RADIUS = 11;
export const AQUARIUM_CHIP_HEIGHT = 28;
export const AQUARIUM_CHIP_RADIUS = 14;
export const AQUARIUM_CHIP_MAX = 4;
export const DEFAULT_AQUARIUM_DEVICE_COLORS = {
  light_day: PALETTE.light,
  light_night: PALETTE.grid,
  pump: PALETTE.cool,
  heater: PALETTE.heat,
  co2: PALETTE.dryAuto,
  cleaning: PALETTE.cover,
  camera: PALETTE.media,
} as const;

export const DEFAULT_UPDATES_RADIUS = RADIUS.card;
export const DEFAULT_UPDATES_ICON = "mdi:package-up";
export const DEFAULT_UPDATES_MAX_VISIBLE = 5;
export const DEFAULT_UPDATES_BACKUP_WARN_DAYS = 7;

export const UPDATES_COLOR_OK = "#81c784";
export const UPDATES_COLOR_AVAILABLE = "#85b7eb";
export const UPDATES_COLOR_ADDON = "#a58fe8";
export const UPDATES_COLOR_HACS = "#5dcaa5";
export const UPDATES_COLOR_FIRMWARE = "#f0a24a";
export const UPDATES_COLOR_REMOTE = "#8fa3b8";
export const UPDATES_COLOR_BACKUP_WARN = "#f0a24a";
export const UPDATES_COLOR_BACKUP_MISSING = "#e57368";

export const UPDATES_CHIP_HEIGHT = 30;
export const UPDATES_CHIP_RADIUS = 15;
export const UPDATES_CORE_PADDING = 13;
export const UPDATES_CORE_RADIUS = 20;
export const UPDATES_CORE_ICON_SIZE = 38;
export const UPDATES_CORE_ICON_RADIUS = 14;
export const UPDATES_ROW_HEIGHT = 48;
export const UPDATES_ROW_RADIUS = 16;
export const UPDATES_ROW_ICON_SIZE = 30;
export const UPDATES_ROW_ICON_RADIUS = 11;
export const UPDATES_TOGGLE_HEIGHT = 44;
export const UPDATES_TOGGLE_RADIUS = 18;
export const UPDATES_COMPACT_ROW_HEIGHT = 36;
export const UPDATES_COMPACT_ROW_RADIUS = 14;
// ---- M3 NAS Card ----------------------------------------------------
export const DEFAULT_NAS_RADIUS = RADIUS.card;
export const DEFAULT_NAS_ICON = "mdi:nas";
export const DEFAULT_NAS_MAX_VISIBLE = 4;
/** Percent full at which a volume turns amber / red. */
export const DEFAULT_NAS_DISK_WARN = 80;
export const DEFAULT_NAS_DISK_CRITICAL = 90;
/** Drive temperature considered warm / hot, in °C. */
export const DEFAULT_NAS_TEMP_WARN = 55;
export const DEFAULT_NAS_TEMP_CRITICAL = 65;

export const NAS_COLOR_OK = "#81c784";
export const NAS_COLOR_WARN = "#f0a24a";
export const NAS_COLOR_CRITICAL = "#e57368";
export const NAS_COLOR_OFFLINE = "#8fa3b8";
export const NAS_COLOR_ACCENT = "#85b7eb";

export const NAS_ROW_HEIGHT = 52;
export const NAS_ROW_RADIUS = 18;
export const NAS_ROW_RADIUS_ACTIVE = 12;
export const NAS_ICON_SIZE = 34;
export const NAS_ICON_RADIUS = 12;
export const NAS_ROW_GAP = 6;
export const NAS_TILE_RADIUS = 16;
export const NAS_TILE_PADDING = 10;
export const NAS_TOGGLE_HEIGHT = 44;
export const NAS_TOGGLE_RADIUS = 18;
export const DEFAULT_NAS_NOTIFY_DISK = 90;
/** How long Glances must stay silent before the NAS counts as offline. */
export const DEFAULT_NAS_OFFLINE_MINUTES = 10;

export const UPDATES_BUTTON_SIZE = 38;
export const UPDATES_BUTTON_RADIUS = 19;
/** Radius the install button morphs to while it runs. */
export const UPDATES_BUTTON_RADIUS_BUSY = 12;
export const UPDATES_PROGRESS_HEIGHT = 3;
/** How long an armed "are you sure?" button stays armed. */
export const UPDATES_CONFIRM_TIMEOUT_MS = 5000;

// Default display order; group_order may override it.
export const UPDATES_GROUP_ORDER = [
  "core", "os", "supervisor", "addon", "hacs", "firmware", "remote", "other",
] as const;

// Zigbee/device firmware flashing can brick hardware, so these are listed
// read-only by default and installed deliberately from the device page.
export const DEFAULT_UPDATES_NO_INSTALL: string[] = ["firmware"];

// ---- Supply card ----------------------------------------------------------
export const DEFAULT_SUPPLY_RADIUS = RADIUS.card;
export const DEFAULT_SUPPLY_ICON = "mdi:package-variant-closed";
export const DEFAULT_SUPPLY_PACK_SIZE = 24;
// Reference design: the hero header uses a slightly larger squircle than the
// shared 44px card-header, matching the cost/summary "hero" scale.
export const SUPPLY_HERO_ICON_SIZE = 46;
export const SUPPLY_HERO_ICON_RADIUS = 17;
export const SUPPLY_ROW_HEIGHT = 48;
export const SUPPLY_ROW_RADIUS = 16;
export const SUPPLY_ICON_SIZE = 30;
export const SUPPLY_ICON_RADIUS = RADIUS.squircle30;
export const SUPPLY_ROW_GAP = SPACING.rowGap;
// Above this pack size a per-unit dot row stops being readable (dots get
// thinner than their gap), so the hero switches to a single filled bar.
export const SUPPLY_DOTS_MAX = 40;
export const SUPPLY_DOT_HEIGHT = 12;
export const SUPPLY_DOT_RADIUS = 4;
export const SUPPLY_DOT_GAP = 3;
export const SUPPLY_BAR_HEIGHT = 12;
export const SUPPLY_BAR_RADIUS = 6;
export const SUPPLY_ACTION_HEIGHT = 52;
export const SUPPLY_ACTION_GAP = 8;
export const SUPPLY_STEPPER_WIDTH = 56;
// Asymmetric stepper corners, mirrored left/right around the centre button —
// same shape language as the climate card's temperature stepper.
export const SUPPLY_STEPPER_RADIUS_OUTER = 26;
export const SUPPLY_STEPPER_RADIUS_INNER = 11;
export const SUPPLY_REFILL_RADIUS = 11;
export const SUPPLY_REFILL_RADIUS_ACTIVE = 22;
export const SUPPLY_REFILL_MORPH_MS = 400;
export const SUPPLY_REPEAT_MS = 300;
export const SUPPLY_COLOR_OK = PALETTE.home;
export const SUPPLY_COLOR_LOW = PALETTE.solar;
export const SUPPLY_COLOR_CRITICAL = PALETTE.heat;
export const SUPPLY_COLOR_UNAVAILABLE = PALETTE.off;
// Fractions of pack_size used when an item sets no explicit thresholds.
export const SUPPLY_LOW_FRACTION = 0.25;
export const SUPPLY_CRITICAL_FRACTION = 0.1;
// A floor of 1, not 3: with a floor of 3 every pack of 30 or fewer would sit
// at "critical" from the moment it is opened — a 4-filter pack would never
// leave the red state at all.
export const SUPPLY_CRITICAL_FLOOR = 1;
export const SUPPLY_DEFAULT_RATE_WINDOW_DAYS = 30;
// Below this many observed decrements the sample is too thin to extrapolate
// a range from, so the subtitle falls back to a plain "{n} of {max}".
export const SUPPLY_MIN_EVENTS = 3;
// Three taps on "−" in one sitting satisfy MIN_EVENTS but span minutes, and
// dividing by minutes yields a rate of hundreds per day. An estimate needs to
// have watched for at least this long before it means anything.
export const SUPPLY_MIN_SPAN_DAYS = 2;
// Consumption shifts over days, not minutes; the counter value itself already
// updates live via hass, so re-reading history hourly is more than enough.
export const SUPPLY_RATE_REFRESH_MS = 60 * 60 * 1000;
// Hero swap: rows glide to their new slot while the new hero fades in. Shares
// the suite's FLIP duration so reordering feels the same across every card.
export const SUPPLY_FLIP_DURATION_MS = DURATION_MS.flip;
export const SUPPLY_CHIP_RADIUS = RADIUS.chip;

// ---- Todo card ------------------------------------------------------------
export const DEFAULT_TODO_RADIUS = RADIUS.card;
export const DEFAULT_TODO_ICON = "mdi:cart-outline";
export const DEFAULT_TODO_ACCENT = PALETTE.dryAuto;
export const TODO_HEADER_ICON_SIZE = 46;
export const TODO_HEADER_ICON_RADIUS = 17;
export const TODO_COUNT_CHIP_SIZE = 30;
export const TODO_COUNT_CHIP_RADIUS = RADIUS.chip;
// Input field and its add button share a height so the row reads as one unit.
export const TODO_INPUT_HEIGHT = 50;
export const TODO_INPUT_RADIUS = 25;
export const TODO_INPUT_RADIUS_FOCUS = 16;
export const TODO_ADD_BUTTON_SIZE = 50;
export const TODO_ADD_BUTTON_RADIUS = 18;
export const TODO_ADD_BUTTON_RADIUS_ACTIVE = 12;
export const TODO_ROW_HEIGHT = 50;
export const TODO_ROW_RADIUS = 17;
export const TODO_ROW_GAP = SPACING.rowGap;
export const TODO_CHECK_SIZE = 24;
// The checkbox morphs from a ring (circle) to a filled squircle when ticked.
export const TODO_CHECK_RADIUS_OPEN = 12;
export const TODO_CHECK_RADIUS_DONE = 7;
export const TODO_CHECK_MORPH_MS = 350;
export const TODO_TOGGLE_HEIGHT = 42;
export const TODO_TOGGLE_RADIUS = 18;
export const TODO_TOGGLE_RADIUS_OPEN = 12;
export const TODO_DONE_ROW_HEIGHT = 40;
export const TODO_DONE_ROW_RADIUS = 14;
export const TODO_QUICK_CHIP_HEIGHT = 30;
export const TODO_QUICK_CHIP_RADIUS = RADIUS.chip;
export const TODO_QUICK_CHIP_RADIUS_ACTIVE = 9;
export const TODO_QUICK_MORPH_MS = 400;
export const TODO_DEFAULT_MAX_QUICK_ADD = 4;
// How long "clear completed" stays armed after the first tap before it
// quietly disarms itself again.
export const TODO_CLEAR_ARM_MS = 4000;
// Long press to rename. Long enough not to fire on a normal tap-to-tick,
// short enough not to feel like the card is ignoring you.
export const TODO_LONG_PRESS_MS = 500;

// ---- Time card ------------------------------------------------------------
export const DEFAULT_TIME_RADIUS = RADIUS.card;
export const DEFAULT_TIME_ICON = "mdi:clock-outline";
export const DEFAULT_TIME_ACCENT = PALETTE.home;
export const DEFAULT_TIME_MINUTE_STEP = 5;
export const TIME_MINUTE_STEPS = [1, 5, 10, 15, 30] as const;
export const TIME_HEADER_ICON_SIZE = 42;
export const TIME_HEADER_ICON_RADIUS = 15;
// Stepper column: a short button, a tall value field, a short button. The
// outer corners stay round while the inner ones tuck in, so the three read as
// one control rather than three separate buttons.
export const TIME_FIELD_WIDTH = 62;
export const TIME_FIELD_HEIGHT = 62;
export const TIME_FIELD_RADIUS = 20;
export const TIME_STEP_BUTTON_HEIGHT = 30;
export const TIME_STEP_RADIUS_OUTER = 15;
export const TIME_STEP_RADIUS_INNER = 8;
export const TIME_DIGIT_FONT_SIZE = 30;
export const TIME_SEPARATOR_FONT_SIZE = 26;
export const TIME_APPLY_HEIGHT = 46;
export const TIME_APPLY_RADIUS = 23;
export const TIME_APPLY_RADIUS_ACTIVE = 14;
export const TIME_APPLY_MORPH_MS = 400;
// Long press: steady at first, then faster once it is clearly a hold rather
// than a slow tap.
export const TIME_REPEAT_MS = 300;
export const TIME_REPEAT_FAST_MS = 120;
export const TIME_REPEAT_ACCELERATE_AFTER_MS = 1000;
// Below this width the 62px fields crowd the separator out.
export const TIME_NARROW_BREAKPOINT = 280;
export const TIME_FIELD_WIDTH_NARROW = 52;
// Typing digits into a field: how long a half-entered number waits for its
// second digit before it stands on its own.
export const TIME_DIGIT_BUFFER_MS = 900;
export const TIME_INSTANT_DEBOUNCE_MS = 800;
// Compact variant: header on the left, a minus/value/plus unit on the right.
// Outer corners round, inner ones tucked in, same shape logic as the stepper.
export const TIME_COMPACT_BUTTON_WIDTH = 38;
export const TIME_COMPACT_HEIGHT = 44;
export const TIME_COMPACT_RADIUS_OUTER = 22;
export const TIME_COMPACT_RADIUS_INNER = 9;
export const TIME_COMPACT_VALUE_FONT_SIZE = 20;
export const TIME_PRESET_HEIGHT = 34;
export const TIME_PRESET_RADIUS = 17;
export const TIME_PRESET_RADIUS_ACTIVE = 11;
// The compact variant defaults to a bigger jump: it is the "set it roughly"
// layout, where 5-minute steps would mean a lot of tapping.
export const DEFAULT_TIME_MINUTE_STEP_COMPACT = 15;
// Wheel variant: a 132px window over 40px entries, so three are visible and
// the middle one sits in the selection band. The 46px pads above and below
// let the first and last entry reach that band.
export const TIME_WHEEL_HEIGHT = 132;
export const TIME_WHEEL_RADIUS = 20;
export const TIME_WHEEL_ITEM_HEIGHT = 40;
export const TIME_WHEEL_PAD = 46;
export const TIME_WHEEL_BAND_RADIUS = 14;
export const TIME_WHEEL_ACTIVE_FONT_SIZE = 22;
export const TIME_WHEEL_IDLE_FONT_SIZE = 20;
// How long the wheel must sit still before its position counts as a choice.
export const TIME_WHEEL_SETTLE_MS = 140;
// Counter card: the inline "correct the reading" editor.
export const COUNTER_ADJUST_HEIGHT = 44;
export const COUNTER_ADJUST_RADIUS = 14;

// ---- Occupancy card -------------------------------------------------------
export const DEFAULT_OCCUPANCY_RADIUS = RADIUS.card;
export const DEFAULT_OCCUPANCY_ICON = "mdi:motion-sensor";
export const DEFAULT_OCCUPANCY_ACCENT = PALETTE.dryAuto;
// A dead presence sensor is worth more attention than a quiet room, so these
// strip patterns only tidy the common vendor prefixes/suffixes.
export const DEFAULT_OCCUPANCY_NAME_STRIP = [
  "^Präsenzsensor \\d+ ?",
  " Occupancy$",
  " Bewegung$",
];
export const OCCUPANCY_HEADER_ICON_SIZE = 44;
export const OCCUPANCY_TOGGLE_HEIGHT = HEIGHT.toggle;
export const OCCUPANCY_TOGGLE_RADIUS = RADIUS.row;
export const OCCUPANCY_HEADER_ICON_RADIUS = RADIUS.squircle44;
export const OCCUPANCY_ROW_RADIUS = RADIUS.row;
export const OCCUPANCY_ROW_RADIUS_ACTIVE = RADIUS.rowActive;
export const OCCUPANCY_ROW_PADDING_Y = 11;
export const OCCUPANCY_ROW_PADDING_X = 12;
export const OCCUPANCY_ROW_GAP = SPACING.rowGap;
export const OCCUPANCY_ICON_SIZE = 36;
export const OCCUPANCY_ICON_RADIUS = 13;
// The live dot that marks an occupied room, and its breathing animation.
export const OCCUPANCY_DOT_SIZE = 9;
export const OCCUPANCY_PULSE_MS = 2000;
export const OCCUPANCY_TINT_OCCUPIED = 9;
export const OCCUPANCY_TINT_FREE = 5;
export const OCCUPANCY_CHIP_RADIUS = RADIUS.chip;
export const DEFAULT_OCCUPANCY_TIMELINE_HOURS = 3;
export const DEFAULT_OCCUPANCY_TIMELINE_SEGMENTS = 24;
export const OCCUPANCY_TIMELINE_HOURS_MIN = 1;
export const OCCUPANCY_TIMELINE_HOURS_MAX = 24;
export const OCCUPANCY_SEGMENT_HEIGHT = 14;
export const OCCUPANCY_SEGMENT_RADIUS = 3;
export const OCCUPANCY_SEGMENT_GAP = 2;
export const OCCUPANCY_SEGMENT_FADED_OPACITY = 0.6;
// State changes are pushed by hass, but "seit 12 Min." only stays honest if
// the card re-renders on its own as the clock moves.
export const OCCUPANCY_TICK_MS = 60000;

// ---- Cover card -----------------------------------------------------------
export const DEFAULT_COVER_RADIUS = RADIUS.card;
export const DEFAULT_COVER_ACCENT = PALETTE.cover;
export const COVER_TILT_STEP = 15;
export const COVER_POSITION_THROTTLE_MS = 200;
export const COVER_DRAG_SETTLE_MS = 600;
export const COVER_MIN_FEEDBACK_MS = 1400;
// Cover supported_features bit flags (from HA's CoverEntityFeature).
export const COVER_FEATURE = {
  OPEN: 1,
  CLOSE: 2,
  SET_POSITION: 4,
  STOP: 8,
  OPEN_TILT: 16,
  CLOSE_TILT: 32,
  STOP_TILT: 64,
  SET_TILT_POSITION: 128,
} as const;
// device_class -> icon (open state); a "-closed" variant is not used, the
// preview carries the open/closed signal.
export const COVER_DEVICE_ICONS: Record<string, string> = {
  shutter: "mdi:window-shutter",
  blind: "mdi:blinds-horizontal",
  curtain: "mdi:curtains",
  awning: "mdi:awning-outline",
  shade: "mdi:roller-shade",
  garage: "mdi:garage",
  gate: "mdi:gate",
  door: "mdi:door",
  window: "mdi:window-closed-variant",
};
export const DEFAULT_COVER_ICON = "mdi:window-shutter";

// ---- Leak card ------------------------------------------------------------
export const DEFAULT_LEAK_RADIUS = RADIUS.card;
export const DEFAULT_LEAK_ACCENT = PALETTE.ok;
export const LEAK_ALARM_COLOR = PALETTE.heat;
export const LEAK_STALE_COLOR = PALETTE.solar;
export const DEFAULT_LEAK_STALE_HOURS = 6;
export const DEFAULT_LEAK_BATTERY_WARN = 40;
export const DEFAULT_LEAK_BATTERY_CRITICAL = 20;
export const LEAK_ROW_HEIGHT = 52;
export const LEAK_ROW_RADIUS = RADIUS.row;
export const LEAK_ROW_RADIUS_ACTIVE = RADIUS.rowActive;
export const LEAK_ICON_SIZE = 32;
export const LEAK_ICON_RADIUS = RADIUS.squircle32;
export const LEAK_ROW_GAP = SPACING.rowGap;
export const LEAK_TICK_MS = 60000;
// How long the shut-off button stays armed after the first tap, when
// confirm_shutoff is on.
export const LEAK_ARM_TIMEOUT_MS = 4000;
export const LEAK_DEFAULT_NAME_STRIP = [
  " Feuchte$",
  " Water Leak$",
  " Moisture$",
  " Wassermelder$",
  " Leak$",
];
// device_class-ish icons keyed by name hints for common leak spots.
export const LEAK_ICON_RULES: Array<[RegExp, string]> = [
  [/sp(ü|ue)le|k(ü|ue)che|kitchen|sink/i, "mdi:silverware-fork-knife"],
  [/wasch|washing|laundry/i, "mdi:washing-machine"],
  [/heiz|boiler|heating|furnace/i, "mdi:fire"],
  [/dusche|shower|bad|bath/i, "mdi:shower"],
  [/toilette|wc|toilet/i, "mdi:toilet"],
  [/keller|basement/i, "mdi:home-floor-b"],
  [/sp(ü|ue)lmaschine|dishwasher/i, "mdi:dishwasher"],
];
export const DEFAULT_LEAK_ICON = "mdi:water-outline";

// ---- Waste card -----------------------------------------------------------
export const DEFAULT_WASTE_RADIUS = RADIUS.card;
export const WASTE_TIMELINE_DAYS = 14;
// How far ahead a calendar is read. Longer than the timeline on purpose: a bin
// on a four-week cycle would otherwise be missing from the list entirely for
// most of the month, where a day-count sensor always knows its next date.
export const WASTE_CALENDAR_LOOKAHEAD_DAYS = 70;
export const WASTE_REMINDER_OFFSET = 1;
export const WASTE_REMINDER_TIME = "18:00";
export const WASTE_TICK_MS = 60000;
export const DEFAULT_WASTE_ICON = "mdi:trash-can-outline";
export const DEFAULT_WASTE_COLOR = "#9fb0c0";
export const WASTE_DEFAULT_NAME_STRIP = [
  " Abfuhr$",
  " Collection$",
  " Waste$",
  " Tonne$",
];
// Name -> icon / default colour for the common German waste streams.
export const WASTE_ICON_RULES: Array<[RegExp, string]> = [
  [/(alt)?papier|paper|karton/i, "mdi:newspaper-variant-outline"],
  [/bio|organic|grüngut|gruengut|compost/i, "mdi:leaf"],
  [/rest(müll|muell)?|general|residual|schwarz/i, "mdi:trash-can-outline"],
  [/wertstoff|gelb|plastik|plastic|verpackung|recycl|lvp/i, "mdi:recycle"],
  [/glas|glass/i, "mdi:bottle-soda-outline"],
  [/sperrm(ü|ue)ll|bulk/i, "mdi:sofa-outline"],
];
export const WASTE_COLOR_RULES: Array<[RegExp, string]> = [
  [/(alt)?papier|paper|karton/i, "#6ba7dc"],
  [/bio|organic|grüngut|gruengut|compost/i, "#81c784"],
  [/rest(müll|muell)?|general|residual|schwarz/i, "#888780"],
  [/wertstoff|gelb|plastik|plastic|verpackung|recycl|lvp/i, "#f0c46e"],
  [/glas|glass/i, "#7bc4b0"],
  [/sperrm(ü|ue)ll|bulk/i, "#b8946a"],
];

// ---------------------------------------------------------------------------
// M3 Clock Card
// ---------------------------------------------------------------------------

export const DEFAULT_CLOCK_RADIUS = RADIUS.card;
/** Blue, matching the reference designs' hour tiles. */
export const DEFAULT_CLOCK_ACCENT = PALETTE.home;
/** Warm amber for the minute pair, the second colour in the reference. */
export const DEFAULT_CLOCK_SECONDARY = PALETTE.light;

export const CLOCK_SIZE_MIN = 0.7;
export const CLOCK_SIZE_MAX = 1.5;

// ---- tiles style
export const CLOCK_TILE_WIDTH = 104;
export const CLOCK_TILE_HEIGHT = 108;
export const CLOCK_TILE_RADIUS = 30;
export const CLOCK_TILE_DIGIT_SIZE = 54;
/** Third tile when seconds get their own; narrower than the hour/minute pair. */
export const CLOCK_TILE_SECONDS_WIDTH = 72;
/** Tint percentages, applied through tintOn so they resolve against the card
 *  surface in both themes rather than against whatever sits behind it. */
export const CLOCK_TILE_ACCENT_TINT = 18;
export const CLOCK_TILE_NEUTRAL_TINT = 8;
export const CLOCK_COLON_SIZE = 7;
export const CLOCK_COLON_RADIUS = 2;
export const CLOCK_COLON_DIM = 0.25;
export const CLOCK_SECONDS_BAR_HEIGHT = 6;
export const CLOCK_SECONDS_BAR_RADIUS = 3;
export const CLOCK_SECONDS_TRACK_TINT = 9;
/** Roll animation: the outgoing digit leaves, the incoming one follows late. */
export const CLOCK_ROLL_MS = 400;
export const CLOCK_ROLL_DELAY_MS = 200;

// ---- narrow layout
/** Below this the tiles shrink; measured against the card, not the viewport. */
export const CLOCK_NARROW_PX = 240;
export const CLOCK_TILE_WIDTH_NARROW = 84;
export const CLOCK_TILE_HEIGHT_NARROW = 88;

// ---- shape motion
/** Radians per second, not per frame: a 120Hz display must not spin twice as
 *  fast as a 60Hz one. */
export const CLOCK_SHAPE_SPEED_RAD_S = { slow: 0.12, normal: 0.24, fast: 0.5 } as const;

/** A jump larger than this means standby or a DST change, not the clock
 *  advancing — recompute rather than animate across it. */
export const CLOCK_TIME_JUMP_MS = 120_000;

// ---- shapes style
export const CLOCK_CELL = 72;
export const CLOCK_CELL_NARROW = 56;
export const CLOCK_CELL_DIGIT = 46;
/** Negative: the two digits of a pair overlap so "14" reads as one number
 *  rather than as two separate badges. */
export const CLOCK_DIGIT_OVERLAP = -12;
export const CLOCK_DIGIT_OVERLAP_MIN = -20;
export const CLOCK_DIGIT_OVERLAP_MAX = 0;
export const CLOCK_PAIR_GAP = 7;
export const CLOCK_SHAPES_MINUTE_TINT = 22;
export const CLOCK_DIGIT_POP_MS = 260;

// ---- lockscreen style
export const CLOCK_LOCK_DIGIT = 78;
export const CLOCK_LOCK_DIGIT_NARROW = 56;
export const CLOCK_LOCK_STROKE = 2;
export const CLOCK_LOCK_DECOR = 86;
export const CLOCK_LOCK_DECOR_OPACITY = 0.5;

// ---- scallop style
export const CLOCK_DIAL = 200;
export const CLOCK_DIAL_OUTER_TINT = 16;
export const CLOCK_DIAL_INNER_TINT = 10;
export const CLOCK_HAND_HOUR = 11;
export const CLOCK_HAND_MINUTE = 7;
export const CLOCK_TICK_MAJOR_R = 4.5;
export const CLOCK_TICK_MINOR_R = 2.2;
export const CLOCK_TICK_MAJOR_OPACITY = 0.7;
export const CLOCK_TICK_MINOR_OPACITY = 0.25;
export const CLOCK_HUB_R = 8;
export const CLOCK_SECOND_FLOWER_R = 9;

// ---- ring style
export const CLOCK_RING_SEGMENTS = 60;
export const CLOCK_RING_OUTER = 88;
export const CLOCK_RING_INNER = 78;
export const CLOCK_RING_STROKE = 4;
export const CLOCK_RING_TRACK_TINT = 9;
export const CLOCK_RING_PAST_OPACITY = 0.75;
export const CLOCK_RING_TIME_SIZE = 34;
export const CLOCK_RING_SECONDS_SIZE = 13;
export const CLOCK_RING_DRAIN_MS = 400;
