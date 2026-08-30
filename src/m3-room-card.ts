import { LitElement, html, css, nothing, unsafeCSS } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HassEntity,
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  M3RoomCardConfig,
  RoomCategoryConfig,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_ROOM_ACCENT,
  DEFAULT_ROOM_RADIUS,
  ROOM_CATEGORIES,
  ROOM_CHIP_HEIGHT,
  ROOM_CHIP_RADIUS,
  ROOM_CHIP_TINT,
  ROOM_DOT,
  ROOM_DOT_PULSE_MS,
  ROOM_FALLBACK_CATEGORY,
  ROOM_HEADER_ICON,
  ROOM_HEADER_ICON_RADIUS,
  ROOM_HOLD_MS,
  ROOM_POWER_THRESHOLD,
  ROOM_PRESENCE_BORDER,
  ROOM_PRESENCE_COLOR,
  ROOM_PRESENCE_TINT,
  ROOM_SHEET_ICON,
  ROOM_SHEET_ICON_RADIUS,
  ROOM_SHEET_MAX_HEIGHT,
  ROOM_SHEET_MS,
  ROOM_SHEET_RADIUS,
  ROOM_SHEET_ROW_HEIGHT,
  ROOM_SHEET_ROW_RADIUS,
  ROOM_SHEET_ROW_TINT,
  ROOM_TILE_GAP,
  ROOM_TILE_ICON,
  ROOM_TILE_ICON_RADIUS,
  ROOM_TILE_ICON_TINT_IDLE,
  ROOM_TILE_MIN,
  ROOM_TILE_MORPH_MS,
  ROOM_TILE_RADIUS,
  ROOM_TILE_RADIUS_ACTIVE,
  ROOM_TILE_TINT_ACTIVE,
  ROOM_TILE_TINT_IDLE,
  resolveCornerRadius,
  type RoomCategoryDef,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { STANDARD_EASING, shouldAnimate } from "./shared/animation";
import { activateOnKey } from "./shared/a11y";
import { handleAction } from "./shared/actions";
import {
  buildCssVars,
  fillColor,
  foregroundOn,
  inkOn,
  resolveCommonColors,
  resolveThemeColor,
  tintOn,
} from "./shared/color-config";
import { glassCardClass, glassCardStyles } from "./shared/glass-card";
import { formatNumber } from "./shared/formatting";
import { areaEntityIds, areaInfo } from "./shared/ha-registry";
import { guessRoomIcon } from "./shared/room-icons";
import { hassChangeMatters } from "./shared/should-update";

const EASING = unsafeCSS(STANDARD_EASING);

/** Amber, the same one the power chip uses when it has something to say. */
const PALETTE_WARN = "#f0a24a";

