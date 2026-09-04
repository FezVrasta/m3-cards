import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3ClimateCardMiniConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  HvacMode,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_MODE_COLORS,
  DEFAULT_TEMP_STEP,
  DEFAULT_MINI_RADIUS,
  resolveCornerRadius,
  THEME_COLOR_TOKENS,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { glassBackground } from "./shared/glass-card";
import { hassChangeMatters } from "./shared/should-update";
import { formatNumber } from "./shared/formatting";
import { renderMissingEntity } from "./shared/glass-card";
import { shouldAnimate } from "./shared/animation";
import { migrateAnimationsField } from "./shared/config-migration";
import { activateOnKey } from "./shared/a11y";
import { tintOn, foregroundOn } from "./shared/color-config";

console.info(
  `%c M3-CLIMATE-CARD-MINI %c v${CARD_VERSION} `,
  "color: #222; background: #5dcaa5; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #5dcaa5; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

@customElement("m3-climate-card-mini")
export class M3ClimateCardMini extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ClimateCardMiniConfig;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-climate-card-mini-editor");
    return document.createElement(
      "m3-climate-card-mini-editor",
    ) as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(
    hass: HomeAssistant,
  ): M3ClimateCardMiniConfig {
    const climateEntity = Object.keys(hass?.states ?? {}).find((eid) =>
      eid.startsWith("climate."),
    );
    return {
      type: "custom:m3-climate-card-mini",
      entity: climateEntity ?? "",
      glass_background: true,
    };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return hassChangeMatters(changed, this.hass, [this._config?.entity]);
  }

  public setConfig(config: M3ClimateCardMiniConfig): void {
    if (!config.entity) {
      throw new Error(
        "Bitte eine climate-Entität auswählen / Please select a climate entity",
      );
    }
    this._config = migrateAnimationsField({
      glass_background: true,
      ...config,
    });
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: 6,
      rows: "auto",
      min_columns: 3,
      min_rows: 2,
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

  private _handlePowerToggle(unavailable: boolean): void {
    if (unavailable || !this.hass || !this._config) return;
    this.hass.callService("homeassistant", "toggle", {
      entity_id: this._config.entity,
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
    const active = !unavailable && currentMode !== "off";
    const modeColor = this._modeColor(unavailable ? "off" : currentMode);
    const offColor = this._modeColor("off");

    const iconActiveColor = this._config.icon_active_color
      ? this._resolveColor(this._config.icon_active_color)
      : modeColor;
    const iconInactiveColor = this._config.icon_inactive_color
      ? this._resolveColor(this._config.icon_inactive_color)
      : offColor;
    const powerActiveColor = this._config.power_active_color
      ? this._resolveColor(this._config.power_active_color)
      : modeColor;
    const powerInactiveColor = this._config.power_inactive_color
      ? this._resolveColor(this._config.power_inactive_color)
      : offColor;
    const plusActiveColor = this._config.plus_active_color
      ? this._resolveColor(this._config.plus_active_color)
      : modeColor;
    const plusInactiveColor = this._config.plus_inactive_color
      ? this._resolveColor(this._config.plus_inactive_color)
      : offColor;
    const minusActiveColor = this._config.minus_active_color
      ? this._resolveColor(this._config.minus_active_color)
      : "var(--primary-text-color)";
    const minusInactiveColor = this._config.minus_inactive_color
      ? this._resolveColor(this._config.minus_inactive_color)
      : "var(--primary-text-color)";
    const plusColor = active ? plusActiveColor : plusInactiveColor;
    const minusColor = active ? minusActiveColor : minusInactiveColor;

    // Each of these glyphs sits in its own tinted well, so its colour is
    // measured against that well rather than against the card.
    const iconInactiveBg = tintOn(this, 
      iconInactiveColor,
      this._config.icon_inactive_opacity,
      14,
    );
    const iconActiveBg = tintOn(this, 
      iconActiveColor,
      this._config.icon_active_opacity,
      22,
    );
    const powerInactiveBg = tintOn(this, 
      powerInactiveColor,
      this._config.power_inactive_opacity,
      14,
    );
    const powerActiveBg = tintOn(this, 
      powerActiveColor,
      this._config.power_active_opacity,
      30,
    );
    const minusBg = tintOn(this, minusColor, this._config.minus_opacity, 8);
    const plusBg = tintOn(this, plusColor, this._config.plus_opacity, 20);

    const hvacModesRaw: string[] = Array.isArray(attrs.hvac_modes)
      ? attrs.hvac_modes
      : [];

    const name = this._config.name || attrs.friendly_name || this._config.entity;
    const icon = this._config.icon || this._defaultIcon(hvacModesRaw);

    const currentTemperature: number | undefined =
      typeof attrs.current_temperature === "number"
        ? attrs.current_temperature
        : undefined;
    const tempUnit = this.hass.config?.unit_system?.temperature ?? "°C";
    const modeLabel = unavailable
      ? this._t("unavailable")
      : (this._t(currentMode as TranslationKey) ?? currentMode);
    const statusText =
      !unavailable && currentTemperature !== undefined
        ? `${this._formatNumber(currentTemperature)} ${tempUnit} · ${modeLabel}`
        : modeLabel;

    const targetTemp: number | undefined =
      typeof attrs.temperature === "number" ? attrs.temperature : undefined;
    const step = attrs.target_temp_step ?? DEFAULT_TEMP_STEP;
    const minTemp = attrs.min_temp ?? 7;
    const maxTemp = attrs.max_temp ?? 35;
    const radius = resolveCornerRadius(
      this._config.radius ?? DEFAULT_MINI_RADIUS,
      this._config.corners,
    );
    const animClass = shouldAnimate(this._config.animation) ? "" : "no-animations";

    return html`
      <ha-card
        style=${`--m3-mode-color: ${modeColor}; --m3-icon-active-color: ${foregroundOn(iconActiveColor, iconActiveBg)}; --m3-icon-inactive-color: ${foregroundOn(iconInactiveColor, iconInactiveBg)}; --m3-power-active-color: ${foregroundOn(powerActiveColor, powerActiveBg)}; --m3-power-inactive-color: ${foregroundOn(powerInactiveColor, powerInactiveBg)}; --m3-plus-color: ${plusColor}; --m3-minus-color: ${minusColor}; --m3-icon-inactive-bg: ${iconInactiveBg}; --m3-icon-active-bg: ${iconActiveBg}; --m3-power-inactive-bg: ${powerInactiveBg}; --m3-power-active-bg: ${powerActiveBg}; --m3-minus-bg: ${minusBg}; --m3-plus-bg: ${plusBg}; border-radius: ${radius};`}
        class=${dimUnavailable ? "unavailable" : ""}
      >
        <div
          class="card-inner ${this._config.glass_background === false
            ? "solid"
            : "glass"} ${animClass}"
          style=${`border-radius: ${radius};`}
        >
          <div class="header">
            <div
              class="icon-swatch ${active ? "active" : ""}"
              role="button"
              tabindex="0"
              aria-label=${name}
              @click=${() => this._fireMoreInfo(this._config?.entity)}
              @keydown=${activateOnKey(() =>
                this._fireMoreInfo(this._config?.entity),
              )}
            >
              <ha-icon icon=${icon}></ha-icon>
            </div>
            <div
              class="text-block"
              role="button"
              tabindex="0"
              aria-label=${name}
              @click=${() => this._fireMoreInfo(this._config?.entity)}
              @keydown=${activateOnKey(() =>
                this._fireMoreInfo(this._config?.entity),
              )}
            >
              <div class="name">${name}</div>
              <div class="status">${statusText}</div>
            </div>
            <button
              class="power-btn ${active ? "active" : ""}"
              ?disabled=${dimUnavailable}
              aria-label="mdi:power"
              @click=${() => this._handlePowerToggle(dimUnavailable)}
            >
              <ha-icon icon="mdi:power"></ha-icon>
            </button>
          </div>

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
              class="stepper-value"
              role="button"
              tabindex="0"
              aria-label=${this._t("target_temperature")}
              @click=${() => this._fireMoreInfo(this._config?.entity)}
              @keydown=${activateOnKey(() =>
                this._fireMoreInfo(this._config?.entity),
              )}
            >
              ${unavailable || targetTemp === undefined
                ? "–"
                : `${this._formatNumber(targetTemp)}°`}
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

  static styles = css`
    /* See the note in m3-button-card: ha-card is a size container, so a
       percentage height that does not resolve leaves it at 0. This card had no
       min-height at all, so in a masonry column it collapsed entirely — host
       included.

       112px is the smallest height at which the compact layout still fits
       without clipping — measured, not chosen. A floor has to be low enough
       that it never overrides a height someone configured: 168px, the natural
       full-layout height, looked right on its own but silently forced a
       configured 110px tile up to 168 and broke the compact mode that exists
       for exactly those sizes. The three sizes below 112px that this does
       raise were already clipping their own content before it. */
    :host {
      /* No grey tap rectangle over a rounded card — see glass-card.ts. */
      -webkit-tap-highlight-color: transparent;
      display: grid;
      height: 100%;
      min-height: 112px;
    }

    ha-card {
      border-radius: 28px;
      overflow: hidden;
      box-shadow: none;
      background: transparent;
      container-type: size;
    }

    .card-inner {
      box-sizing: border-box;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 10px;
      border-radius: 28px;
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

    ha-card.unavailable .power-btn,
    ha-card.unavailable .stepper-row {
      opacity: 0.4;
      pointer-events: none;
    }

    .missing-entity {
      padding: 16px;
      color: var(--error-color, red);
      font-size: 14px;
    }

    .header {
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-areas:
        "icon .    power"
        "text text text";
      gap: 8px 10px;
      align-items: start;
    }

    .icon-swatch {
      grid-area: icon;
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--m3-icon-inactive-bg);
      color: var(--m3-icon-inactive-color);
      cursor: pointer;
      transition: all 0.35s cubic-bezier(0.2, 0, 0, 1);
    }

    .icon-swatch.active {
      background: var(--m3-icon-active-bg);
      color: var(--m3-icon-active-color);
    }

    .icon-swatch:focus-visible,
    .text-block:focus-visible,
    .stepper-value:focus-visible {
      outline: 2px solid var(--m3-icon-active-color, var(--primary-color));
      outline-offset: 2px;
      border-radius: 8px;
    }

    .icon-swatch ha-icon {
      --mdc-icon-size: 24px;
    }

    .power-btn {
      grid-area: power;
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--m3-power-inactive-bg);
      color: var(--m3-power-inactive-color);
      cursor: pointer;
      padding: 0;
      transition: all 0.35s cubic-bezier(0.2, 0, 0, 1);
    }

    .power-btn:disabled {
      cursor: default;
    }

    .power-btn.active {
      border-radius: 50%;
      background: var(--m3-power-active-bg);
      color: var(--m3-power-active-color);
    }

    .power-btn ha-icon {
      --mdc-icon-size: 18px;
    }

    .card-inner.no-animations .icon-swatch,
    .card-inner.no-animations .power-btn,
    .card-inner.no-animations .stepper-btn {
      transition: none;
    }

    .card-inner.no-animations .stepper-btn:active {
      transform: none;
    }

    .text-block {
      grid-area: text;
      display: flex;
      flex-direction: column;
      gap: 2px;
      cursor: pointer;
      min-width: 0;
    }

    .name {
      font-size: 16px;
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--primary-text-color);
    }

    .stepper-row {
      display: flex;
      height: 40px;
      flex-shrink: 0;
      gap: 2px;
      margin-top: auto;
    }

    .stepper-btn {
      flex: 1;
      border: none;
      font-size: 18px;
      font-weight: 500;
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition:
        background 0.35s cubic-bezier(0.2, 0, 0, 1),
        border-radius 0.35s cubic-bezier(0.2, 0, 0, 1),
        transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .stepper-btn:active {
      transform: scale(0.88);
    }

    .stepper-btn:disabled {
      cursor: default;
    }

    .stepper-btn.minus {
      border-radius: 20px 8px 8px 20px;
      background: var(--m3-minus-bg);
    }

    .stepper-btn.plus {
      border-radius: 8px 20px 20px 8px;
      background: var(--m3-plus-bg);
    }

    .stepper-value {
      flex: 1.3;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: color-mix(in srgb, var(--primary-text-color) 4%, var(--ha-card-background, var(--card-background-color)));
      text-align: center;
      font-size: 16px;
      font-weight: 700;
      color: var(--primary-text-color);
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @container (max-height: 150px) {
      .header {
        grid-template-areas: "icon text power";
        align-items: center;
      }

      .icon-swatch {
        width: 32px;
        height: 32px;
        border-radius: 50%;
      }

      .icon-swatch ha-icon {
        --mdc-icon-size: 16px;
      }
    }

    @container (max-height: 150px) and (max-width: 230px) {
      .header {
        grid-template-columns: 1fr auto;
        grid-template-areas: "text power";
      }

      .icon-swatch {
        display: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-climate-card-mini": M3ClimateCardMini;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-climate-card-mini",
  name: "M3 Climate Card Mini",
  description:
    "Eine kompakte Material-3-inspirierte Klimakarte für climate-Entities, geeignet für zwei Kacheln nebeneinander auf schmalen Bildschirmen.",
  preview: true,
  documentationURL:
    "https://github.com/j0sp0r/m3-cards",
});
