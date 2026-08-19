import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type {
  HomeAssistant,
  M3CounterCardConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  PowerThreshold,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_COUNTER_RADIUS,
  DEFAULT_COUNTER_ICON,
  DEFAULT_COUNTER_ACCENT,
  DEFAULT_COUNTER_DECIMALS,
  DEFAULT_COUNTER_MIN_DIGITS,
  COUNTER_CELL_WIDTH,
  COUNTER_CELL_HEIGHT,
  COUNTER_CELL_NARROW_WIDTH,
  COUNTER_CELL_NARROW_HEIGHT,
  COUNTER_CELL_GAP,
  COUNTER_CELL_RADIUS,
  COUNTER_DIGIT_FONT_SIZE,
  COUNTER_DIGIT_FONT_SIZE_NARROW,
  COUNTER_NARROW_BREAKPOINT,
  COUNTER_ROLL_DURATION_MS,
  COUNTER_ROLL_STAGGER_MS,
  COUNTER_POWER_CHIP_COLOR,
  resolveCornerRadius,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors, tintBackground } from "./shared/color-config";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import { activateOnKey } from "./shared/a11y";
import { renderCardHeader, cardHeaderStyles } from "./shared/card-header";
import { shouldAnimate } from "./shared/animation";
import { fireEvent } from "./shared/editor-helpers";
import { localize, type TranslationKey } from "./localize";

