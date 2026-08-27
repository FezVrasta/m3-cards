import { LitElement, html, css, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3TimeCardConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_TIME_RADIUS,
  DEFAULT_TIME_ICON,
  DEFAULT_TIME_ACCENT,
  DEFAULT_TIME_MINUTE_STEP,
  TIME_HEADER_ICON_SIZE,
  TIME_HEADER_ICON_RADIUS,
  TIME_FIELD_WIDTH,
  TIME_FIELD_HEIGHT,
  TIME_FIELD_RADIUS,
  TIME_STEP_BUTTON_HEIGHT,
  TIME_STEP_RADIUS_OUTER,
  TIME_STEP_RADIUS_INNER,
  TIME_DIGIT_FONT_SIZE,
  TIME_SEPARATOR_FONT_SIZE,
  TIME_APPLY_HEIGHT,
  TIME_APPLY_RADIUS,
  TIME_APPLY_RADIUS_ACTIVE,
  TIME_APPLY_MORPH_MS,
  TIME_REPEAT_MS,
  TIME_REPEAT_FAST_MS,
  TIME_REPEAT_ACCELERATE_AFTER_MS,
  TIME_NARROW_BREAKPOINT,
  TIME_FIELD_WIDTH_NARROW,
  TIME_DIGIT_BUFFER_MS,
  TIME_INSTANT_DEBOUNCE_MS,
  resolveCornerRadius,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors, tintBackground } from "./shared/color-config";
import { glassCardStyles, glassCardClass, renderMissingEntity } from "./shared/glass-card";
import { activateOnKey } from "./shared/a11y";
import { STANDARD_EASING, shouldAnimate } from "./shared/animation";
import {
  readTime,
  hasTime,
  hasDate,
  uses12Hour,
  pad2,
  to12Hour,
  from12Hour,
  formatTime,
  stepTime,
  writeTime,
} from "./shared/ha-time";
import { localize, type TranslationKey } from "./localize";

