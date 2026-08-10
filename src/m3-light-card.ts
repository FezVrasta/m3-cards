import { LitElement, html, css, svg, unsafeCSS, nothing, type PropertyValues } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3LightCardConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_LIGHT_RADIUS,
  DEFAULT_LIGHT_ICON,
  DEFAULT_LIGHT_ACCENT,
  LIGHT_OFF_COLOR,
  LIGHT_POWER_BTN_SIZE,
  LIGHT_POWER_BTN_RADIUS_ON,
  LIGHT_POWER_BTN_RADIUS_OFF,
  LIGHT_WAVE_HEIGHT,
  LIGHT_WAVE_AMPLITUDE,
  LIGHT_WAVE_WAVELENGTH,
  LIGHT_WAVE_PHASE_SPEED,
  LIGHT_WAVE_STROKE,
  LIGHT_WAVE_GAP,
  LIGHT_WAVE_AMPLITUDE_LERP,
  LIGHT_HANDLE_WIDTH,
  LIGHT_HANDLE_HEIGHT,
  LIGHT_HANDLE_RADIUS,
  LIGHT_THROTTLE_MS,
  LIGHT_DRAG_SETTLE_MS,
  LIGHT_MIN_BRIGHTNESS_PCT,
  resolveCornerRadius,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors } from "./shared/color-config";
import { glassCardStyles, glassCardClass, renderMissingEntity } from "./shared/glass-card";
import { renderCardHeader, cardHeaderStyles } from "./shared/card-header";
import { shouldAnimate, isReducedMotion, STANDARD_EASING } from "./shared/animation";
import { fireEvent } from "./shared/editor-helpers";
import { buildWavePath } from "./shared/wave";
import { stampVersion } from "./shared/config-migration";
import { localize, type TranslationKey } from "./localize";