console.info(
  `%c M3-COUNTER-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #85b7eb; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #85b7eb; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

interface DigitCell {
  key: string;
  char: string;
  kind: "sign" | "int" | "sep" | "frac";
}

@customElement("m3-counter-card")
export class M3CounterCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3CounterCardConfig;
  @state() private _narrow = false;

  private _minIntegerDigits = DEFAULT_COUNTER_MIN_DIGITS;
  private _prevDigitByKey = new Map<string, string>();
  private _animatingKeys = new Set<string>();
  private _animationTimers = new Map<string, number>();
  private _resizeObserver?: ResizeObserver;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-counter-card-editor");
    return document.createElement(
      "m3-counter-card-editor",
    ) as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): M3CounterCardConfig {
    const entities = Object.keys(hass?.states ?? {}).filter((eid) =>
      eid.startsWith("sensor."),
    );
    const entity =
      entities.find((eid) => /zahler|zaehler|counter|total/.test(eid)) ??
      entities[0] ??
      "";
    return {
      type: "custom:m3-counter-card",
      entity,
      glass_background: true,
    };
  }

  public setConfig(config: M3CounterCardConfig): void {
    if (!config.entity) {
      throw new Error("m3-counter-card: 'entity' is required");
    }
    this._config = {
      glass_background: true,
      animation: "auto",
      decimals: DEFAULT_COUNTER_DECIMALS,
      digits: "auto",
      ...config,
    };
    if (typeof this._config.digits === "number") {
      this._minIntegerDigits = Math.max(1, this._config.digits);
    } else {
      this._minIntegerDigits = DEFAULT_COUNTER_MIN_DIGITS;
    }
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

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _decimalSeparator(): string {
    const parts = new Intl.NumberFormat(this._language).formatToParts(1.1);
    return parts.find((p) => p.type === "decimal")?.value ?? ".";
  }

  private _formatNumber(value: number, maxFractionDigits = 2): string {
    return new Intl.NumberFormat(this._language, {
      maximumFractionDigits: maxFractionDigits,
    }).format(value);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    for (const timer of this._animationTimers.values()) {
      window.clearTimeout(timer);
    }
    this._animationTimers.clear();
  }

  protected firstUpdated(changed: PropertyValues): void {
    super.firstUpdated(changed);
    this._resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      const narrow = width > 0 && width < COUNTER_NARROW_BREAKPOINT;
      if (narrow !== this._narrow) this._narrow = narrow;
    });
    this._resizeObserver.observe(this);
  }

  private _powerChipColor(power: number): string {
    const base = this._config?.power_chip_color
      ? resolveThemeColor(this._config.power_chip_color)
      : COUNTER_POWER_CHIP_COLOR;
    const thresholds: PowerThreshold[] = this._config?.power_thresholds ?? [];
    const sorted = [...thresholds].sort((a, b) => a.above - b.above);
    let color = base;
    for (const t of sorted) {
      if (power > t.above) color = resolveThemeColor(t.color);
    }
    return color;
  }

  private _buildCells(
    integerDigits: number,
    decimals: number,
    intStr: string,
    fracStr: string,
    negative: boolean,
  ): DigitCell[] {
    const cells: DigitCell[] = [];
    if (negative) {
      cells.push({ key: "sign", char: "−", kind: "sign" });
    }
    for (let i = 0; i < integerDigits; i++) {
      const posFromRight = integerDigits - 1 - i;
      cells.push({
        key: `int-${posFromRight}`,
        char: intStr[i] ?? "0",
        kind: "int",
      });
    }
    if (decimals > 0) {
      cells.push({ key: "sep", char: this._decimalSeparator(), kind: "sep" });
      for (let i = 0; i < decimals; i++) {
        cells.push({ key: `frac-${i}`, char: fracStr[i] ?? "0", kind: "frac" });
      }
    }
    return cells;
  }

  private _scheduleAnimationEnd(key: string, newChar: string): void {
    const existing = this._animationTimers.get(key);
    if (existing !== undefined) window.clearTimeout(existing);
    const totalMs = COUNTER_ROLL_DURATION_MS + COUNTER_ROLL_STAGGER_MS;
    const timer = window.setTimeout(() => {
      this._animatingKeys.delete(key);
      this._animationTimers.delete(key);
      this._prevDigitByKey.set(key, newChar);
      this.requestUpdate();
    }, totalMs);
    this._animationTimers.set(key, timer);
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const entityState = this.hass.states[this._config.entity];
    const name = this._config.name || entityState?.attributes.friendly_name || "";
    const icon = this._config.icon || DEFAULT_COUNTER_ICON;
    const subtitle = this._config.subtitle || this._t("counter_subtitle_default");
    const accentColor = this._config.accent_color
      ? resolveThemeColor(this._config.accent_color)
      : DEFAULT_COUNTER_ACCENT;
    const cellBackgroundCss = this._config.cell_background
      ? resolveThemeColor(this._config.cell_background)
      : "color-mix(in srgb, var(--primary-text-color) 8%, transparent)";
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(
      this._config,
    );

    const radius = resolveCornerRadius(
      this._config.radius ?? DEFAULT_COUNTER_RADIUS,
      this._config.corners,
    );

    const decimals = this._config.decimals ?? DEFAULT_COUNTER_DECIMALS;
    const unit = entityState?.attributes.unit_of_measurement ?? "";
    const rawValue = entityState ? parseFloat(entityState.state) : NaN;
    const unavailable = !entityState || Number.isNaN(rawValue);

    const animate = shouldAnimate(this._config.animation);

    let cells: DigitCell[];
    if (unavailable) {
      const intCount = this._minIntegerDigits;
      cells = this._buildCells(
        intCount,
        decimals,
        "".padStart(intCount, "–"),
        "".padStart(decimals, "–"),
        false,
      );
    } else {
      const negative = rawValue < 0;
      const absValue = Math.abs(rawValue);
      const fixed = absValue.toFixed(decimals);
      const [intPart, fracPart] = fixed.split(".");
      const neededDigits = Math.max(1, intPart.length);
      if (neededDigits > this._minIntegerDigits) {
        this._minIntegerDigits = neededDigits;
      }
      const intStr = intPart.padStart(this._minIntegerDigits, "0");
      cells = this._buildCells(
        this._minIntegerDigits,
        decimals,
        intStr,
        fracPart ?? "",
        negative,
      );
    }

    for (const cell of cells) {
      if (cell.kind !== "int" && cell.kind !== "frac") continue;
      const prev = this._prevDigitByKey.get(cell.key);
      if (
        animate &&
        !unavailable &&
        prev !== undefined &&
        prev !== cell.char &&
        !this._animatingKeys.has(cell.key)
      ) {
        this._animatingKeys.add(cell.key);
        this._scheduleAnimationEnd(cell.key, cell.char);
      } else if (!this._animatingKeys.has(cell.key)) {
        this._prevDigitByKey.set(cell.key, cell.char);
      }
    }

    const powerEntity = this._config.power_entity
      ? this.hass.states[this._config.power_entity]
      : undefined;
    const powerValue = powerEntity ? parseFloat(powerEntity.state) : NaN;
    const showPowerChip =
      !!this._config.power_entity && !unavailable && !Number.isNaN(powerValue);

    const dailyEntity = this._config.daily_entity
      ? this.hass.states[this._config.daily_entity]
      : undefined;
    const dailyValue = dailyEntity ? parseFloat(dailyEntity.state) : NaN;
    const showTicker =
      !!this._config.show_ticker &&
      !!this._config.daily_entity &&
      dailyEntity &&
      !Number.isNaN(dailyValue);

    const cssVars = buildCssVars({
      "m3p-icon-color": accentColor,
      "m3p-icon-bg": tintBackground(accentColor, this._config.accent_opacity, 18),
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
      "counter-accent": accentColor,
      "counter-frac-bg": tintBackground(accentColor, this._config.accent_opacity, 18),
      "counter-cell-bg": cellBackgroundCss,
      "counter-cell-w": `${this._narrow ? COUNTER_CELL_NARROW_WIDTH : COUNTER_CELL_WIDTH}px`,
      "counter-cell-h": `${this._narrow ? COUNTER_CELL_NARROW_HEIGHT : COUNTER_CELL_HEIGHT}px`,
      "counter-digit-size": `${this._narrow ? COUNTER_DIGIT_FONT_SIZE_NARROW : COUNTER_DIGIT_FONT_SIZE}px`,
    });

    const moreInfo = () =>
      fireEvent(this, "hass-more-info", { entityId: this._config!.entity });

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${renderCardHeader({
            icon,
            name,
            subtitle,
            onClick: moreInfo,
            right:
              showPowerChip
                ? html`
                    <div
                      class="power-chip"
                      style=${`color: ${this._powerChipColor(powerValue)}; background: ${tintBackground(this._powerChipColor(powerValue), this._config.power_chip_opacity, 18)};`}
                    >
                      <ha-icon icon="mdi:lightning-bolt"></ha-icon>
                      <span>${this._formatNumber(powerValue, 0)} W</span>
                    </div>
                  `
                : undefined,
          })}

          <div
            class="digit-row ${unavailable ? "unavailable" : ""}"
            role="button"
            tabindex="0"
            aria-label=${name}
            @click=${moreInfo}
            @keydown=${activateOnKey(moreInfo)}
          >
            ${repeat(
              cells,
              (c) => c.key,
              (c) => this._renderCell(c),
            )}
            ${unit
              ? html`<span class="counter-unit">${unit}</span>`
              : nothing}
          </div>

          ${showTicker
            ? html`
                <div class="ticker">
                  +${this._formatNumber(dailyValue)} ${dailyEntity!.attributes.unit_of_measurement ?? unit}
                  ${this._t("counter_ticker_today")}
                </div>
              `
            : nothing}
        </div>
      </ha-card>
    `;
  }

  private _renderCell(cell: DigitCell) {
    if (cell.kind === "sep") {
      return html`<span class="cell sep">${cell.char}</span>`;
    }
    if (cell.kind === "sign") {
      return html`<div class="cell sign">${cell.char}</div>`;
    }
    const animating = this._animatingKeys.has(cell.key);
    const prevChar = this._prevDigitByKey.get(cell.key) ?? cell.char;
    return html`
      <div class="cell ${cell.kind}">
        ${animating
          ? html`
              <span class="digit-old">${prevChar}</span>
              <span class="digit-new">${cell.char}</span>
            `
          : html`<span class="digit-static">${cell.char}</span>`}
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    cardHeaderStyles,
    css`
      .power-chip {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 4px;
        height: 28px;
        padding: 0 10px;
        border-radius: 14px;
        font-size: 13px;
        font-weight: 700;
      }

      .power-chip ha-icon {
        --mdc-icon-size: 14px;
      }

      .digit-row {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: ${COUNTER_CELL_GAP}px;
        cursor: pointer;
      }

      .digit-row.unavailable {
        opacity: 0.4;
      }

      .digit-row:focus-visible {
        outline: 2px solid var(--counter-accent, var(--primary-color));
        outline-offset: 2px;
        border-radius: 8px;
      }

      .cell {
        flex-shrink: 0;
        width: var(--counter-cell-w);
        height: var(--counter-cell-h);
        border-radius: ${COUNTER_CELL_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        font-size: var(--counter-digit-size);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .cell.int {
        background: var(--counter-cell-bg);
        color: var(--m3p-text);
      }

      .cell.frac {
        background: var(--counter-frac-bg);
        color: var(--counter-accent);
      }

      .cell.sign {
        width: 12px;
        background: transparent;
        color: var(--m3p-text);
        font-size: calc(var(--counter-digit-size) * 0.8);
      }

      .cell.sep {
        width: 10px;
        flex-shrink: 0;
        text-align: center;
        font-size: 22px;
        opacity: 0.5;
        align-self: flex-end;
        padding-bottom: 8px;
        color: var(--m3p-text);
      }

      .digit-static {
        display: block;
      }

      .digit-old,
      .digit-new {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .digit-old {
        animation: roll-out-up ${COUNTER_ROLL_DURATION_MS}ms cubic-bezier(0.2, 0, 0, 1) forwards;
      }

      .digit-new {
        transform: translateY(100%);
        opacity: 0;
        animation: roll-in-up ${COUNTER_ROLL_DURATION_MS}ms cubic-bezier(0.2, 0, 0, 1)
          ${COUNTER_ROLL_STAGGER_MS}ms forwards;
      }

      @keyframes roll-out-up {
        to {
          transform: translateY(-100%);
          opacity: 0;
        }
      }

      @keyframes roll-in-up {
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      .counter-unit {
        margin-left: 8px;
        align-self: center;
        font-size: 14px;
        font-weight: 500;
        opacity: 0.55;
        color: var(--m3p-text);
      }

      .ticker {
        text-align: center;
        font-size: 12px;
        opacity: 0.6;
        color: var(--m3p-secondary-text);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-counter-card": M3CounterCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-counter-card",
  name: "M3 Counter Card",
  description:
    "Ein Material-3-Zählerstand mit rollender Ziffernanzeige (z.B. für Stromzähler).",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