console.info(
  `%c M3-TIME-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #85b7eb; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #85b7eb; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const EASING = unsafeCSS(STANDARD_EASING);

type Field = "hours" | "minutes";

@customElement("m3-time-card")
export class M3TimeCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3TimeCardConfig;
  /** The value being edited. Only written back on apply. */
  @state() private _draft?: { hours: number; minutes: number };
  @state() private _focus?: Field;
  @state() private _applyMorph = false;
  /** Set when the helper changed underneath an unapplied edit. */
  @state() private _external = false;
  @state() private _narrow = false;

  /** The entity value the draft was seeded from, to detect outside changes. */
  private _seed?: string;
  private _repeatTimer?: number;
  private _accelerateTimer?: number;
  private _morphTimer?: number;
  private _debounceTimer?: number;
  private _digitBuffer = "";
  private _digitTimer?: number;
  private _resizeObserver?: ResizeObserver;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-time-card-editor");
    return document.createElement("m3-time-card-editor") as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): M3TimeCardConfig {
    const entity =
      Object.keys(hass?.states ?? {}).find(
        (e) => e.startsWith("input_datetime.") && hass.states[e].attributes.has_time === true,
      ) ?? "";
    return { type: "custom:m3-time-card", entity };
  }

  public setConfig(config: M3TimeCardConfig): void {
    if (!config.entity) throw new Error("entity is required");
    this._config = {
      glass_background: true,
      animation: "auto",
      style: "stepper",
      apply_mode: "button",
      minute_step: DEFAULT_TIME_MINUTE_STEP,
      keep_seconds: true,
      ...config,
    };
    this._draft = undefined;
    this._seed = undefined;
    this._external = false;
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_rows: 2 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) this._narrow = width < TIME_NARROW_BREAKPOINT;
    });
    this._resizeObserver.observe(this);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this._stopRepeat();
    for (const t of [this._morphTimer, this._debounceTimer, this._digitTimer]) {
      if (t) clearTimeout(t);
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this._syncDraft();
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey, vars?: Record<string, string | number>): string {
    let out = localize(key, this._language);
    for (const [k, v] of Object.entries(vars ?? {})) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  }

  // ---- state ------------------------------------------------------------

  private get _state() {
    return this.hass?.states[this._config?.entity ?? ""];
  }

  private get _available(): boolean {
    const st = this._state;
    return !!st && st.state !== "unavailable" && st.state !== "unknown";
  }

  private get _entityTime() {
    return readTime(this._state);
  }

  private get _twelveHour(): boolean {
    return uses12Hour(this.hass);
  }

  private get _dirty(): boolean {
    const entity = this._entityTime;
    if (!entity || !this._draft) return false;
    return entity.hours !== this._draft.hours || entity.minutes !== this._draft.minutes;
  }

  // Seeds the draft from the entity, and afterwards only re-seeds when there
  // is nothing unapplied to lose. An outside change during an edit raises a
  // notice instead of yanking the value out from under the user.
  private _syncDraft(): void {
    const entity = this._entityTime;
    if (!entity) return;
    const key = `${entity.hours}:${entity.minutes}`;
    if (this._draft === undefined) {
      this._draft = { hours: entity.hours, minutes: entity.minutes };
      this._seed = key;
      return;
    }
    if (key === this._seed) return;
    if (this._dirty) {
      this._external = true;
      return;
    }
    this._draft = { hours: entity.hours, minutes: entity.minutes };
    this._seed = key;
    this._external = false;
  }

  private _reloadFromEntity = (): void => {
    const entity = this._entityTime;
    if (!entity) return;
    this._draft = { hours: entity.hours, minutes: entity.minutes };
    this._seed = `${entity.hours}:${entity.minutes}`;
    this._external = false;
  };

  // ---- editing ----------------------------------------------------------

  private _setDraft(next: { hours: number; minutes: number }): void {
    this._draft = next;
    if ((this._config?.apply_mode ?? "button") !== "instant") return;
    // Instant still waits for the interaction to settle: a held stepper would
    // otherwise fire a service call per tick.
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = window.setTimeout(() => this._apply(), TIME_INSTANT_DEBOUNCE_MS);
  }

  private _step(field: Field, direction: 1 | -1): void {
    if (!this._available || !this._draft) return;
    const amount = field === "minutes" ? (this._config?.minute_step ?? DEFAULT_TIME_MINUTE_STEP) : 1;
    this._setDraft(stepTime(this._draft, field, direction * amount));
  }

  private _startRepeat(field: Field, direction: 1 | -1): (e: Event) => void {
    return (e: Event) => {
      e.preventDefault();
      this._focus = field;
      this._step(field, direction);
      this._stopRepeat();
      this._repeatTimer = window.setInterval(() => this._step(field, direction), TIME_REPEAT_MS);
      this._accelerateTimer = window.setTimeout(() => {
        if (this._repeatTimer) clearInterval(this._repeatTimer);
        this._repeatTimer = window.setInterval(() => this._step(field, direction), TIME_REPEAT_FAST_MS);
      }, TIME_REPEAT_ACCELERATE_AFTER_MS);
    };
  }

  private _stopRepeat = (): void => {
    if (this._repeatTimer) {
      clearInterval(this._repeatTimer);
      this._repeatTimer = undefined;
    }
    if (this._accelerateTimer) {
      clearTimeout(this._accelerateTimer);
      this._accelerateTimer = undefined;
    }
  };

  private async _apply(): Promise<void> {
    const cfg = this._config;
    const entity = this._entityTime;
    if (!this.hass || !cfg || !entity || !this._draft) return;
    if (!this._dirty) return;
    const seconds = cfg.keep_seconds === false ? 0 : entity.seconds;
    try {
      await writeTime(this.hass, cfg.entity, {
        hours: this._draft.hours,
        minutes: this._draft.minutes,
        seconds,
        date: entity.date,
      });
    } catch (e) {
      console.warn("m3-time-card: could not write the time", e);
      return;
    }
    this._seed = `${this._draft.hours}:${this._draft.minutes}`;
    this._external = false;
    if (!shouldAnimate(cfg.animation)) return;
    this._applyMorph = true;
    if (this._morphTimer) clearTimeout(this._morphTimer);
    this._morphTimer = window.setTimeout(() => {
      this._applyMorph = false;
    }, TIME_APPLY_MORPH_MS);
  }

  private _revert = (): void => {
    this._reloadFromEntity();
  };

  // ---- keyboard ---------------------------------------------------------

  private _onFieldKey(field: Field): (e: KeyboardEvent) => void {
    return (e: KeyboardEvent) => {
      if (!this._available || !this._draft) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        this._step(field, e.key === "ArrowUp" ? 1 : -1);
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        this._typeDigit(field, e.key);
      }
    };
  }

  // Two digits make a value; one digit stands on its own once the buffer
  // times out, so "7" becomes 07 rather than waiting forever.
  private _typeDigit(field: Field, digit: string): void {
    if (!this._draft) return;
    const buffer = this._digitBuffer + digit;
    const max = field === "hours" ? (this._twelveHour ? 12 : 23) : 59;
    const min = field === "hours" && this._twelveHour ? 1 : 0;

    const twoDigit = Number(buffer.slice(-2));
    const single = Number(digit);
    const value = buffer.length >= 2 && twoDigit <= max && twoDigit >= min ? twoDigit : single;
    if (value > max || value < min) {
      this._digitBuffer = digit;
      return;
    }

    this._applyTyped(field, value);
    if (this._digitTimer) clearTimeout(this._digitTimer);

    if (buffer.length >= 2 || value * 10 > max) {
      // Nothing a second digit could still add — commit and move on.
      this._digitBuffer = "";
      if (field === "hours") this._focus = "minutes";
      return;
    }
    this._digitBuffer = buffer;
    this._digitTimer = window.setTimeout(() => {
      this._digitBuffer = "";
    }, TIME_DIGIT_BUFFER_MS);
  }

  private _applyTyped(field: Field, value: number): void {
    if (!this._draft) return;
    if (field === "minutes") {
      this._setDraft({ ...this._draft, minutes: value });
      return;
    }
    const hours = this._twelveHour
      ? from12Hour(value, to12Hour(this._draft.hours).pm)
      : value;
    this._setDraft({ ...this._draft, hours });
  }

  private _setHalf(pm: boolean): void {
    if (!this._draft) return;
    const { display } = to12Hour(this._draft.hours);
    this._setDraft({ ...this._draft, hours: from12Hour(display, pm) });
  }

  // ---- render -----------------------------------------------------------

  protected render() {
    const cfg = this._config;
    if (!cfg) return nothing;
    const st = this._state;
    if (this.hass && !st) return renderMissingEntity(cfg.entity);

    // A date-only helper has no time to edit; saying so beats rendering a
    // stepper that would write a value the helper cannot hold.
    if (st && !hasTime(st)) {
      return html`<ha-card><div class="card-inner glass">
        <div class="notice">${this._t("time_needs_time_helper")}</div>
      </div></ha-card>`;
    }

    const accent = resolveThemeColor(cfg.accent_color ?? DEFAULT_TIME_ACCENT);
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(cfg);
    const cssVars = buildCssVars({
      "m3ti-accent": accent,
      "m3ti-accent-tint": tintBackground(accent, cfg.accent_opacity, 18),
      "m3ti-text": textColorCss,
      "m3ti-secondary-text": secondaryTextColorCss,
      "m3ti-radius": resolveCornerRadius(cfg.radius ?? DEFAULT_TIME_RADIUS, cfg.corners),
      "m3ti-field-width": `${this._narrow ? TIME_FIELD_WIDTH_NARROW : TIME_FIELD_WIDTH}px`,
    });
    const style = cardBackgroundCss
      ? `${cssVars} --ha-card-background: ${cardBackgroundCss};`
      : cssVars;

    return html`
      <ha-card style=${style}>
        <div
          class="card-inner ${glassCardClass(cfg.glass_background)} ${shouldAnimate(cfg.animation) ? "" : "no-animations"} ${this._available ? "" : "dimmed"}"
        >
          ${this._renderHeader()}
          ${this._external ? this._renderExternalNotice() : nothing}
          ${this._renderStepper()}
          ${this._twelveHour ? this._renderHalfPills() : nothing}
          ${(cfg.apply_mode ?? "button") === "button" ? this._renderApplyRow() : nothing}
        </div>
      </ha-card>
    `;
  }

  private _renderHeader(): TemplateResult {
    const cfg = this._config!;
    const st = this._state;
    const name =
      cfg.name ?? (st?.attributes.friendly_name as string | undefined) ?? cfg.entity;
    const entity = this._entityTime;
    const subtitle = !this._available
      ? this._t("unavailable")
      : (cfg.subtitle ??
        this._t("time_current", {
          zeit: entity ? formatTime(entity.hours, entity.minutes, this._twelveHour) : "–",
        }));
    return html`
      <div class="header">
        <div class="header-icon">
          <ha-icon icon=${cfg.icon ?? DEFAULT_TIME_ICON}></ha-icon>
        </div>
        <div class="header-text">
          <div class="header-name">${name}</div>
          <div class="header-sub">${subtitle}</div>
        </div>
        ${cfg.show_date && entity?.date
          ? html`<div class="date-chip">${entity.date}</div>`
          : nothing}
      </div>
    `;
  }

  private _renderExternalNotice(): TemplateResult {
    return html`
      <div
        class="external"
        role="button"
        tabindex="0"
        @click=${this._reloadFromEntity}
        @keydown=${activateOnKey(this._reloadFromEntity)}
      >
        <ha-icon icon="mdi:refresh"></ha-icon>
        <span>${this._t("time_changed_externally")}</span>
      </div>
    `;
  }

  private _renderStepper(): TemplateResult {
    const draft = this._draft ?? { hours: 0, minutes: 0 };
    const hourValue = this._twelveHour ? to12Hour(draft.hours).display : draft.hours;
    return html`
      <div class="stepper">
        ${this._renderColumn("hours", hourValue, this._twelveHour ? 1 : 0, this._twelveHour ? 12 : 23)}
        <div class="separator">:</div>
        ${this._renderColumn("minutes", draft.minutes, 0, 59)}
      </div>
    `;
  }

  private _renderColumn(field: Field, value: number, min: number, max: number): TemplateResult {
    const active = this._focus === field;
    return html`
      <div class="column">
        <div
          class="step-btn up"
          role="button"
          tabindex="-1"
          aria-label=${this._t(field === "hours" ? "time_hour_up" : "time_minute_up")}
          @pointerdown=${this._startRepeat(field, 1)}
          @pointerup=${this._stopRepeat}
          @pointerleave=${this._stopRepeat}
          @pointercancel=${this._stopRepeat}
        >
          <ha-icon icon="mdi:menu-up"></ha-icon>
        </div>
        <div
          class="field ${active ? "active" : ""}"
          role="spinbutton"
          tabindex="0"
          aria-valuenow=${value}
          aria-valuemin=${min}
          aria-valuemax=${max}
          aria-label=${this._t(field === "hours" ? "time_hours" : "time_minutes")}
          @focus=${() => (this._focus = field)}
          @blur=${() => {
            if (this._focus === field) this._focus = undefined;
            this._digitBuffer = "";
          }}
          @keydown=${this._onFieldKey(field)}
        >
          ${pad2(value)}
        </div>
        <div
          class="step-btn down"
          role="button"
          tabindex="-1"
          aria-label=${this._t(field === "hours" ? "time_hour_down" : "time_minute_down")}
          @pointerdown=${this._startRepeat(field, -1)}
          @pointerup=${this._stopRepeat}
          @pointerleave=${this._stopRepeat}
          @pointercancel=${this._stopRepeat}
        >
          <ha-icon icon="mdi:menu-down"></ha-icon>
        </div>
      </div>
    `;
  }

  private _renderHalfPills(): TemplateResult {
    const pm = this._draft ? to12Hour(this._draft.hours).pm : false;
    return html`
      <div class="halves">
        ${[false, true].map(
          (isPm) => html`
            <div
              class="half ${pm === isPm ? "on" : ""}"
              role="button"
              tabindex="0"
              @click=${() => this._setHalf(isPm)}
              @keydown=${activateOnKey(() => this._setHalf(isPm))}
            >
              ${isPm ? "PM" : "AM"}
            </div>
          `,
        )}
      </div>
    `;
  }

  private _renderApplyRow(): TemplateResult {
    const dirty = this._dirty && this._available;
    const showRevert = (this._config?.show_revert ?? true) && dirty;
    return html`
      <div class="apply-row">
        <div
          class="apply ${dirty ? "dirty" : ""} ${this._applyMorph ? "morph" : ""}"
          role="button"
          tabindex=${dirty ? "0" : "-1"}
          aria-disabled=${dirty ? "false" : "true"}
          @click=${dirty ? () => this._apply() : nothing}
          @keydown=${dirty ? activateOnKey(() => this._apply()) : nothing}
        >
          ${this._t(dirty ? "time_apply" : "time_unchanged")}
        </div>
        ${showRevert
          ? html`<div
              class="revert"
              role="button"
              tabindex="0"
              aria-label=${this._t("time_revert")}
              title=${this._t("time_revert")}
              @click=${this._revert}
              @keydown=${activateOnKey(this._revert)}
            >
              <ha-icon icon="mdi:undo-variant"></ha-icon>
            </div>`
          : nothing}
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    css`
      ha-card {
        border-radius: var(--m3ti-radius);
      }

      .card-inner {
        border-radius: var(--m3ti-radius);
        gap: 12px;
      }

      .card-inner.dimmed {
        opacity: 0.4;
        pointer-events: none;
      }

      .notice {
        font-size: 13px;
        opacity: 0.7;
        color: var(--m3ti-secondary-text);
        padding: 6px 2px;
      }

      /* ---- header ---- */

      .header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .header-icon {
        flex-shrink: 0;
        width: ${TIME_HEADER_ICON_SIZE}px;
        height: ${TIME_HEADER_ICON_SIZE}px;
        border-radius: ${TIME_HEADER_ICON_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m3ti-accent);
        background: var(--m3ti-accent-tint);
      }

      .header-icon ha-icon {
        --mdc-icon-size: 22px;
      }

      .header-text {
        flex: 1;
        min-width: 0;
      }

      .header-name {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--m3ti-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .header-sub {
        font-size: 11px;
        opacity: 0.6;
        color: var(--m3ti-secondary-text);
      }

      .date-chip {
        flex-shrink: 0;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 9px;
        border-radius: 12px;
        color: var(--m3ti-accent);
        background: var(--m3ti-accent-tint);
      }

      .external {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 11px;
        font-weight: 600;
        padding: 7px 10px;
        border-radius: 13px;
        cursor: pointer;
        color: var(--warning-color, #f0a24a);
        background: color-mix(in srgb, var(--warning-color, #f0a24a) 15%, transparent);
      }

      .external ha-icon {
        --mdc-icon-size: 15px;
      }

      /* ---- stepper ---- */

      .stepper {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .column {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .step-btn {
        width: var(--m3ti-field-width);
        height: ${TIME_STEP_BUTTON_HEIGHT}px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        user-select: none;
        color: var(--m3ti-secondary-text);
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        transition: background 200ms ${EASING};
      }

      .step-btn.up {
        border-radius: ${TIME_STEP_RADIUS_OUTER}px ${TIME_STEP_RADIUS_OUTER}px
          ${TIME_STEP_RADIUS_INNER}px ${TIME_STEP_RADIUS_INNER}px;
      }

      .step-btn.down {
        border-radius: ${TIME_STEP_RADIUS_INNER}px ${TIME_STEP_RADIUS_INNER}px
          ${TIME_STEP_RADIUS_OUTER}px ${TIME_STEP_RADIUS_OUTER}px;
      }

      .step-btn:active {
        background: color-mix(in srgb, var(--primary-text-color) 14%, transparent);
      }

      .step-btn ha-icon {
        --mdc-icon-size: 20px;
      }

      .field {
        width: var(--m3ti-field-width);
        height: ${TIME_FIELD_HEIGHT}px;
        border-radius: ${TIME_FIELD_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        user-select: none;
        font-size: ${TIME_DIGIT_FONT_SIZE}px;
        font-weight: 700;
        /* Digits keep their column when the value changes, so the field does
           not twitch as you step through it. */
        font-variant-numeric: tabular-nums;
        color: var(--m3ti-text);
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        transition:
          background 200ms ${EASING},
          color 200ms ${EASING};
      }

      .field.active {
        color: var(--m3ti-accent);
        background: color-mix(in srgb, var(--m3ti-accent) 20%, transparent);
      }

      .field:focus-visible,
      .apply:focus-visible,
      .revert:focus-visible,
      .half:focus-visible,
      .external:focus-visible {
        outline: 2px solid var(--m3ti-accent);
        outline-offset: 2px;
      }

      .card-inner.no-animations .field,
      .card-inner.no-animations .step-btn,
      .card-inner.no-animations .apply,
      .card-inner.no-animations .half {
        transition: none;
      }

      .separator {
        font-size: ${TIME_SEPARATOR_FONT_SIZE}px;
        font-weight: 700;
        opacity: 0.35;
        color: var(--m3ti-text);
        /* Sits level with the value fields, not the stepper buttons. */
        align-self: center;
      }

      /* ---- AM/PM ---- */

      .halves {
        display: flex;
        justify-content: center;
        gap: 8px;
      }

      .half {
        width: 44px;
        height: 30px;
        border-radius: 15px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        user-select: none;
        font-size: 12px;
        font-weight: 700;
        color: var(--m3ti-secondary-text);
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        transition:
          border-radius 250ms ${EASING},
          background 250ms ${EASING},
          color 250ms ${EASING};
      }

      .half.on {
        border-radius: 9px;
        color: var(--m3ti-accent);
        background: color-mix(in srgb, var(--m3ti-accent) 20%, transparent);
      }

      /* ---- apply ---- */

      .apply-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .apply {
        flex: 1;
        min-width: 0;
        height: ${TIME_APPLY_HEIGHT}px;
        border-radius: ${TIME_APPLY_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 600;
        cursor: default;
        user-select: none;
        /* Resting state reads as a label, not a button: nothing to press yet. */
        color: color-mix(in srgb, var(--m3ti-text) 40%, transparent);
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        transition:
          border-radius ${TIME_APPLY_MORPH_MS}ms ${EASING},
          background 250ms ${EASING},
          color 250ms ${EASING};
      }

      .apply.dirty {
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
        color: #1c1c1c;
        background: var(--m3ti-accent);
      }

      .apply.morph {
        border-radius: ${TIME_APPLY_RADIUS_ACTIVE}px;
      }

      .revert {
        flex-shrink: 0;
        width: ${TIME_APPLY_HEIGHT}px;
        height: ${TIME_APPLY_HEIGHT}px;
        border-radius: ${TIME_APPLY_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--m3ti-secondary-text);
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
      }

      .revert ha-icon {
        --mdc-icon-size: 20px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-time-card": M3TimeCard;
  }
}

const windowWithCards = window as unknown as Window & {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-time-card",
  name: "M3 Time Card",
  description:
    "Zeitwähler für input_datetime-Helfer: Stepper-Felder statt des nativen Browser-Zeitfelds, mit Übernehmen-Button.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