console.info(
  `%c M3-LIGHT-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #ffc773; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #ffc773; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const EASING = unsafeCSS(STANDARD_EASING);
const DEFAULT_SLIDER_WIDTH = 220;

@customElement("m3-light-card")
export class M3LightCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3LightCardConfig;

  @state() private _phase = 0;
  @state() private _displayAmplitude = 0;
  @state() private _measuredWidth = DEFAULT_SLIDER_WIDTH;
  @state() private _dragging = false;
  @state() private _dragValue?: number;

  @query(".wave-slider") private _sliderEl?: HTMLDivElement;

  private _rafId?: number;
  private _resizeObserver?: ResizeObserver;
  private _intersectionObserver?: IntersectionObserver;
  private _isIntersecting = true;
  private _targetAmplitude = 0;
  private _phaseAnimating = false;

  private _throttleTimer?: number;
  private _pendingPct?: number;
  private _lastCallTs = 0;
  private _dragEndTimer?: number;

  private _entityPct = 0;
  private _unavailable = false;

  public static getStubConfig(hass: HomeAssistant): M3LightCardConfig {
    const entities = Object.keys(hass?.states ?? {}).filter((eid) =>
      eid.startsWith("light."),
    );
    return {
      type: "custom:m3-light-card",
      entity: entities[0] ?? "",
      glass_background: true,
    };
  }

  public setConfig(config: M3LightCardConfig): void {
    if (!config.entity) {
      throw new Error(
        "Bitte eine Licht-Entität auswählen / Please select a light entity",
      );
    }
    this._config = stampVersion({
      glass_background: true,
      animation: "auto",
      wave_style: "wavy",
      use_light_color: true,
      ...config,
    });
  }

  public getCardSize(): number {
    return 2;
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: "full",
      rows: "auto",
      min_rows: 2,
    };
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-light-card-editor");
    return document.createElement("m3-light-card-editor") as unknown as LovelaceCardEditor;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this._handleVisibilityChange);
    this._intersectionObserver = new IntersectionObserver((entries) => {
      this._isIntersecting = entries.some((e) => e.isIntersecting);
      this.requestUpdate();
    });
    this._intersectionObserver.observe(this);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener(
      "visibilitychange",
      this._handleVisibilityChange,
    );
    this._intersectionObserver?.disconnect();
    this._resizeObserver?.disconnect();
    this._stopAnimationLoop();
    if (this._throttleTimer !== undefined) clearTimeout(this._throttleTimer);
    if (this._dragEndTimer !== undefined) clearTimeout(this._dragEndTimer);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (this._sliderEl && !this._resizeObserver) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (width && Math.abs(width - this._measuredWidth) > 0.5) {
          this._measuredWidth = width;
        }
      });
      this._resizeObserver.observe(this._sliderEl);
      const rect = this._sliderEl.getBoundingClientRect();
      if (rect.width) this._measuredWidth = rect.width;
    }
  }

  private _handleVisibilityChange = (): void => {
    if (document.hidden) {
      this._stopAnimationLoop();
    } else {
      this.requestUpdate();
    }
  };

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _startAnimationLoop(): void {
    if (this._rafId !== undefined) return;
    const step = () => {
      this._rafId = requestAnimationFrame(step);
      this._tick();
    };
    this._rafId = requestAnimationFrame(step);
  }

  private _stopAnimationLoop(): void {
    if (this._rafId !== undefined) {
      cancelAnimationFrame(this._rafId);
      this._rafId = undefined;
    }
  }

  private _tick(): void {
    if (document.hidden || !this._isIntersecting) {
      this._stopAnimationLoop();
      return;
    }
    let changed = false;
    const ampDelta = this._targetAmplitude - this._displayAmplitude;
    if (Math.abs(ampDelta) > 0.01) {
      this._displayAmplitude += ampDelta * LIGHT_WAVE_AMPLITUDE_LERP;
      changed = true;
    } else if (this._displayAmplitude !== this._targetAmplitude) {
      this._displayAmplitude = this._targetAmplitude;
      changed = true;
    }
    if (this._phaseAnimating) {
      this._phase -= LIGHT_WAVE_PHASE_SPEED;
      changed = true;
    }
    if (!changed) {
      this._stopAnimationLoop();
      return;
    }
    this.requestUpdate();
  }

  private _valueFromClientX(clientX: number): number {
    if (!this._sliderEl) return LIGHT_MIN_BRIGHTNESS_PCT;
    const rect = this._sliderEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = rect.width > 0 ? (x / rect.width) * 100 : 0;
    return Math.min(100, Math.max(LIGHT_MIN_BRIGHTNESS_PCT, Math.round(pct)));
  }

  private _handlePointerDown = (e: PointerEvent): void => {
    if (!this._config || this._unavailable) return;
    e.preventDefault();
    this._sliderEl?.setPointerCapture(e.pointerId);
    this._dragging = true;
    const value = this._valueFromClientX(e.clientX);
    this._dragValue = value;
    this._throttledSetBrightness(value);
  };

  private _handlePointerMove = (e: PointerEvent): void => {
    if (!this._dragging) return;
    const value = this._valueFromClientX(e.clientX);
    if (value === this._dragValue) return;
    this._dragValue = value;
    this._throttledSetBrightness(value);
  };

  private _handlePointerUp = (e: PointerEvent): void => {
    if (!this._dragging) return;
    const value = this._dragValue ?? this._valueFromClientX(e.clientX);
    this._flushThrottleImmediately(value);
    this._scheduleDragEnd();
  };

  private _handleKeydown = (e: KeyboardEvent): void => {
    if (this._unavailable) return;
    const dirByKey: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    };
    const dir = dirByKey[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    const step = e.shiftKey ? 1 : 5;
    const current = this._dragging ? (this._dragValue ?? this._entityPct) : this._entityPct;
    const next = Math.min(100, Math.max(LIGHT_MIN_BRIGHTNESS_PCT, current + dir * step));
    this._dragging = true;
    this._dragValue = next;
    this._throttledSetBrightness(next);
    this._scheduleDragEnd();
  };

  private _throttledSetBrightness(pct: number): void {
    this._pendingPct = pct;
    const now = performance.now();
    const elapsed = now - this._lastCallTs;
    if (elapsed >= LIGHT_THROTTLE_MS) {
      this._flushThrottleImmediately(pct);
    } else if (this._throttleTimer === undefined) {
      this._throttleTimer = window.setTimeout(() => {
        this._throttleTimer = undefined;
        if (this._pendingPct !== undefined) this._flushThrottleImmediately(this._pendingPct);
      }, LIGHT_THROTTLE_MS - elapsed);
    }
  }

  private _flushThrottleImmediately(pct: number): void {
    if (this._throttleTimer !== undefined) {
      clearTimeout(this._throttleTimer);
      this._throttleTimer = undefined;
    }
    this._pendingPct = undefined;
    this._lastCallTs = performance.now();
    this._setBrightnessNow(pct);
  }

  private _setBrightnessNow(pct: number): void {
    if (!this.hass || !this._config) return;
    const data: Record<string, unknown> = {
      entity_id: this._config.entity,
      brightness_pct: pct,
    };
    if (this._config.transition !== undefined) data.transition = this._config.transition;
    this.hass.callService("light", "turn_on", data);
  }

  private _scheduleDragEnd(delay = LIGHT_DRAG_SETTLE_MS): void {
    if (this._dragEndTimer !== undefined) clearTimeout(this._dragEndTimer);
    this._dragEndTimer = window.setTimeout(() => {
      this._dragging = false;
      this._dragValue = undefined;
      this._dragEndTimer = undefined;
    }, delay);
  }

  private _handlePowerToggle(): void {
    if (!this.hass || !this._config || this._unavailable) return;
    const data: Record<string, unknown> = { entity_id: this._config.entity };
    if (this._config.transition !== undefined) data.transition = this._config.transition;
    this.hass.callService("light", "toggle", data);
  }

  private _fireMoreInfo(): void {
    fireEvent(this, "hass-more-info", { entityId: this._config?.entity });
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const entity = this.hass.states[this._config.entity];
    if (!entity) {
      return renderMissingEntity(this._config.entity);
    }

    const unavailable = entity.state === "unavailable";
    this._unavailable = unavailable;
    const isOn = entity.state === "on";
    const effectiveOn = isOn || this._dragging;

    const modes: string[] = entity.attributes.supported_color_modes ?? [];
    const hasBrightness =
      modes.some((m) => m !== "onoff") ||
      (modes.length === 0 && entity.attributes.brightness !== undefined);

    const brightness255 = entity.attributes.brightness as number | undefined;
    const brightnessPct =
      brightness255 !== undefined ? Math.round((brightness255 / 255) * 100) : 0;
    this._entityPct = brightnessPct;
    const displayPct = this._dragging ? (this._dragValue ?? brightnessPct) : brightnessPct;

    const name =
      this._config.name || entity.attributes.friendly_name || this._config.entity;
    const icon = this._config.icon || entity.attributes.icon || DEFAULT_LIGHT_ICON;

    const accentColor = this._config.accent_color
      ? resolveThemeColor(this._config.accent_color)
      : DEFAULT_LIGHT_ACCENT;
    const activeColor = unavailable || !effectiveOn ? LIGHT_OFF_COLOR : accentColor;
    const trackColorCss = this._config.track_color
      ? resolveThemeColor(this._config.track_color)
      : "rgba(255, 255, 255, 0.13)";
    const handleColorCss = this._config.handle_color
      ? resolveThemeColor(this._config.handle_color)
      : `color-mix(in srgb, ${activeColor} 60%, white 40%)`;
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(
      this._config,
    );

    const radius = resolveCornerRadius(
      this._config.radius ?? DEFAULT_LIGHT_RADIUS,
      this._config.corners,
    );

    const subtitle = unavailable
      ? this._t("unavailable")
      : !effectiveOn
        ? this._t("off")
        : `${displayPct} %`;

    const mode = this._config.animation ?? "auto";
    const wavyStatic = (this._config.wave_style ?? "wavy") === "wavy";
    const reducedMotion = isReducedMotion();
    const forceFlatShape = reducedMotion || (mode === "off" && !wavyStatic);
    this._phaseAnimating = !forceFlatShape && mode !== "off" && effectiveOn && !unavailable;
    this._targetAmplitude =
      unavailable || !effectiveOn || forceFlatShape ? 0 : LIGHT_WAVE_AMPLITUDE;

    if (this._phaseAnimating || this._targetAmplitude !== this._displayAmplitude) {
      this._startAnimationLoop();
    }

    const cssVars = buildCssVars({
      "m3p-icon-color": activeColor,
      "m3p-icon-bg": `color-mix(in srgb, ${activeColor} ${unavailable || !effectiveOn ? 14 : 20}%, transparent)`,
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
      "lc-accent": activeColor,
      "lc-track": trackColorCss,
      "lc-handle": handleColorCss,
      "lc-power-color": activeColor,
    });

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)} ${unavailable ? "unavailable" : ""} ${shouldAnimate(this._config.animation) ? "" : "no-animations"}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${renderCardHeader({
            icon,
            name,
            subtitle,
            onClick: () => this._fireMoreInfo(),
            right: html`
              <button
                class="power-btn ${effectiveOn ? "active" : ""}"
                ?disabled=${unavailable}
                aria-label="mdi:power"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this._handlePowerToggle();
                }}
              >
                <ha-icon icon="mdi:power"></ha-icon>
              </button>
            `,
          })}
          ${hasBrightness ? this._renderWaveSlider(displayPct, unavailable) : nothing}
        </div>
      </ha-card>
    `;
  }

  private _renderWaveSlider(pct: number, unavailable: boolean) {
    const width = this._measuredWidth;
    const height = LIGHT_WAVE_HEIGHT;
    const midY = height / 2;
    const amplitude = this._displayAmplitude;
    const handleW = LIGHT_HANDLE_WIDTH;

    const handleX = handleW / 2 + (pct / 100) * Math.max(0, width - handleW);
    const gapHalf = LIGHT_WAVE_GAP / 2;
    const activeEnd = Math.max(0, handleX - gapHalf - handleW / 2);
    const trackStart = Math.min(width, handleX + gapHalf + handleW / 2);
    const hasActive = activeEnd > 1;
    const hasTrack = trackStart < width - 1;
    const activePath = hasActive
      ? buildWavePath(0, activeEnd, amplitude, LIGHT_WAVE_WAVELENGTH, this._phase, midY)
      : "";

    return html`
      <div
        class="wave-slider ${unavailable ? "disabled" : ""} ${this._dragging ? "dragging" : ""}"
        role="slider"
        aria-label=${this._t("light_brightness_label")}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${pct}
        aria-disabled=${unavailable ? "true" : "false"}
        tabindex=${unavailable ? -1 : 0}
        @pointerdown=${this._handlePointerDown}
        @pointermove=${this._handlePointerMove}
        @pointerup=${this._handlePointerUp}
        @pointercancel=${this._handlePointerUp}
        @keydown=${this._handleKeydown}
      >
        <span class="wave-value">${pct} %</span>
        <svg
          class="wave-svg"
          viewBox="0 0 ${width} ${height}"
          width="100%"
          height=${height}
          preserveAspectRatio="none"
        >
          ${hasActive
            ? svg`<path class="wave-active" d=${activePath} fill="none"></path>`
            : nothing}
          ${hasTrack
            ? svg`<line class="wave-track" x1=${trackStart} y1=${midY} x2=${width} y2=${midY}></line>`
            : nothing}
        </svg>
        <div
          class="wave-handle"
          style=${`left: ${handleX - handleW / 2}px; top: ${midY - LIGHT_HANDLE_HEIGHT / 2}px;`}
        ></div>
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    cardHeaderStyles,
    css`
      .card-inner.unavailable {
        opacity: 0.4;
        pointer-events: none;
      }

      .power-btn {
        flex-shrink: 0;
        width: ${LIGHT_POWER_BTN_SIZE}px;
        height: ${LIGHT_POWER_BTN_SIZE}px;
        border: none;
        border-radius: ${LIGHT_POWER_BTN_RADIUS_OFF}px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--lc-power-color) 14%, transparent);
        color: var(--lc-power-color);
        cursor: pointer;
        padding: 0;
        transition:
          border-radius 350ms ${EASING},
          background 350ms ${EASING},
          color 350ms ${EASING};
      }

      .power-btn:disabled {
        cursor: default;
      }

      .power-btn.active {
        border-radius: ${LIGHT_POWER_BTN_RADIUS_ON}px;
        background: color-mix(in srgb, var(--lc-power-color) 20%, transparent);
      }

      .power-btn ha-icon {
        --mdc-icon-size: 20px;
      }

      .card-inner.no-animations .power-btn {
        transition: none;
      }

      .wave-slider {
        position: relative;
        width: 100%;
        height: ${LIGHT_WAVE_HEIGHT}px;
        cursor: pointer;
        touch-action: none;
        outline: none;
      }

      .wave-slider:focus-visible {
        outline: 2px solid var(--lc-accent);
        outline-offset: 2px;
        border-radius: 8px;
      }

      .wave-slider.disabled {
        cursor: default;
        pointer-events: none;
      }

      .wave-svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }

      .wave-active {
        stroke: var(--lc-accent);
        stroke-width: ${LIGHT_WAVE_STROKE}px;
        stroke-linecap: round;
      }

      .wave-track {
        stroke: var(--lc-track);
        stroke-width: ${LIGHT_WAVE_STROKE}px;
        stroke-linecap: round;
      }

      .wave-handle {
        position: absolute;
        width: ${LIGHT_HANDLE_WIDTH}px;
        height: ${LIGHT_HANDLE_HEIGHT}px;
        border-radius: ${LIGHT_HANDLE_RADIUS}px;
        background: var(--lc-handle);
        pointer-events: none;
        transition: left 150ms ${EASING};
      }

      .wave-slider.dragging .wave-handle {
        transition: none;
      }

      .card-inner.no-animations .wave-handle {
        transition: none;
      }

      .wave-value {
        position: absolute;
        top: 0;
        right: 0;
        font-size: 11px;
        font-weight: 700;
        opacity: 0.5;
        color: var(--m3p-text);
        pointer-events: none;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-light-card": M3LightCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-light-card",
  name: "M3 Light Card",
  description:
    "Eine Material-3-Expressive-Steuerkarte für Lichter mit wellenförmigem Helligkeits-Slider, Farbtemperatur und Farbsteuerung.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
