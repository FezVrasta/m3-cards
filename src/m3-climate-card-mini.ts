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
  MODE_ICONS,
  DEFAULT_TEMP_STEP,
  DEFAULT_MINI_RADIUS,
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
import { shouldAnimate } from "./shared/animation";
import { migrateAnimationsField } from "./shared/config-migration";
import { activateOnKey } from "./shared/a11y";
import { tintOn, foregroundOn } from "./shared/color-config";
import {
  resolveSetpointSurface,
  setpointSurfaceStyles,
} from "./shared/climate-surface";
import { TemplatedCard } from "./shared/templated-card";

console.info(
  `%c M3-CLIMATE-CARD-MINI %c v${CARD_VERSION} `,
  "color: #222; background: #5dcaa5; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #5dcaa5; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

@customElement("m3-climate-card-mini")
export class M3ClimateCardMini extends TemplatedCard(LitElement) implements LovelaceCard {
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

  private _handlePowerToggle(unavailable: boolean): void {
    if (unavailable || !this.hass || !this._config) return;
    this.hass.callService("homeassistant", "toggle", {
      entity_id: this._config.entity,
    });
  }

  // Mirrors the full card: a ± segment carries no value, so it gets a
  // neutral ground unless the user explicitly asked for a tint.
  private _stepperFill(color: string, opacity: number | undefined): string {
    if (opacity === undefined) {
      return "color-mix(in srgb, var(--primary-text-color) 7%, var(--ha-card-background, var(--card-background-color)))";
    }
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
      // Was 22, then 18 — down to a whisper now that the setpoint segment
      // below carries the mode colour as an outlined value. Three
      // mode-coloured blocks (icon well, power button, setpoint) is one more
      // than the reference card would ever put on one surface; the power
      // button stays filled because it is the on/off affordance, and this
      // one recedes.
      12,
    );
    const powerInactiveBg = tintOn(this, 
      powerInactiveColor,
      this._config.power_inactive_opacity,
      14,
    );
    const powerActiveBg = tintOn(this,
      powerActiveColor,
      this._config.power_active_opacity,
      // Was 30 — see iconActiveBg above.
      24,
    );
    // The ± segments default to a neutral ground rather than a mode tint:
    // the mode colour now lives on the setpoint segment between them, where
    // it labels an actual value instead of a button. Explicit
    // minus_opacity / plus_opacity still tint them as before.
    const minusBg = this._stepperFill(minusColor, this._config.minus_opacity);
    const plusBg = this._stepperFill(plusColor, this._config.plus_opacity);

    // The setpoint segment wears the reference card's oval language: the
    // mode colour as a thin outline over a faint same-colour wash.
    const setpoint = resolveSetpointSurface(
      this,
      modeColor,
      undefined,
      SETPOINT_WASH_PERCENT,
      SETPOINT_LINE_PERCENT,
    );

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
    // Split rather than one string: the current reading is what you glance
    // at, the mode label is context. Same two-level hierarchy the full
    // card's hero figure gets, at mini scale.
    const statusTemp =
      !unavailable && currentTemperature !== undefined
        ? `${this._formatNumber(currentTemperature)} ${tempUnit}`
        : undefined;

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
    const glow = resolveActionGlow(attrs, currentMode, unavailable);

    return html`
      <ha-card
        style=${`--m3-mode-color: ${modeColor}; --m3-icon-active-color: ${foregroundOn(iconActiveColor, iconActiveBg)}; --m3-icon-inactive-color: ${foregroundOn(iconInactiveColor, iconInactiveBg)}; --m3-power-active-color: ${foregroundOn(powerActiveColor, powerActiveBg)}; --m3-power-inactive-color: ${foregroundOn(powerInactiveColor, powerInactiveBg)}; --m3-plus-color: ${plusColor}; --m3-minus-color: ${minusColor}; --m3-icon-inactive-bg: ${iconInactiveBg}; --m3-icon-active-bg: ${iconActiveBg}; --m3-power-inactive-bg: ${powerInactiveBg}; --m3-power-active-bg: ${powerActiveBg}; --m3-minus-bg: ${minusBg}; --m3-plus-bg: ${plusBg}; --m3-setpoint-bg: ${setpoint.bg}; --m3-setpoint-ink: ${setpoint.ink}; --m3-setpoint-line: ${setpoint.line}; border-radius: ${radius};`}
        class=${dimUnavailable ? "unavailable" : ""}
      >
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)} ${animClass}"
          style=${`border-radius: ${radius};`}
        >
          ${renderActionGlow(glow, this._config.show_action_glow)}
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
              <div class="status">
                ${statusTemp !== undefined
                  ? html`<span class="status-temp">${statusTemp}</span
                      ><span class="status-sep">·</span>`
                  : nothing}
                <span class="status-mode">${modeLabel}</span>
              </div>
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
              class="stepper-value setpoint-surface"
              role="button"
              tabindex="0"
              aria-label=${this._t("target_temperature")}
              @click=${() => this._fireMoreInfo(this._config?.entity)}
              @keydown=${activateOnKey(() =>
                this._fireMoreInfo(this._config?.entity),
              )}
            >
              ${active
                ? html`<ha-icon icon=${this._modeIcon(currentMode)}></ha-icon>`
                : nothing}
              <span
                >${unavailable || targetTemp === undefined
                  ? "–"
                  : `${this._formatNumber(targetTemp)}°`}</span
              >
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
    ${glassCardStyles}
    ${actionGlowStyles}
    ${setpointSurfaceStyles}

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
      display: grid;
      min-height: 112px;
    }

    ha-card {
      border-radius: 28px;
      container-type: size;
    }

    /* .card-inner's glass/solid background and border come from
       glassCardStyles. Only the layout this card differs on is set here. */
    .card-inner {
      gap: 10px;
      padding: var(--m3-group-padding, 12px 10px);
      border-radius: 28px;
    }

    ha-card.unavailable .power-btn,
    ha-card.unavailable .stepper-row {
      opacity: 0.4;
      pointer-events: none;
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
      display: flex;
      align-items: baseline;
      gap: 5px;
      min-width: 0;
      font-size: 13px;
      overflow: hidden;
      white-space: nowrap;
      color: var(--primary-text-color);
    }

    /* The reading carries more weight than the mode word beside it. */
    .status-temp {
      font-weight: 600;
      opacity: 0.85;
      flex-shrink: 0;
    }

    .status-sep {
      opacity: 0.35;
      flex-shrink: 0;
    }

    .status-mode {
      opacity: 0.6;
      overflow: hidden;
      text-overflow: ellipsis;
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
      /* See the full card: dim the glyph, not the segment, so a configured
         plus_opacity / minus_opacity tint keeps its strength. */
      color: color-mix(in srgb, var(--primary-text-color) 75%, transparent);
      background: var(--m3-minus-bg);
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

    /* The setpoint segment. Colour/outline/ink come from .setpoint-surface
       (shared/climate-surface.ts), the same recipe the full card's setpoint
       oval uses, so the two cards can't drift apart. It is the only
       mode-coloured shape in this row — the ± segments beside it went
       neutral in the same pass. */
    .stepper-value {
      flex: 1.4;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border-radius: 8px;
      text-align: center;
      /* Lighter than the previous 800: it is now carried by its own tinted,
         outlined shape rather than by sheer weight. */
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.01em;
      cursor: pointer;
      overflow: hidden;
      white-space: nowrap;
    }

    .stepper-value ha-icon {
      --mdc-icon-size: 15px;
      flex-shrink: 0;
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

    /* Narrow tile: the segment is barely wider than the number itself, and
       the mode glyph would push it into an ellipsis. The tint and outline
       still say heat/cool, so nothing is lost by dropping it. */
    @container (max-width: 230px) {
      .stepper-value ha-icon {
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
