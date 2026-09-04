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
  resolveCornerRadius,
  THEME_COLOR_TOKENS,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { glassBackground } from "./shared/glass-card";
import { hassChangeMatters } from "./shared/should-update";
import { formatNumber } from "./shared/formatting";
import { renderMissingEntity } from "./shared/glass-card";
import { tintOn } from "./shared/color-config";
import { shouldAnimate } from "./shared/animation";
import { migrateAnimationsField } from "./shared/config-migration";
import { activateOnKey } from "./shared/a11y";
import { TemplatedCard } from "./shared/templated-card";

console.info(
  `%c M3-CLIMATE-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #5dcaa5; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #5dcaa5; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

@customElement("m3-climate-card")
export class M3ClimateCard extends TemplatedCard(LitElement) implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ClimateCardConfig;

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
      min_rows: 3,
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

  private _fireMoreInfo(entityId?: string): void {
    if (!entityId) return;
    const event = new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(event);
  }

  private _handleModeClick(mode: string, unavailable: boolean): void {
    if (unavailable || !this.hass || !this._config) return;
    this.hass.callService("climate", "set_hvac_mode", {
      entity_id: this._config.entity,
      hvac_mode: mode,
    });
  }

  private _handlePresetClick(
    presetModes: string[],
    currentPreset: string | undefined,
    unavailable: boolean,
  ): void {
    if (unavailable || !this.hass || !this._config || presetModes.length === 0)
      return;
    const currentIndex = currentPreset ? presetModes.indexOf(currentPreset) : -1;
    const next = presetModes[(currentIndex + 1) % presetModes.length];
    this.hass.callService("climate", "set_preset_mode", {
      entity_id: this._config.entity,
      preset_mode: next,
    });
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
    const offColor = this._modeColor("off");
    const active = !unavailable && currentMode !== "off";

    const iconActiveColor = this._config.icon_active_color
      ? this._resolveColor(this._config.icon_active_color)
      : "var(--primary-color)";
    const iconInactiveColor = this._config.icon_inactive_color
      ? this._resolveColor(this._config.icon_inactive_color)
      : "var(--primary-color)";
    const iconColor = active ? iconActiveColor : iconInactiveColor;

    const plusActiveColor = this._config.plus_active_color
      ? this._resolveColor(this._config.plus_active_color)
      : modeColor;
    const plusInactiveColor = this._config.plus_inactive_color
      ? this._resolveColor(this._config.plus_inactive_color)
      : offColor;
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
    const heightStyle = this._config.height ? `min-height: ${this._config.height}px;` : "";
    const animClass = shouldAnimate(this._config.animation) ? "" : "no-animations";

    return html`
      <ha-card
        style=${`--m3-mode-color: ${modeColor}; --m3-icon-color: ${iconColor}; --m3-plus-color: ${plusColor}; --m3-minus-color: ${minusColor}; --m3-icon-bg: ${tintOn(this, iconColor, this._config.icon_opacity, 18)}; --m3-plus-bg: ${tintOn(this, plusColor, this._config.plus_opacity, 20)}; --m3-minus-bg: ${tintOn(this, minusColor, this._config.minus_opacity, 8)}; border-radius: ${radius};`}
        class=${dimUnavailable ? "unavailable" : ""}
      >
        <div
          class="card-inner ${this._config.glass_background === false
            ? "solid"
            : "glass"} ${animClass}"
          style=${`border-radius: ${radius}; ${heightStyle}`}
        >
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
              <div class="status">${statusText}</div>
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

          <div class="mode-row">
            ${hvacModes.map((mode) => {
              const active = mode === currentMode && !unavailable;
              return html`
                <button
                  class="pill ${active ? "active" : ""}"
                  style=${`--pill-color: ${this._modeColor(mode)};`}
                  ?disabled=${dimUnavailable}
                  aria-label=${this._t(mode as TranslationKey)}
                  title=${this._t(mode as TranslationKey)}
                  @click=${() => this._handleModeClick(mode, dimUnavailable)}
                >
                  <ha-icon icon=${this._modeIcon(mode)}></ha-icon>
                </button>
              `;
            })}
            ${showPresets && presetStyle === "pill"
              ? html`
                  <button
                    class="pill"
                    ?disabled=${dimUnavailable}
                    aria-label=${this._presetPillLabel(attrs.preset_mode)}
                    title=${this._presetPillLabel(attrs.preset_mode)}
                    @click=${() =>
                      this._handlePresetClick(
                        presetModes,
                        attrs.preset_mode,
                        dimUnavailable,
                      )}
                  >
                    <ha-icon
                      icon=${this._presetIcon(attrs.preset_mode)}
                    ></ha-icon>
                  </button>
                `
              : nothing}
          </div>

          ${showSensors &&
          ((currentTemperature !== undefined && !tempInHeader) ||
            currentHumidity !== undefined)
            ? html`
                <div class="info-row">
                  ${currentTemperature !== undefined && !tempInHeader
                    ? html`
                        <div class="sensor-chip">
                          <ha-icon icon="mdi:thermometer"></ha-icon>
                          <span
                            >${unavailable
                              ? "–"
                              : `${this._formatNumber(currentTemperature)} ${tempUnit}`}</span
                          >
                        </div>
                      `
                    : nothing}
                  ${currentHumidity !== undefined
                    ? html`
                        <div class="sensor-chip">
                          <ha-icon icon="mdi:water-percent"></ha-icon>
                          <span
                            >${unavailable
                              ? "–"
                              : `${this._formatNumber(currentHumidity, 0)} %`}</span
                          >
                        </div>
                      `
                    : nothing}
                </div>
              `
            : nothing}
          ${showPresets && presetStyle === "chip"
            ? html`
                <button
                  class="preset-chip"
                  ?disabled=${dimUnavailable}
                  @click=${() =>
                    this._handlePresetClick(
                      presetModes,
                      attrs.preset_mode,
                      dimUnavailable,
                    )}
                >
                  ${this._presetLabel(attrs.preset_mode)}
                </button>
              `
            : nothing}

          <div class="stepper-row">
            <button
              class="stepper-btn minus"
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
              −
            </button>
            <div
              class="stepper-display"
              role="button"
              tabindex="0"
              aria-label=${this._t("target_temperature")}
              @click=${() => this._fireMoreInfo(this._config?.entity)}
              @keydown=${activateOnKey(() => this._fireMoreInfo(this._config?.entity))}
            >
              <div class="value">
                ${unavailable || targetTemp === undefined
                  ? "–"
                  : `${this._formatNumber(targetTemp)} ${tempUnit}`}
              </div>
              <div class="label">${this._t("target_temperature")}</div>
            </div>
            <button
              class="stepper-btn plus"
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
              +
            </button>
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
    :host {
      /* No grey tap rectangle over a rounded card — see glass-card.ts. */
      -webkit-tap-highlight-color: transparent;
      display: block;
      height: 100%;
    }

    ha-card {
      height: 100%;
      border-radius: 32px;
      overflow: hidden;
      box-shadow: none;
      background: transparent;
    }

    .card-inner {
      box-sizing: border-box;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border-radius: 32px;
      border: 1px solid rgba(100, 100, 100, 0.25);
    }

    .card-inner.glass {
      /* Shared value — see glassBackground in shared/glass-card.ts. */
      background: ${glassBackground};
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      /* Forces its own compositor layer. Without this, Chromium sometimes
         renders a visible seam where two adjacent backdrop-filter elements'
         GPU tiles meet (flickers/disappears on scroll-triggered repaint) —
         a known browser tiling bug, not a layout issue on our end.
         glassCardStyles has carried this since it was found; these three
         cards hand-roll their own copy of the rule and so never got it. */
      transform: translateZ(0);
      isolation: isolate;
    }

    .card-inner.solid {
      background: var(--ha-card-background, var(--card-background-color));
    }

    ha-card.unavailable .mode-row,
    ha-card.unavailable .info-row,
    ha-card.unavailable .preset-chip,
    ha-card.unavailable .stepper-row {
      opacity: 0.4;
      pointer-events: none;
    }

    .missing-entity {
      padding: 16px;
      color: var(--error-color, red);
      font-size: 14px;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }

    .header:focus-visible {
      outline: 2px solid var(--m3-icon-active-color);
      outline-offset: 2px;
      border-radius: 8px;
    }

    .icon-container {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 17px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--m3-icon-bg);
      color: var(--m3-icon-color);
    }

    .icon-container ha-icon {
      --mdc-icon-size: 24px;
    }

    .header-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .name {
      font-size: 18px;
      font-weight: 700;
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
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
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

    /* Mode pills */
    .mode-row {
      display: flex;
      gap: 8px;
    }

    .pill {
      flex: 1;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 26px;
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      cursor: pointer;
      padding: 0;
      transition: all 0.35s cubic-bezier(0.2, 0, 0, 1);
    }

    .pill:disabled {
      cursor: default;
    }

    .card-inner.no-animations .pill,
    .card-inner.no-animations .pill ha-icon,
    .card-inner.no-animations .stepper-btn {
      transition: none;
    }

    .card-inner.no-animations .stepper-btn:active {
      transform: none;
    }

    .pill ha-icon {
      --mdc-icon-size: 24px;
      transition: color 0.35s cubic-bezier(0.2, 0, 0, 1);
    }

    .pill.active {
      border-radius: 16px;
      background: var(--pill-color);
    }

    .pill.active ha-icon {
      color: color-mix(in srgb, var(--pill-color) 65%, black 35%);
    }

    /* Info row / sensor chips */
    .info-row {
      display: flex;
      gap: 8px;
      justify-content: center;
    }

    .sensor-chip {
      height: 36px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 14px;
      border-radius: 18px;
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 500;
    }

    .sensor-chip ha-icon {
      --mdc-icon-size: 16px;
      opacity: 0.8;
    }

    /* Preset chip */
    .preset-chip {
      height: 48px;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: none;
      border-radius: 24px;
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      padding: 0 16px;
    }

    .preset-chip ha-icon {
      --mdc-icon-size: 20px;
    }

    /* Temperature stepper */
    .stepper-row {
      display: flex;
      height: 60px;
      flex-shrink: 0;
      gap: 2px;
      margin-top: auto;
    }

    .stepper-btn {
      flex: 1;
      border: none;
      font-size: 24px;
      font-weight: 500;
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .stepper-btn:active {
      transform: scale(0.88);
    }

    .stepper-btn:disabled {
      cursor: default;
    }

    .stepper-btn.minus {
      border-radius: 30px 12px 12px 30px;
      background: var(--m3-minus-bg);
    }

    .stepper-btn.plus {
      border-radius: 12px 30px 30px 12px;
      background: var(--m3-plus-bg);
    }

    .stepper-display {
      flex: 1;
      min-width: 0;
      border-radius: 12px;
      background: color-mix(in srgb, var(--primary-text-color) 4%, var(--ha-card-background, var(--card-background-color)));
      display: flex;
      flex-direction: column;
      align-content: center;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0 8px;
    }

    .stepper-display:focus-visible {
      outline: 2px solid var(--m3-icon-active-color);
      outline-offset: 2px;
    }

    .stepper-display .value {
      font-size: 21px;
      font-weight: 700;
      color: var(--primary-text-color);
      line-height: 1.2;
    }

    .stepper-display .label {
      font-size: 11px;
      opacity: 0.6;
      color: var(--primary-text-color);
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
