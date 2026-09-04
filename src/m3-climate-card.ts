import { LitElement, html, css, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3ClimateCardConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  HvacMode,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_MODE_COLORS,
  MODE_ICONS,
  PRESET_ICONS,
  PRESET_ICON_FALLBACK,
  WINDOW_OPEN_COLOR,
  DEFAULT_BATTERY_THRESHOLD,
  DEFAULT_TEMP_STEP,
  DEFAULT_CLIMATE_RADIUS,
  MODE_PILL_BORDER_PX,
  MODE_PILL_LINE_PERCENT,
  MODE_PILL_WASH_PERCENT,
  SETPOINT_LINE_PERCENT,
  SETPOINT_WASH_PERCENT,
  resolveCornerRadius,
  THEME_COLOR_TOKENS,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import { resolveActionGlow, renderActionGlow, actionGlowStyles } from "./shared/action-glow";
import { hassChangeMatters } from "./shared/should-update";
import { formatNumber } from "./shared/formatting";
import { renderMissingEntity } from "./shared/glass-card";
import { tintOn } from "./shared/color-config";
import {
  resolveSetpointSurface,
  setpointSurfaceStyles,
  heroTempStyles,
} from "./shared/climate-surface";
import { shouldAnimate } from "./shared/animation";
import { migrateAnimationsField } from "./shared/config-migration";
import { activateOnKey } from "./shared/a11y";
import { openDropdownMenu, closeDropdownMenu } from "./shared/dropdown-menu";

console.info(
  `%c M3-CLIMATE-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #5dcaa5; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #5dcaa5; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

@customElement("m3-climate-card")
export class M3ClimateCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ClimateCardConfig;
  @state() private _presetMenuOpen = false;
  @state() private _modeMenuOpen = false;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement(
      "m3-climate-card-editor",
    ) as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(
    hass: HomeAssistant,
  ): M3ClimateCardConfig {
    const climateEntity = Object.keys(hass?.states ?? {}).find((eid) =>
      eid.startsWith("climate."),
    );
    return {
      type: "custom:m3-climate-card",
      entity: climateEntity ?? "",
      show_presets: true,
      show_sensors: true,
      glass_background: true,
    };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return hassChangeMatters(changed, this.hass, [
      this._config?.entity,
      this._config?.temperature_sensor,
      this._config?.humidity_sensor,
      this._config?.window_sensor,
      this._config?.battery_sensor,
    ]);
  }

  public setConfig(config: M3ClimateCardConfig): void {
    if (!config.entity) {
      throw new Error(
        "Bitte eine climate-Entität auswählen / Please select a climate entity",
      );
    }
    this._config = migrateAnimationsField({
      show_presets: true,
      show_sensors: true,
      glass_background: true,
      battery_threshold: DEFAULT_BATTERY_THRESHOLD,
      ...config,
    });
  }

  public getCardSize(): number {
    return 4;
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: 6,
      rows: "auto",
      min_columns: 6,
      // The hero figure plus the setpoint row and mode pill no longer fit in
      // three grid rows without clipping; `rows: "auto"` still sizes the card
      // to its content, this only stops a manual resize below what fits.
      min_rows: 4,
    };
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _modeColor(mode: string): string {
    const override = (
      this._config?.mode_colors as Record<string, string> | undefined
    )?.[mode];
    const resolved =
      override || DEFAULT_MODE_COLORS[mode as HvacMode] || DEFAULT_MODE_COLORS.off;
    return THEME_COLOR_TOKENS[resolved] ?? resolved;
  }

  private _modeIcon(mode: string): string {
    return MODE_ICONS[mode as HvacMode] ?? "mdi:thermostat";
  }

  private _resolveColor(value: string): string {
    return THEME_COLOR_TOKENS[value] ?? value;
  }

  private _defaultIcon(hvacModes: string[]): string {
    const canHeat = hvacModes.includes("heat");
    const canCool = hvacModes.includes("cool") || hvacModes.includes("heat_cool");
    if (canHeat && !canCool) return "mdi:radiator";
    return "mdi:air-conditioner";
  }

  private _formatNumber(value: number, digits = 1): string {
    return formatNumber(this._language, value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    // The dropdown lives on document.body, so it would outlive a card that is
    // removed (view switch, editor preview) while its menu is open.
    if (this._modeMenuOpen || this._presetMenuOpen) closeDropdownMenu();
  }

  private _fireMoreInfo(entityId?: string): void {
    if (!entityId) return;
    const event = new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(event);
  }

  // Both pickers are rendered by the shared dropdown (shared/dropdown-menu.ts),
  // which portals the menu into the browser's top layer. Rendered inside this
  // card it would be clipped by ha-card and trapped below the next card in the
  // dashboard — the card's own glass surface establishes a stacking context no
  // z-index can escape. The two flags below only mirror the open state back
  // onto the buttons' aria-expanded.

  // The mode button opens a picker menu when there's a real choice to make.
  // With exactly two modes (e.g. only "auto" and "off" left after hiding
  // "heat"), a menu is pointless ceremony for a binary switch — tapping just
  // flips straight to the other one, like the old cycling behavior.
  private _handleModeButtonClick(
    event: Event,
    hvacModes: string[],
    currentMode: string,
    statusText: string,
    unavailable: boolean,
  ): void {
    if (unavailable || hvacModes.length === 0) return;
    if (hvacModes.length <= 2) {
      const next = hvacModes.find((m) => m !== currentMode) ?? hvacModes[0];
      this._selectMode(next, unavailable);
      return;
    }
    this._modeMenuOpen = true;
    openDropdownMenu({
      anchor: event.currentTarget as HTMLElement,
      label: statusText,
      items: hvacModes.map((mode) => ({
        value: mode,
        label: this._t(mode as TranslationKey) ?? mode,
        icon: this._modeIcon(mode),
        selected: mode === currentMode,
      })),
      onSelect: (mode) => this._selectMode(mode, unavailable),
      onClose: () => {
        this._modeMenuOpen = false;
      },
    });
  }

  private _selectMode(mode: string, unavailable: boolean): void {
    if (unavailable || !this.hass || !this._config) return;
    this.hass.callService("climate", "set_hvac_mode", {
      entity_id: this._config.entity,
      hvac_mode: mode,
    });
  }

  private _openPresetMenu(
    event: Event,
    presetModes: string[],
    currentPreset: string | undefined,
    unavailable: boolean,
  ): void {
    if (unavailable || presetModes.length === 0) return;
    this._presetMenuOpen = true;
    openDropdownMenu({
      anchor: event.currentTarget as HTMLElement,
      label: this._t("select_preset"),
      items: presetModes.map((preset) => ({
        value: preset,
        label: this._presetPillLabel(preset),
        icon: this._presetIcon(preset),
        selected: preset === currentPreset,
      })),
      onSelect: (preset) => this._selectPreset(preset, unavailable),
      onClose: () => {
        this._presetMenuOpen = false;
      },
    });
  }

  private _selectPreset(preset: string, unavailable: boolean): void {
    if (unavailable || !this.hass || !this._config) return;
    this.hass.callService("climate", "set_preset_mode", {
      entity_id: this._config.entity,
      preset_mode: preset,
    });
  }

  // The ± buttons default to no fill at all — a hairline ring is enough for a
  // control that carries no value, and it keeps the setpoint pill next to it
  // the only filled shape in the row. Anyone who explicitly configured
  // plus_opacity / minus_opacity still gets their tint.
  private _stepperFill(color: string, opacity: number | undefined): string {
    if (opacity === undefined) return "transparent";
    return tintOn(this, color, opacity, 0);
  }

  private _handleStep(
    direction: 1 | -1,
    currentTemp: number,
    step: number,
    min: number,
    max: number,
    unavailable: boolean,
  ): void {
    if (unavailable || !this.hass || !this._config) return;
    let next = currentTemp + direction * step;
    next = Math.min(max, Math.max(min, next));
    next = Math.round(next / step) * step;
    this.hass.callService("climate", "set_temperature", {
      entity_id: this._config.entity,
      temperature: next,
    });
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const entity = this.hass.states[this._config.entity];

    if (!entity) {
      return renderMissingEntity(this._config.entity);
    }

    const attrs = entity.attributes ?? {};
    const unavailable =
      entity.state === "unavailable" || entity.state === "unknown";
    if (unavailable && this._config.unavailable_style === "hidden") {
      return nothing;
    }
    const dimUnavailable =
      unavailable && this._config.unavailable_style !== "normal";
    const currentMode = entity.state as HvacMode;
    const modeColor = this._modeColor(unavailable ? "off" : currentMode);
    const active = !unavailable && currentMode !== "off";

    const iconActiveColor = this._config.icon_active_color
      ? this._resolveColor(this._config.icon_active_color)
      : "var(--primary-color)";
    const iconInactiveColor = this._config.icon_inactive_color
      ? this._resolveColor(this._config.icon_inactive_color)
      : "var(--primary-color)";
    const iconColor = active ? iconActiveColor : iconInactiveColor;

    // Both steppers default to the same neutral text color now (plus used to
    // default to the mode's accent, which read as "a colorfully outlined
    // circle" next to the now much bigger, calmer temperature tile —
    // feedback after the previous pass). `plus_active_color` still lets
    // anyone bring the color back explicitly. Their *fill* now defaults to
    // nothing at all (see plusBg/minusBg below): on the ecosee reference the
    // only filled shapes are the ones carrying a value, and a ± affordance
    // carries none.
    const plusActiveColor = this._config.plus_active_color
      ? this._resolveColor(this._config.plus_active_color)
      : "var(--primary-text-color)";
    const plusInactiveColor = this._config.plus_inactive_color
      ? this._resolveColor(this._config.plus_inactive_color)
      : "var(--primary-text-color)";
    const plusColor = active ? plusActiveColor : plusInactiveColor;

    const minusActiveColor = this._config.minus_active_color
      ? this._resolveColor(this._config.minus_active_color)
      : "var(--primary-text-color)";
    const minusInactiveColor = this._config.minus_inactive_color
      ? this._resolveColor(this._config.minus_inactive_color)
      : "var(--primary-text-color)";
    const minusColor = active ? minusActiveColor : minusInactiveColor;

    const hvacModesRaw: string[] = Array.isArray(attrs.hvac_modes)
      ? attrs.hvac_modes
      : [];
    const hiddenModes = new Set(this._config.hidden_modes ?? []);
    const hvacModes = [
      ...hvacModesRaw.filter((m) => m === "off"),
      ...hvacModesRaw.filter((m) => m !== "off"),
    ].filter((m) => !hiddenModes.has(m));

    const name = this._config.name || attrs.friendly_name || this._config.entity;
    const icon = this._config.icon || this._defaultIcon(hvacModesRaw);
    const statusText = unavailable
      ? this._t("unavailable")
      : this._t(currentMode as TranslationKey) ?? currentMode;

    const sensorCfg = this._config;

    const windowEntity = sensorCfg.window_sensor
      ? this.hass.states[sensorCfg.window_sensor]
      : undefined;
    const windowOpen = windowEntity?.state === "on";

    const batteryEntity = sensorCfg.battery_sensor
      ? this.hass.states[sensorCfg.battery_sensor]
      : undefined;
    const batteryValue = batteryEntity ? parseFloat(batteryEntity.state) : NaN;
    const batteryThreshold =
      this._config.battery_threshold ?? DEFAULT_BATTERY_THRESHOLD;
    const batteryLow =
      !isNaN(batteryValue) && batteryValue <= batteryThreshold;

    const tempEntity = sensorCfg.temperature_sensor
      ? this.hass.states[sensorCfg.temperature_sensor]
      : undefined;
    const currentTemperature =
      tempEntity !== undefined
        ? parseFloat(tempEntity.state)
        : typeof attrs.current_temperature === "number"
          ? attrs.current_temperature
          : undefined;

    const humidityEntity = sensorCfg.humidity_sensor
      ? this.hass.states[sensorCfg.humidity_sensor]
      : undefined;
    const currentHumidity =
      humidityEntity !== undefined
        ? parseFloat(humidityEntity.state)
        : typeof attrs.current_humidity === "number"
          ? attrs.current_humidity
          : undefined;

    const tempUnit = this.hass.config?.unit_system?.temperature ?? "°C";

    const presetModes: string[] = Array.isArray(attrs.preset_modes)
      ? attrs.preset_modes
      : [];
    const showPresets =
      this._config.show_presets !== false && presetModes.length > 0;
    const showSensors = this._config.show_sensors !== false;
    const presetStyle = this._config.preset_style ?? "chip";
    // The mode and preset buttons sit side by side in one row now, which is
    // tight enough that their text labels are worth being able to drop. Both
    // fall back to icon-only together; `preset_style: pill` still drops the
    // preset's label on its own, as it always did.
    const showControlLabels = this._config.show_control_labels !== false;
    const tempInHeader = this._config.temperature_chip_placement === "header";

    const targetTemp: number | undefined =
      typeof attrs.temperature === "number"
        ? attrs.temperature
        : typeof attrs.target_temp_high === "number"
          ? attrs.target_temp_high
          : undefined;
    const step = attrs.target_temp_step ?? DEFAULT_TEMP_STEP;
    const minTemp = attrs.min_temp ?? 7;
    const maxTemp = attrs.max_temp ?? 35;
    const radius = resolveCornerRadius(
      this._config.radius ?? DEFAULT_CLIMATE_RADIUS,
      this._config.corners,
    );

    // The setpoint pill and the mode pill share the reference card's oval
    // recipe: the mode colour as a thin outline over a faint same-colour
    // wash, never a solid fill. `resolveSetpointSurface` measures that wash
    // against the actual theme surface and hands back an ink colour that
    // stays legible on it.
    const setpoint = resolveSetpointSurface(
      this,
      modeColor,
      undefined,
      SETPOINT_WASH_PERCENT,
      SETPOINT_LINE_PERCENT,
    );
    const modePill = resolveSetpointSurface(
      this,
      modeColor,
      undefined,
      MODE_PILL_WASH_PERCENT,
      MODE_PILL_LINE_PERCENT,
    );

    // The dominant figure stays theme ink, not mode colour: the reference
    // card reserves its heat/cool language for setpoints and equipment
    // status, so the big number never turns amber just because the heating
    // is switched on — the setpoint pill and the glow say that instead.
    const heroInk = "var(--primary-text-color)";

    const heightStyle = this._config.height ? `min-height: ${this._config.height}px;` : "";
    const animClass = shouldAnimate(this._config.animation) ? "" : "no-animations";
    const glow = resolveActionGlow(attrs, currentMode, unavailable);

    return html`
      <ha-card
        style=${`--m3-mode-color: ${modeColor}; --m3-icon-color: ${iconColor}; --m3-plus-color: ${plusColor}; --m3-minus-color: ${minusColor}; --m3-icon-bg: ${tintOn(this, iconColor, this._config.icon_opacity, 8)}; --m3-plus-bg: ${this._stepperFill(plusColor, this._config.plus_opacity)}; --m3-minus-bg: ${this._stepperFill(minusColor, this._config.minus_opacity)}; --m3-setpoint-bg: ${setpoint.bg}; --m3-setpoint-ink: ${setpoint.ink}; --m3-setpoint-line: ${setpoint.line}; --m3-mode-pill-bg: ${modePill.bg}; --m3-mode-pill-ink: ${modePill.ink}; --m3-mode-pill-line: ${modePill.line}; --m3-hero-ink: ${heroInk}; border-radius: ${radius};`}
        class=${dimUnavailable ? "unavailable" : ""}
      >
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)} ${animClass}"
          style=${`border-radius: ${radius}; ${heightStyle}`}
        >
          ${renderActionGlow(glow, this._config.show_action_glow)}
          <div
            class="header"
            role="button"
            tabindex="0"
            aria-label=${name}
            @click=${() => this._fireMoreInfo(this._config?.entity)}
            @keydown=${activateOnKey(() => this._fireMoreInfo(this._config?.entity))}
          >
            <div class="icon-container">
              <ha-icon icon=${icon}></ha-icon>
            </div>
            <div class="header-text">
              <div class="name">${name}</div>
              ${this._config.show_header_status !== false
                ? html`<div class="status">${statusText}</div>`
                : nothing}
            </div>
            <div class="header-chips">
              ${windowOpen
                ? html`
                    <div class="status-chip window-chip">
                      <ha-icon icon="mdi:window-open-variant"></ha-icon>
                      <span>${this._t("open")}</span>
                    </div>
                  `
                : nothing}
              ${tempInHeader && currentTemperature !== undefined
                ? html`
                    <div class="status-chip">
                      <ha-icon icon="mdi:thermometer"></ha-icon>
                      <span
                        >${unavailable
                          ? "–"
                          : `${this._formatNumber(currentTemperature)} ${tempUnit}`}</span
                      >
                    </div>
                  `
                : nothing}
              ${batteryLow
                ? html`
                    <div class="status-chip battery-chip">
                      <ha-icon icon="mdi:battery-alert"></ha-icon>
                      <span>${Math.round(batteryValue)}%</span>
                    </div>
                  `
                : nothing}
            </div>
          </div>

          ${showSensors &&
          ((currentTemperature !== undefined && !tempInHeader) ||
            currentHumidity !== undefined)
            ? html`
                <div
                  class="hero ${currentTemperature === undefined || tempInHeader
                    ? "hum-only"
                    : ""}"
                >
                  ${currentHumidity !== undefined
                    ? html`
                        <div
                          class="hero-hum"
                          aria-label=${this._t("current_humidity")}
                        >
                          <ha-icon icon="mdi:water-outline"></ha-icon>
                          <span
                            >${unavailable
                              ? "–"
                              : `${this._formatNumber(currentHumidity, 0)} %`}</span
                          >
                        </div>
                      `
                    : nothing}
                  ${currentTemperature !== undefined && !tempInHeader
                    ? html`
                        <div
                          class="hero-temp"
                          role="button"
                          tabindex="0"
                          aria-label=${this._t("current_temperature")}
                          @click=${() => this._fireMoreInfo(this._config?.entity)}
                          @keydown=${activateOnKey(() =>
                            this._fireMoreInfo(this._config?.entity),
                          )}
                        >
                          <span class="value"
                            >${unavailable
                              ? "–"
                              : this._formatNumber(currentTemperature)}</span
                          ><span class="unit">${tempUnit}</span>
                        </div>
                      `
                    : nothing}
                </div>
              `
            : nothing}


          <div class="setpoint-row">
            <button
              class="stepper-btn minus"
              style=${`--m3-stepper-color: ${minusColor};`}
              ?disabled=${dimUnavailable || targetTemp === undefined}
              @click=${() =>
                targetTemp !== undefined &&
                this._handleStep(
                  -1,
                  targetTemp,
                  step,
                  minTemp,
                  maxTemp,
                  dimUnavailable,
                )}
            >
              <ha-icon icon="mdi:minus"></ha-icon>
            </button>
            <div
              class="setpoint setpoint-surface"
              role="button"
              tabindex="0"
              aria-label=${this._t("target_temperature")}
              @click=${() => this._fireMoreInfo(this._config?.entity)}
              @keydown=${activateOnKey(() => this._fireMoreInfo(this._config?.entity))}
            >
              ${active
                ? html`<ha-icon icon=${this._modeIcon(currentMode)}></ha-icon>`
                : nothing}
              <span class="value"
                >${unavailable || targetTemp === undefined
                  ? "–"
                  : `${this._formatNumber(targetTemp)}°`}</span
              >
            </div>
            <button
              class="stepper-btn plus"
              style=${`--m3-stepper-color: ${plusColor};`}
              ?disabled=${dimUnavailable || targetTemp === undefined}
              @click=${() =>
                targetTemp !== undefined &&
                this._handleStep(
                  1,
                  targetTemp,
                  step,
                  minTemp,
                  maxTemp,
                  dimUnavailable,
                )}
            >
              <ha-icon icon="mdi:plus"></ha-icon>
            </button>
          </div>

          <div class="control-row">
            ${hvacModes.length > 0
              ? html`
                  <button
                    class="mode-button setpoint-surface ${showControlLabels
                      ? ""
                      : "icon-only"}"
                    style=${`--m3-setpoint-bg: var(--m3-mode-pill-bg); --m3-setpoint-ink: var(--m3-mode-pill-ink); --m3-setpoint-line: var(--m3-mode-pill-line);`}
                    ?disabled=${dimUnavailable}
                    aria-label=${statusText}
                    title=${statusText}
                    aria-haspopup=${hvacModes.length > 2 ? "listbox" : undefined}
                    aria-expanded=${hvacModes.length > 2 ? this._modeMenuOpen : undefined}
                    @click=${(event: Event) =>
                      this._handleModeButtonClick(
                        event,
                        hvacModes,
                        currentMode,
                        statusText,
                        dimUnavailable,
                      )}
                  >
                    <ha-icon icon=${this._modeIcon(currentMode)}></ha-icon>
                    ${showControlLabels
                      ? html`<span>${statusText}</span>`
                      : nothing}
                  </button>
                `
              : nothing}
            ${showPresets
              ? html`
                  <button
                    class="preset-button ${presetStyle === "pill" ||
                    !showControlLabels
                      ? "icon-only"
                      : ""}"
                    ?disabled=${dimUnavailable}
                    aria-label=${this._presetPillLabel(attrs.preset_mode)}
                    title=${this._presetPillLabel(attrs.preset_mode)}
                    aria-haspopup="listbox"
                    aria-expanded=${this._presetMenuOpen}
                    @click=${(event: Event) =>
                      this._openPresetMenu(
                        event,
                        presetModes,
                        attrs.preset_mode,
                        dimUnavailable,
                      )}
                  >
                    ${presetStyle === "pill" || !showControlLabels
                      ? html`<ha-icon
                          icon=${this._presetIcon(attrs.preset_mode)}
                        ></ha-icon>`
                      : this._presetLabel(attrs.preset_mode)}
                  </button>
                `
              : nothing}
          </div>
        </div>
      </ha-card>
    `;
  }

  private _presetLabel(currentPreset?: string): ReturnType<typeof html> {
    if (!currentPreset || currentPreset === "none") {
      return html`
        <ha-icon icon=${PRESET_ICON_FALLBACK}></ha-icon>
        <span>${this._t("select_preset")}</span>
      `;
    }
    const icon = PRESET_ICONS[currentPreset] ?? PRESET_ICON_FALLBACK;
    const label =
      currentPreset.charAt(0).toUpperCase() +
      currentPreset.slice(1).replace(/_/g, " ");
    return html`<ha-icon icon=${icon}></ha-icon>
      <span>${label}</span>`;
  }

  private _presetIcon(currentPreset?: string): string {
    if (!currentPreset || currentPreset === "none") return PRESET_ICON_FALLBACK;
    return PRESET_ICONS[currentPreset] ?? PRESET_ICON_FALLBACK;
  }

  private _presetPillLabel(currentPreset?: string): string {
    if (!currentPreset || currentPreset === "none")
      return this._t("select_preset");
    return (
      currentPreset.charAt(0).toUpperCase() +
      currentPreset.slice(1).replace(/_/g, " ")
    );
  }

  static styles = css`
    ${glassCardStyles}
    ${actionGlowStyles}
    ${setpointSurfaceStyles}
    ${heroTempStyles}

    ha-card {
      border-radius: 32px;
    }

    /* .card-inner's glass/solid background and border come from
       glassCardStyles. Only the two things this card differs on are set
       here. */
    .card-inner {
      /* Tighter than the 12px default: the hero block brings its own
         breathing room by absorbing the card's spare height (flex: 1), so
         the remaining rows can sit closer together and read as one stack
         under it. */
      gap: 8px;
      border-radius: 32px;
    }

    ha-card.unavailable .hero,
    ha-card.unavailable .preset-button,
    ha-card.unavailable .mode-button,
    ha-card.unavailable .setpoint-row {
      opacity: 0.4;
      pointer-events: none;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }

    .header:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
      border-radius: 8px;
    }

    /* Quieter header: smaller icon tile, lighter name weight — the big
       square temperature tile and the colored mode button below are now the
       card's visual anchors, so the header should read as a caption line,
       not a second competing hero. */
    .icon-container {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--m3-icon-bg);
      color: var(--m3-icon-color);
    }

    .icon-container ha-icon {
      --mdc-icon-size: 20px;
    }

    .header-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .name {
      font-size: 16px;
      font-weight: 600;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--primary-text-color);
    }

    .status {
      font-size: 13px;
      opacity: 0.7;
      color: var(--primary-text-color);
    }

    .header-chips {
      flex-shrink: 0;
      display: flex;
      gap: 6px;
    }

    .status-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 500;
      /* Quieter than the mode pills below: the action-glow frame is now the
         card's primary status signal, so header chips stay a supporting
         voice rather than competing blocks of color. */
      background: color-mix(in srgb, var(--primary-text-color) 6%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
    }

    .status-chip ha-icon {
      --mdc-icon-size: 16px;
    }

    .window-chip {
      background: color-mix(
        in srgb,
        var(--m3-window-color, ${unsafeCSS(WINDOW_OPEN_COLOR)}) 16%,
        transparent
      );
      color: var(--m3-window-color, ${unsafeCSS(WINDOW_OPEN_COLOR)});
    }

    .battery-chip {
      background: color-mix(in srgb, var(--error-color, #eb5757) 16%, var(--ha-card-background, var(--card-background-color)));
      color: var(--error-color, #eb5757);
    }

    /* Operating mode and comfort preset share one row. They are the card's
       two "what is it set to" controls and belong at the same level; stacked
       on separate rows they read as two unrelated decisions and cost the
       card an extra band of height. */
    .control-row {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      flex-shrink: 0;
    }

    /* Preset button — a neutral hairline pill above the setpoint row.
       Deliberately colourless: the heat/cool language is reserved for the
       setpoint pill, the mode pill and the glow, so the comfort preset reads
       as the quiet secondary control it is. */
    .preset-button {
      height: 38px;
      width: fit-content;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, transparent);
      border-radius: 999px;
      background: transparent;
      color: var(--primary-text-color);
      opacity: 0.75;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.01em;
      cursor: pointer;
      padding: 0 14px;
    }

    .preset-button:disabled {
      cursor: default;
    }

    .preset-button ha-icon {
      --mdc-icon-size: 18px;
    }

    /* Icon-only: square the padding off so the pill becomes a circle rather
       than a stubby capsule with a glyph rattling around inside it. */
    .preset-button.icon-only,
    .mode-button.icon-only {
      min-width: 0;
      width: 38px;
      padding: 0;
      border-radius: 50%;
    }

    /* Setpoint row — the card's control line: the target temperature as a
       mode-coloured oval (outline + faint wash, the reference card's
       language) flanked by two deliberately unfilled ± affordances. The
       oval is the only filled shape here, so the eye lands on the value
       rather than on the buttons. */
    .setpoint-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      flex-shrink: 0;
      padding: 2px 0;
    }

    /* Bare glyphs, no ring and no ground. The circles drew a box around a
       control that carries no value and no state — all they did was give the
       eye two more shapes to land on before it got to the number between
       them. The 40px box stays for the tap target; it just isn't painted. */
    .stepper-btn {
      flex: 0 0 auto;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      padding: 0;
      line-height: 1;
      /* Dimmed on the ink, not with opacity: opacity would also wash out a
         background someone deliberately configured via plus_opacity. */
      color: color-mix(
        in srgb,
        var(--m3-stepper-color, var(--primary-text-color)) 72%,
        transparent
      );
      background: var(--m3-minus-bg);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition:
        color 0.2s ease,
        transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .stepper-btn ha-icon {
      --mdc-icon-size: 22px;
    }

    .stepper-btn:hover {
      color: var(--m3-stepper-color, var(--primary-text-color));
    }

    .stepper-btn.plus {
      background: var(--m3-plus-bg);
    }

    .stepper-btn:active {
      transform: scale(0.88);
    }

    .stepper-btn:disabled {
      cursor: default;
      opacity: 0.35;
    }

    .card-inner.no-animations .stepper-btn {
      transition: none;
    }

    .card-inner.no-animations .stepper-btn:active {
      transform: none;
    }

    /* The setpoint oval. Colour/outline/ink come from .setpoint-surface
       (shared/climate-surface.ts); only its shape and type live here. The
       previous square tile is gone on purpose: with the current temperature
       now the dominant figure above, the target reads better as the
       reference card's stadium-shaped setpoint oval than as a second big
       block competing with it. */
    .setpoint {
      flex: 0 0 auto;
      min-width: 104px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 16px;
      border-radius: 999px;
      cursor: pointer;
    }

    .setpoint:focus-visible {
      outline: 2px solid var(--m3-setpoint-line, var(--primary-color));
      outline-offset: 3px;
    }

    .setpoint ha-icon {
      --mdc-icon-size: 17px;
      flex-shrink: 0;
      opacity: 0.85;
    }

    .setpoint .value {
      /* Tabular figures: the ± buttons change this value in place, and
         proportional digits make the pill jump width on every press. (The
         hero figure above uses proportional lining figures instead — it
         changes rarely and the narrow "1" is part of the look.) */
      font-size: 21px;
      font-weight: 500;
      letter-spacing: -0.01em;
      line-height: 1;
      white-space: nowrap;
    }

    /* Mode button — the current HVAC mode below the setpoint row. Opens the
       shared dropdown when there's a real choice (more than two modes); with
       exactly two, tapping flips straight to the other one.

       It wears the same outline-and-wash language as the setpoint oval, at
       a lighter wash (MODE_PILL_WASH_PERCENT) and a smaller size. It used to
       be a solid block of the mode colour, which made it the loudest thing
       on the card — louder than the action-glow frame that reports whether
       the thermostat is *actually* running. Colour still tracks
       mode_colors; it just stopped shouting. */
    .mode-button {
      height: 38px;
      width: fit-content;
      /* No min-width any more: it shares a row with the preset button now,
         and a 132px floor pushed the pair to wrap on a narrow column. */
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-width: ${unsafeCSS(MODE_PILL_BORDER_PX)}px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      padding: 0 18px;
    }

    .mode-button:disabled {
      cursor: default;
    }

    .mode-button ha-icon {
      --mdc-icon-size: 18px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-climate-card": M3ClimateCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-climate-card",
  name: "M3 Climate Card",
  description:
    "Eine Material-3-inspirierte Klimakarte für climate-Entities (Klimaanlagen & Heizungsthermostate).",
  preview: true,
  documentationURL:
    "https://github.com/j0sp0r/m3-cards",
});