console.info(
  `%c M3-ROOM-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #5dcaa5; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #5dcaa5; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const PRESENCE_CLASSES = new Set(["occupancy", "motion", "presence"]);
/** What counts as "a way into the room that can stand open". */
const OPENING_CLASSES = new Set(["window", "door", "garage_door", "opening"]);
const UNAVAILABLE = new Set(["unavailable", "unknown"]);

interface Category {
  domain: string;
  name: string;
  icon: string;
  color: string;
  def: RoomCategoryDef;
  entities: string[];
  /** Entities that actually answer; the rest are unavailable. */
  live: string[];
  activeCount: number;
  active: boolean;
  badge: string;
  override?: RoomCategoryConfig;
}

interface Chip {
  key: string;
  icon: string;
  text: string;
  color?: string;
}

@customElement("m3-room-card")
export class M3RoomCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3RoomCardConfig;
  /** Domain of the category whose device picker is open, if any. */
  @state() private _sheet?: string;
  /** True while the picker plays its exit; the sheet is still in the DOM. */
  @state() private _sheetClosing = false;

  private _holdTimer?: number;
  private _held = false;
  private _sheetCloseTimer?: number;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-room-card-editor");
    return document.createElement(
      "m3-room-card-editor",
    ) as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): M3RoomCardConfig {
    const areas = hass?.areas ? Object.keys(hass.areas) : [];
    return { type: "custom:m3-room-card", area: areas[0] ?? "", glass_background: true };
  }

  public setConfig(config: M3RoomCardConfig): void {
    if (!config.area) throw new Error("m3-room-card: 'area' is required");
    this._config = { glass_background: true, animation: "auto", show_sensors: true, ...config };
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_rows: 3 };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!changed.has("hass") || changed.size > 1) return true;
    const previous = changed.get("hass") as HomeAssistant | undefined;
    if (!previous || !this.hass) return true;
    // The card discovers what it draws, so a registry change can add a whole
    // category. Listing the entities it currently reads cannot catch that:
    // the entity it should start reading is by definition not in the list.
    if (
      previous.entities !== this.hass.entities ||
      previous.devices !== this.hass.devices ||
      previous.areas !== this.hass.areas
    ) {
      return true;
    }
    return hassChangeMatters(changed, this.hass, this._watched());
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._holdTimer);
    window.clearTimeout(this._sheetCloseTimer);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  // ---- discovery -----------------------------------------------------------

  private get _areaEntities(): string[] {
    if (!this.hass || !this._config?.area) return [];
    const all = areaEntityIds(this.hass, this._config.area);
    const excluded = this._config.excluded_entities;
    if (!excluded?.length) return all;
    const drop = new Set(excluded);
    return all.filter((id) => !drop.has(id));
  }

  /**
   * The area's entities *before* the user's exclusions, for the editor.
   *
   * The editor has to offer the excluded ones too — a device you cannot see in
   * the list is a device you cannot switch back on.
   */
  public allAreaEntities(): string[] {
    if (!this.hass || !this._config?.area) return [];
    return areaEntityIds(this.hass, this._config.area);
  }

  private _watched(): (string | undefined)[] {
    const ids: (string | undefined)[] = [...this._areaEntities];
    const cfg = this._config;
    if (cfg) {
      ids.push(
        cfg.temperature_entity,
        cfg.humidity_entity,
        cfg.power_entity,
        cfg.presence_entity,
        ...(cfg.extra_sensors ?? []),
        ...(cfg.window_entities ?? []),
      );
    }
    return ids;
  }

  private _defFor(domain: string): RoomCategoryDef {
    return (
      ROOM_CATEGORIES.find((c) => c.domain === domain) ?? {
        domain,
        ...ROOM_FALLBACK_CATEGORY,
      }
    );
  }

  private _overrideFor(domain: string): RoomCategoryConfig | undefined {
    return this._config?.categories?.find((c) => c.domain === domain);
  }

  /** The domains this card is willing to show, in the order they should appear. */
  private _domainOrder(): string[] {
    const cfg = this._config;
    const known = ROOM_CATEGORIES.map((c) => c.domain);
    const extra = (cfg?.extra_domains ?? []).filter(
      (d): d is string => !!d && !known.includes(d),
    );
    const all = [...known, ...extra];
    const preferred = cfg?.category_order ?? [];
    // A configured order wins for the domains it names; everything else keeps
    // the built-in order behind it, so adding a domain later does not silently
    // drop it off the card.
    return [
      ...preferred.filter((d) => all.includes(d)),
      ...all.filter((d) => !preferred.includes(d)),
    ];
  }

  private _categories(): Category[] {
    const cfg = this._config;
    if (!cfg || !this.hass) return [];
    const hidden = new Set(cfg.hidden_categories ?? []);
    const byDomain = new Map<string, string[]>();
    for (const id of this._areaEntities) {
      const domain = id.split(".", 1)[0];
      byDomain.set(domain, [...(byDomain.get(domain) ?? []), id]);
    }

    const out: Category[] = [];
    for (const domain of this._domainOrder()) {
      const entities = byDomain.get(domain);
      if (!entities?.length) continue;
      const override = this._overrideFor(domain);
      if (hidden.has(domain) || override?.hidden) continue;

      const def = this._defFor(domain);
      const live = entities.filter((id) => !UNAVAILABLE.has(this.hass!.states[id]?.state ?? ""));
      const activeCount = live.filter((id) => this._isActive(domain, this.hass!.states[id])).length;

      out.push({
        domain,
        name: override?.name ?? this._categoryName(domain, entities),
        icon: override?.icon ?? this._categoryIcon(domain, entities),
        color: resolveThemeColor(override?.color ?? def.color),
        def,
        entities,
        live,
        activeCount,
        active: activeCount > 0,
        badge:
          override?.badge === "none"
            ? ""
            : live.length === 0
              ? "—"
              : this._badge(domain, entities, live, activeCount, override?.badge ?? "auto"),
        override,
      });
    }
    return out;
  }

  private _categoryName(domain: string, entities: string[]): string {
    // With exactly one device behind the tile, the tile *is* that device, so
    // name it. "Schalter · An" tells nobody what they are about to switch —
    // and a switch is the one category whose generic name carries no
    // information at all. The icon still says what kind of thing it is.
    if (entities.length === 1) {
      const own = this.hass?.states[entities[0]]?.attributes?.friendly_name as string | undefined;
      const short = own ? this._withoutAreaName(own) : "";
      if (short) return short;
    }
    // A dehumidifier is its own word, and calling it a humidifier would be the
    // card telling the user their device does the opposite of what it does.
    if (domain === "humidifier" && this._allHaveDeviceClass(entities, "dehumidifier")) {
      return this._t("room_cat_dehumidifier");
    }
    const key = `room_cat_${domain}` as TranslationKey;
    const label = localize(key, this._language);
    return label === key ? domain : label;
  }

  /**
   * Drops the room's name from a device name, wherever it sits.
   *
   * People name devices after the room they are in, and Home Assistant then
   * builds the entity name from the device, so a bedroom card repeats
   * "Schlafzimmer" on every tile. In the width of a tile that repetition is
   * the part that survives and the distinguishing part is what gets
   * ellipsised — "Thermostat Schlafzimmer" reads as "Thermostat Schlafz…" when
   * "Thermostat" was the whole message.
   *
   * It is stripped anywhere, not just as a prefix: the room name turns up at
   * the end ("Thermostat Schlafzimmer") as often as at the front, and in the
   * middle when the device is a camera ("Kamera Schlafzimmer Floodlight").
   *
   * Returns "" when nothing is left — a thermostat whose whole name is the
   * room would otherwise put the room's own name on a tile inside that room's
   * card. The caller falls back to the category label there.
   */
  private _withoutAreaName(name: string): string {
    const area =
      this._config?.area && this.hass
        ? areaInfo(this.hass, this._config.area)?.name
        : undefined;
    if (!area) return name;
    const escaped = area.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = name
      .replace(new RegExp(escaped, "gi"), " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–—_:.]+|[\s\-–—_:.]+$/g, "")
      .trim();
    return stripped;
  }

  private _categoryIcon(domain: string, entities: string[]): string {
    if (domain === "humidifier" && this._allHaveDeviceClass(entities, "dehumidifier")) {
      return "mdi:water-percent";
    }
    return this._defFor(domain).icon;
  }

  private _allHaveDeviceClass(entities: string[], deviceClass: string): boolean {
    return entities.every(
      (id) => this.hass?.states[id]?.attributes?.device_class === deviceClass,
    );
  }

  private _isActive(domain: string, stateObj?: HassEntity): boolean {
    const state = stateObj?.state;
    if (!state || UNAVAILABLE.has(state)) return false;
    switch (domain) {
      case "climate":
        return state !== "off";
      case "media_player":
        return state === "playing" || state === "paused" || state === "buffering" || state === "on";
      case "cover":
        return state === "open" || (stateObj?.attributes?.current_position ?? 0) > 0;
      case "vacuum":
        return state === "cleaning" || state === "returning";
      case "lock":
        // Unlocked is the state worth showing, not the resting one.
        return state === "unlocked" || state === "open";
      default:
        return state === "on";
    }
  }

  // ---- badges --------------------------------------------------------------

  /**
   * What the tile says under its name.
   *
   * With more than one device the useful answer is how many are on; with
   * exactly one it is what that one is doing, which is the whole point of the
   * card over a row of on/off buttons.
   */
  private _badge(
    domain: string,
    entities: string[],
    live: string[],
    activeCount: number,
    mode: "auto" | "count" | "state" | "none" = "auto",
  ): string {
    if (mode === "none") return "";
    if (mode === "count" || (mode === "auto" && entities.length > 1)) {
      return `${activeCount}/${entities.length}`;
    }
    const stateObj = this.hass?.states[live[0]];
    if (!stateObj) return "—";
    return this._singleBadge(domain, stateObj);
  }

  private _singleBadge(domain: string, stateObj: HassEntity): string {
    const state = stateObj.state;
    const attrs = stateObj.attributes ?? {};
    const off = this._t("room_state_off");

    switch (domain) {
      case "fan": {
        if (state !== "on") return off;
        const preset = attrs.preset_mode as string | undefined;
        if (preset) return preset;
        const percentage = attrs.percentage as number | undefined;
        const step = attrs.percentage_step as number | undefined;
        if (percentage === undefined) return this._t("room_state_on");
        if (step && step > 0 && step < 100) {
          return this._t("room_fan_step").replace("{n}", String(Math.round(percentage / step)));
        }
        return `${Math.round(percentage)} %`;
      }
      case "humidifier": {
        if (state !== "on") return off;
        const target = attrs.humidity as number | undefined;
        return target === undefined ? this._t("room_state_on") : `${Math.round(target)} %`;
      }
      case "climate": {
        if (state === "off") return off;
        const target = attrs.temperature as number | undefined;
        const mode = localize(state as TranslationKey, this._language);
        const modeLabel = mode === state ? state : mode;
        return target === undefined
          ? modeLabel
          : `${formatNumber(this._language, target, { maximumFractionDigits: 1 })}°`;
      }
      case "media_player": {
        if (state === "off" || state === "standby") return off;
        if (state === "idle") return this._t("room_state_idle");
        const title = (attrs.media_title as string | undefined) ?? (attrs.source as string | undefined);
        if (!title) return this._t("room_state_on");
        return title.length > 16 ? `${title.slice(0, 15)}…` : title;
      }
      case "cover": {
        const position = attrs.current_position as number | undefined;
        if (state === "closed" || position === 0) return this._t("room_state_closed");
        if (position !== undefined && position < 100) return `${Math.round(position)} %`;
        return localize("open", this._language);
      }
      case "vacuum": {
        const label = localize(state as TranslationKey, this._language);
        return label === state ? state : label;
      }
      case "lock":
        return state === "locked"
          ? this._t("room_state_locked")
          : this._t("room_state_unlocked");
      default:
        return state === "on" ? this._t("room_state_on") : off;
    }
  }

  // ---- presence ------------------------------------------------------------

  private _presenceEntity(): string | undefined {
    const cfg = this._config;
    if (!cfg) return undefined;
    if (cfg.presence_entity) return cfg.presence_entity;
    return this._areaEntities.find(
      (id) =>
        id.startsWith("binary_sensor.") &&
        PRESENCE_CLASSES.has(this.hass?.states[id]?.attributes?.device_class as string),
    );
  }

  private _occupied(): boolean {
    const entity = this._presenceEntity();
    if (!entity) return false;
    return this.hass?.states[entity]?.state === "on";
  }

  // ---- sensor chips --------------------------------------------------------

  private _findSensor(deviceClass: string): string | undefined {
    return this._areaEntities.find(
      (id) =>
        id.startsWith("sensor.") &&
        this.hass?.states[id]?.attributes?.device_class === deviceClass,
    );
  }

  private _chipFor(entityId: string | undefined, icon: string, color?: string): Chip | undefined {
    if (!entityId) return undefined;
    const stateObj = this.hass?.states[entityId];
    if (!stateObj || UNAVAILABLE.has(stateObj.state)) return undefined;
    const unit = stateObj.attributes?.unit_of_measurement as string | undefined;
    const numeric = parseFloat(stateObj.state);
    const value = Number.isFinite(numeric)
      ? formatNumber(this._language, numeric, { maximumFractionDigits: 1 })
      : stateObj.state;
    return { key: entityId, icon, text: unit ? `${value} ${unit}` : value, color };
  }

  private _chips(): Chip[] {
    const cfg = this._config;
    if (!cfg || cfg.show_sensors === false) return [];
    const area = this.hass && cfg.area ? areaInfo(this.hass, cfg.area) : undefined;

    const chips: Chip[] = [];
    // HA's own area settings name a temperature and humidity entity; they are a
    // deliberate choice and beat anything this card could guess.
    const temperature =
      cfg.temperature_entity ?? area?.temperatureEntity ?? this._findSensor("temperature");
    const humidity = cfg.humidity_entity ?? area?.humidityEntity ?? this._findSensor("humidity");
    const power = cfg.power_entity ?? this._findSensor("power");

    const tempChip = this._chipFor(temperature, "mdi:thermometer");
    if (tempChip) chips.push(tempChip);
    const humChip = this._chipFor(humidity, "mdi:water-percent");
    if (humChip) chips.push(humChip);

    if (power) {
      const watts = parseFloat(this.hass?.states[power]?.state ?? "");
      const threshold = cfg.power_threshold ?? ROOM_POWER_THRESHOLD;
      // A room drawing 0.4W is a room drawing nothing, and a chip saying so
      // costs a row on every card that has a plug in it.
      if (Number.isFinite(watts) && watts > threshold) {
        const chip = this._chipFor(power, "mdi:flash", "#f0a24a");
        if (chip) chips.push(chip);
      }
    }

    const windows = this._windowChip();
    if (windows) chips.push(windows);

    for (const id of cfg.extra_sensors ?? []) {
      const chip = this._chipFor(id, "mdi:gauge");
      if (chip) chips.push(chip);
    }
    return chips;
  }

  private _windowEntities(): string[] {
    const cfg = this._config;
    if (!cfg || cfg.show_windows === false) return [];
    if (cfg.window_entities?.length) return cfg.window_entities;
    return this._areaEntities.filter(
      (id) =>
        id.startsWith("binary_sensor.") &&
        OPENING_CLASSES.has(this.hass?.states[id]?.attributes?.device_class as string),
    );
  }

  /**
   * How many ways into the room stand open.
   *
   * Shown whenever the room has such a sensor at all, closed included: "all
   * shut" is the half of the answer you go looking for on the way out of the
   * house, and a chip that only ever appears when something is wrong cannot
   * tell you that.
   */
  private _windowChip(): Chip | undefined {
    const entities = this._windowEntities();
    const live = entities.filter(
      (id) => !UNAVAILABLE.has(this.hass?.states[id]?.state ?? "unavailable"),
    );
    if (live.length === 0) return undefined;

    const open = live.filter((id) => this.hass?.states[id]?.state === "on");
    if (open.length === 0) {
      return {
        key: "windows",
        icon: "mdi:window-closed-variant",
        text: this._t("room_windows_closed"),
      };
    }
    return {
      key: "windows",
      icon: "mdi:window-open-variant",
      text:
        live.length === 1
          ? this._t("room_window_open")
          : this._t("room_windows_open").replace("{n}", String(open.length)),
      color: PALETTE_WARN,
    };
  }

  // ---- interaction ---------------------------------------------------------

  private _toggleCategory(category: Category): void {
    if (!this.hass) return;
    if (category.override?.tap_action) {
      handleAction(this, this.hass, category.override.tap_action, category.live[0]);
      return;
    }
    if (category.def.toggle === "none" || category.live.length === 0) {
      this._moreInfo(category.live[0] ?? category.entities[0]);
      return;
    }
    const domain = category.def.toggle === "cover" ? "cover" : "homeassistant";
    // Every live entity of the category, so one tap does what the tile shows.
    this.hass.callService(domain, "toggle", { entity_id: category.live });
  }

  private _moreInfo(entityId?: string): void {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      }),
    );
  }

  private _openDetail(category: Category): void {
    const path = this._config?.detail_path;
    if (path) {
      window.history.pushState(null, "", path);
      this.dispatchEvent(
        new CustomEvent("location-changed", {
          bubbles: true,
          composed: true,
          detail: { replace: false },
        }),
      );
      return;
    }
    this._moreInfo(category.live[0] ?? category.entities[0]);
  }

  private _onTilePointerDown(category: Category): void {
    this._held = false;
    window.clearTimeout(this._holdTimer);
    this._holdTimer = window.setTimeout(() => {
      this._held = true;
      this._openDetail(category);
    }, ROOM_HOLD_MS);
  }

  private _onTilePointerUp(): void {
    window.clearTimeout(this._holdTimer);
  }

  private _onTileClick(category: Category, e: Event): void {
    e.stopPropagation();
    window.clearTimeout(this._holdTimer);
    // A hold has already opened the detail view; letting the click through
    // would toggle the category on the way back out of it.
    if (this._held) {
      this._held = false;
      return;
    }
    // With several devices behind one tile, switching all of them is rarely
    // what the tap meant: a room's four lights are four decisions, not one.
    // So the tile opens a picker instead, unless the config says otherwise or
    // there is only one device to pick.
    if (
      !category.override?.tap_action &&
      category.def.toggle !== "none" &&
      category.live.length > 1 &&
      (this._config?.category_tap ?? "list") === "list"
    ) {
      window.clearTimeout(this._sheetCloseTimer);
      this._sheetClosing = false;
      this._sheet = category.domain;
      return;
    }
    this._toggleCategory(category);
  }

  // ---- device picker -------------------------------------------------------

  private _closeSheet = (): void => {
    // Without motion there is nothing to wait for, and holding the sheet in the
    // DOM for a fifth of a second would just feel unresponsive.
    if (!shouldAnimate(this._config?.animation)) {
      this._sheet = undefined;
      return;
    }
    this._sheetClosing = true;
    window.clearTimeout(this._sheetCloseTimer);
    this._sheetCloseTimer = window.setTimeout(() => {
      this._sheet = undefined;
      this._sheetClosing = false;
    }, ROOM_SHEET_MS);
  };

  private _onSheetKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      this._closeSheet();
    }
  };

  private _toggleOne(category: Category, entityId: string): void {
    if (!this.hass) return;
    const domain = category.def.toggle === "cover" ? "cover" : "homeassistant";
    this.hass.callService(domain, "toggle", { entity_id: entityId });
  }

  private _setAll(category: Category, on: boolean): void {
    if (!this.hass || category.live.length === 0) return;
    const domain = category.def.toggle === "cover" ? "cover" : "homeassistant";
    const service = category.def.toggle === "cover" ? (on ? "open_cover" : "close_cover") : on ? "turn_on" : "turn_off";
    this.hass.callService(domain, service, { entity_id: category.live });
  }

  private _entityName(entityId: string): string {
    const stateObj = this.hass?.states[entityId];
    return (stateObj?.attributes?.friendly_name as string | undefined) ?? entityId;
  }

  private _renderSheet(categories: Category[]): TemplateResult | typeof nothing {
    const category = categories.find((c) => c.domain === this._sheet);
    if (!category) return nothing;

    const rowBackground = tintOn(this, "var(--primary-text-color)", undefined, ROOM_SHEET_ROW_TINT);
    const activeFill = fillColor(this, category.color, 3);

    return html`
      <div class="scrim ${this._sheetClosing ? "closing" : ""}" @click=${this._closeSheet}>
        <div
          class="sheet ${this._sheetClosing ? "closing" : ""}"
          role="dialog"
          aria-label=${category.name}
          tabindex="-1"
          @click=${(e: Event) => e.stopPropagation()}
          @keydown=${this._onSheetKey}
        >
          <div class="sheet-grip"></div>
          <div class="sheet-head">
            <span class="sheet-title">${category.name}</span>
            <button class="sheet-close" aria-label=${this._t("room_close")} @click=${this._closeSheet}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="sheet-list">
            ${category.entities.map((id, index) => {
              const stateObj = this.hass?.states[id];
              const dead = !stateObj || UNAVAILABLE.has(stateObj.state);
              const on = !dead && this._isActive(category.domain, stateObj);
              const wellBackground = on
                ? activeFill
                : tintOn(this, "var(--primary-text-color)", undefined, ROOM_TILE_ICON_TINT_IDLE);
              return html`
                <div
                  class="sheet-row ${dead ? "dead" : ""}"
                  style=${`background: ${rowBackground}; --row-index: ${index};`}
                  role=${dead ? nothing : "button"}
                  tabindex=${dead ? nothing : "0"}
                  aria-pressed=${dead ? nothing : String(on)}
                  @click=${dead ? nothing : () => this._toggleOne(category, id)}
                  @keydown=${dead ? nothing : activateOnKey(() => this._toggleOne(category, id))}
                >
                  <div
                    class="sheet-icon"
                    style=${`background: ${wellBackground}; color: ${
                      on
                        ? inkOn(wellBackground, this)
                        : foregroundOn("var(--primary-text-color)", wellBackground, 3, this)
                    };`}
                  >
                    <ha-icon icon=${category.icon}></ha-icon>
                  </div>
                  <span class="sheet-name" title=${this._entityName(id)}
                    >${this._entityName(id)}</span
                  >
                  <span
                    class="sheet-state"
                    style=${on ? `color: ${foregroundOn(category.color, rowBackground, 4.5, this)};` : ""}
                    >${dead ? "—" : this._singleBadge(category.domain, stateObj!)}</span
                  >
                  <button
                    class="sheet-info"
                    aria-label=${this._entityName(id)}
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this._moreInfo(id);
                    }}
                  >
                    <ha-icon icon="mdi:information-outline"></ha-icon>
                  </button>
                </div>
              `;
            })}
          </div>
          <div class="sheet-foot">
            <span class="sheet-hint">${this._t("room_pick_hint")}</span>
            <button class="sheet-action" @click=${() => this._setAll(category, false)}>
              ${this._t("room_all_off")}
            </button>
            <button class="sheet-action" @click=${() => this._setAll(category, true)}>
              ${this._t("room_all_on")}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ---- rendering -----------------------------------------------------------

  private _renderChips(chips: Chip[]): TemplateResult | typeof nothing {
    if (chips.length === 0) return nothing;
    return html`
      <div class="chips">
        ${chips.map((chip) => {
          const color = chip.color ?? "var(--primary-text-color)";
          const background = tintOn(this, color, undefined, ROOM_CHIP_TINT);
          return html`
            <div
              class="chip"
              style=${`background: ${background}; color: ${foregroundOn(color, background, 4.5, this)};`}
            >
              <ha-icon icon=${chip.icon}></ha-icon><span>${chip.text}</span>
            </div>
          `;
        })}
      </div>
    `;
  }

  private _renderTile(category: Category): TemplateResult {
    const dead = category.live.length === 0;
    const background = category.active
      ? tintOn(this, category.color, undefined, ROOM_TILE_TINT_ACTIVE)
      : tintOn(this, "var(--primary-text-color)", undefined, ROOM_TILE_TINT_IDLE);

    // An active category gets a solid well with chosen ink; an idle one a
    // neutral wash, so "on" is legible from across the room and "off" is quiet.
    const wellBackground = category.active
      ? fillColor(this, category.color, 3)
      : tintOn(this, "var(--primary-text-color)", undefined, ROOM_TILE_ICON_TINT_IDLE);
    const wellInk = category.active
      ? inkOn(wellBackground, this)
      : foregroundOn("var(--primary-text-color)", wellBackground, 3, this);

    return html`
      <div
        class="tile ${category.active ? "on" : ""} ${dead ? "dead" : ""}"
        style=${`background: ${background};`}
        role=${dead ? nothing : "button"}
        tabindex=${dead ? nothing : "0"}
        aria-label=${`${category.name}: ${category.badge}`}
        @pointerdown=${dead ? nothing : () => this._onTilePointerDown(category)}
        @pointerup=${dead ? nothing : () => this._onTilePointerUp()}
        @pointercancel=${dead ? nothing : () => this._onTilePointerUp()}
        @click=${dead ? nothing : (e: Event) => this._onTileClick(category, e)}
        @keydown=${dead
          ? nothing
          : activateOnKey(() => this._toggleCategory(category))}
      >
        <div class="well" style=${`background: ${wellBackground}; color: ${wellInk};`}>
          <ha-icon icon=${category.icon}></ha-icon>
        </div>
        <div class="tile-name" title=${category.name}>${category.name}</div>
        ${category.badge === "" ? nothing : html`<div
          class="tile-badge"
          style=${category.active
            ? `color: ${foregroundOn(category.color, background, 4.5, this)};`
            : ""}
        >
          ${category.badge}
        </div>`}
      </div>
    `;
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg || !this.hass) return nothing;

    const area = areaInfo(this.hass, cfg.area);
    const categories = this._categories();
    const chips = this._chips();
    const occupied = this._occupied();
    const presenceStyle = cfg.presence_style ?? "tint";
    const showPresence = presenceStyle !== "none" && !!this._presenceEntity();
    const tinted = occupied && showPresence && presenceStyle === "tint";

    const accent = resolveThemeColor(cfg.accent_color ?? DEFAULT_ROOM_ACCENT);
    const presenceColor = ROOM_PRESENCE_COLOR;
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(cfg);

    const name = cfg.name ?? area?.name ?? cfg.area;
    const icon = cfg.icon ?? area?.icon ?? guessRoomIcon(name);
    const activeDevices = categories.reduce((sum, c) => sum + c.activeCount, 0);

    const countText =
      activeDevices === 0
        ? this._t("room_all_off")
        : activeDevices === 1
          ? this._t("room_device_active")
          : this._t("room_devices_active").replace("{n}", String(activeDevices));
    const subtitle =
      occupied && showPresence ? `${this._t("room_occupied")} · ${countText}` : countText;

    const surface = tinted
      ? tintOn(this, presenceColor, undefined, ROOM_PRESENCE_TINT)
      : "";
    const glass = cfg.glass_background !== false;
    const painted = cardBackgroundCss
      ? cardBackgroundCss
      : surface
        ? glass
          ? `color-mix(in srgb, ${surface} 55%, transparent)`
          : surface
        : "";
    const inkSurface = cardBackgroundCss || surface || "var(--ha-card-background, var(--card-background-color))";

    const headerBackground = tintOn(this, occupied && showPresence ? presenceColor : accent, undefined, 20);

    const cssVars = buildCssVars({
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
      "room-dot": fillColor(this, presenceColor, 3),
      "room-subtitle":
        occupied && showPresence
          ? foregroundOn(presenceColor, inkSurface, 4.5, this)
          : "var(--m3p-secondary-text, var(--secondary-text-color))",
      "room-action-bg": tintOn(this, accent, undefined, 12),
      "room-action-ink": foregroundOn(accent, tintOn(this, accent, undefined, 12), 4.5, this),
      "room-border": tinted
        ? tintOn(this, presenceColor, undefined, ROOM_PRESENCE_BORDER)
        : undefined,
    });
    const radius = resolveCornerRadius(cfg.radius ?? DEFAULT_ROOM_RADIUS, cfg.corners);

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(cfg.glass_background)} ${
            shouldAnimate(cfg.animation) ? "" : "no-animations"
          } ${tinted ? "occupied" : ""}"
          style=${`border-radius: ${radius};${painted ? ` background: ${painted};` : ""}`}
        >
          <div class="header">
            <div
              class="room-icon"
              style=${`background: ${headerBackground}; color: ${foregroundOn(occupied && showPresence ? presenceColor : accent, headerBackground, 3, this)};`}
            >
              <ha-icon icon=${icon}></ha-icon>
              ${occupied && showPresence ? html`<span class="dot"></span>` : nothing}
            </div>
            <div class="text">
              <div class="name" title=${name}>${name}</div>
              <div class="subtitle">${subtitle}</div>
            </div>
          </div>
          ${this._renderChips(chips)}
          ${categories.length
            ? html`<div class="grid">${categories.map((c) => this._renderTile(c))}</div>`
            : html`<div class="empty">${this._t("room_empty")}</div>`}
          ${this._sheet ? this._renderSheet(categories) : nothing}
        </div>
      </ha-card>
    `;
  }

  static styles = [
    glassCardStyles,
    css`
      .card-inner {
        gap: 12px;
        position: relative;
      }

      .card-inner.occupied {
        border-color: var(--room-border, rgba(100, 100, 100, 0.25));
      }

      .header {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .room-icon {
        position: relative;
        flex-shrink: 0;
        width: ${ROOM_HEADER_ICON}px;
        height: ${ROOM_HEADER_ICON}px;
        border-radius: ${ROOM_HEADER_ICON_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: 28px;
      }

      .dot {
        position: absolute;
        top: -2px;
        right: -2px;
        width: ${ROOM_DOT}px;
        height: ${ROOM_DOT}px;
        border-radius: 50%;
        background: var(--room-dot);
        animation: room-pulse ${unsafeCSS(ROOM_DOT_PULSE_MS)}ms ${EASING} infinite;
      }

      @keyframes room-pulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.35);
          opacity: 0.55;
        }
      }

      .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .name {
        font-size: 15px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--m3p-text, var(--primary-text-color));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .subtitle {
        font-size: 12px;
        color: var(--room-subtitle);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .chip {
        height: ${ROOM_CHIP_HEIGHT}px;
        border-radius: ${ROOM_CHIP_RADIUS}px;
        padding: 0 11px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        --mdc-icon-size: 15px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(${ROOM_TILE_MIN}px, 1fr));
        gap: ${ROOM_TILE_GAP}px;
      }

      .tile {
        min-width: 0;
        padding: 10px 9px;
        border-radius: ${ROOM_TILE_RADIUS}px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: border-radius ${unsafeCSS(ROOM_TILE_MORPH_MS)}ms ${EASING};
      }

      .tile[role="button"] {
        cursor: pointer;
      }

      .tile[role="button"]:active {
        border-radius: ${ROOM_TILE_RADIUS_ACTIVE}px;
      }

      .tile:focus-visible {
        outline: 2px solid var(--m3p-text, var(--primary-text-color));
        outline-offset: -2px;
      }

      .tile.dead {
        opacity: 0.4;
      }

      .well {
        width: ${ROOM_TILE_ICON}px;
        height: ${ROOM_TILE_ICON}px;
        border-radius: ${ROOM_TILE_ICON_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: 20px;
      }

      .tile-name {
        font-size: 11px;
        font-weight: 700;
        color: var(--m3p-text, var(--primary-text-color));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tile-badge {
        font-size: 11px;
        opacity: 0.6;
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tile.on .tile-badge {
        opacity: 1;
        font-weight: 600;
      }

      .empty {
        font-size: 12px;
        opacity: 0.6;
        color: var(--m3p-secondary-text, var(--secondary-text-color));
      }


      /* ---- device picker ---- */

      .scrim {
        position: absolute;
        inset: 0;
        z-index: 5;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 8px;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
        animation: sheet-fade ${unsafeCSS(ROOM_SHEET_MS)}ms ${EASING} both;
      }

      .scrim.closing {
        animation: sheet-fade ${unsafeCSS(ROOM_SHEET_MS)}ms ${EASING} reverse both;
      }

      .sheet {
        width: 100%;
        /* Bounded by the card, not the viewport: 60vh let a five-device list
           grow 160px taller than the card it lives in, and since the card
           clips its overflow the sheet's whole header — the close button with
           it — was cut off above the top edge. A picker you cannot close is
           worse than no picker. */
        max-height: min(100%, ${ROOM_SHEET_MAX_HEIGHT}vh);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        border-radius: ${ROOM_SHEET_RADIUS}px;
        background: var(--ha-card-background, var(--card-background-color));
        transform-origin: bottom center;
        animation: sheet-rise ${unsafeCSS(ROOM_SHEET_MS)}ms ${EASING} both;
      }

      .sheet.closing {
        animation: sheet-rise ${unsafeCSS(ROOM_SHEET_MS)}ms ${EASING} reverse both;
      }

      @keyframes sheet-fade {
        from {
          opacity: 0;
        }
      }

      @keyframes sheet-rise {
        from {
          /* Grows out of the tile rather than sliding in from nowhere: the
             scale is what ties the sheet to the thing that was tapped. */
          transform: translateY(16px) scale(0.96);
          opacity: 0;
        }
      }

      /* The rows arrive one after another, which reads as a list assembling
         itself instead of a block appearing. 26ms is short enough that the
         whole run is over before the sheet has settled. */
      @keyframes sheet-row-in {
        from {
          transform: translateY(10px);
          opacity: 0;
        }
      }

      .sheet-head {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .sheet-title {
        flex: 1;
        min-width: 0;
        font-size: 14px;
        font-weight: 700;
        color: var(--m3p-text, var(--primary-text-color));
      }

      .sheet-close,
      .sheet-info {
        flex-shrink: 0;
        width: 30px;
        height: 30px;
        border: none;
        border-radius: 15px;
        background: transparent;
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        --mdc-icon-size: 18px;
      }

      .sheet-close {
        background: var(--room-action-bg);
        color: var(--room-action-ink);
      }

      .sheet-close:focus-visible,
      .sheet-info:focus-visible {
        outline: 2px solid var(--m3p-text, var(--primary-text-color));
        outline-offset: 2px;
      }

      /* The grab bar says "sheet" before anything is read, and gives the
         header a second, wider target on the way to the close button. */
      .sheet-grip {
        align-self: center;
        width: 32px;
        height: 4px;
        border-radius: 2px;
        background: var(--m3h-grip, currentColor);
        opacity: 0.25;
        flex-shrink: 0;
      }

      .sheet-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow-y: auto;
        /* Without this a flex child refuses to shrink below its content, so
           the list pushes the sheet past its max-height instead of scrolling —
           which is how the header ended up outside the card. */
        min-height: 0;
        overscroll-behavior: contain;
      }

      .sheet-row {
        flex-shrink: 0;
        height: ${ROOM_SHEET_ROW_HEIGHT}px;
        border-radius: ${ROOM_SHEET_ROW_RADIUS}px;
        padding: 0 6px 0 10px;
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        transition: border-radius ${unsafeCSS(ROOM_TILE_MORPH_MS)}ms ${EASING};
        animation: sheet-row-in ${unsafeCSS(ROOM_SHEET_MS)}ms ${EASING} both;
        animation-delay: calc(var(--row-index, 0) * 26ms);
      }

      /* On the way out the rows leave together — staggering an exit only makes
         the dismissal feel slow. */
      .sheet.closing .sheet-row {
        animation: none;
      }

      .sheet-row[role="button"] {
        cursor: pointer;
      }

      .sheet-row[role="button"]:active {
        border-radius: ${ROOM_TILE_RADIUS_ACTIVE}px;
      }

      .sheet-row:focus-visible {
        outline: 2px solid var(--m3p-text, var(--primary-text-color));
        outline-offset: -2px;
      }

      .sheet-row.dead {
        opacity: 0.4;
      }

      .sheet-icon {
        flex-shrink: 0;
        width: ${ROOM_SHEET_ICON}px;
        height: ${ROOM_SHEET_ICON}px;
        border-radius: ${ROOM_SHEET_ICON_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: 18px;
      }

      .sheet-name {
        flex: 1;
        min-width: 0;
        font-size: 13px;
        font-weight: 500;
        color: var(--m3p-text, var(--primary-text-color));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sheet-state {
        flex-shrink: 0;
        font-size: 12px;
        font-weight: 700;
        color: var(--m3p-secondary-text, var(--secondary-text-color));
      }

      .sheet-foot {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .sheet-hint {
        flex: 1;
        min-width: 0;
        font-size: 11px;
        opacity: 0.5;
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sheet-action {
        flex-shrink: 0;
        height: 32px;
        padding: 0 14px;
        border: none;
        border-radius: 16px;
        background: var(--room-action-bg);
        color: var(--room-action-ink);
        font-size: 12px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
      }

      .no-animations .scrim,
      .no-animations .sheet,
      .no-animations .sheet-row {
        animation: none;
      }

      .no-animations .dot {
        animation: none;
      }

      .no-animations .tile {
        transition: none;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-room-card": M3RoomCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-room-card",
  name: "M3 Room Card",
  description:
    "Raum-Zentrale: erkennt alle Gerätetypen im Bereich, zeigt Klimawerte, Präsenz und Schnellschalter.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
