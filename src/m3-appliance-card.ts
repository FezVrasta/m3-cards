import { LitElement, html, css, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  ApplianceBlock,
  ApplianceButtonConfig,
  ApplianceChipConfig,
  ApplianceSelectConfig,
  ApplianceSliderConfig,
  HaActionConfig,
  HassEntity,
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  M3ApplianceCardConfig,
  StatusRule,
} from "./types";
import {
  APPLIANCE_BAR_HEIGHT,
  APPLIANCE_BAR_RADIUS,
  APPLIANCE_BUTTON_HEIGHT,
  APPLIANCE_BUTTON_RADIUS,
  APPLIANCE_BUTTON_RADIUS_ACTIVE,
  APPLIANCE_BUTTON_TINT,
  APPLIANCE_CAPTION_SIZE,
  APPLIANCE_CHIP_GAP,
  APPLIANCE_CHIP_HEIGHT,
  APPLIANCE_CHIP_RADIUS,
  APPLIANCE_CHIP_RADIUS_ACTIVE,
  APPLIANCE_CHIP_TINT,
  APPLIANCE_DRAG_SETTLE_MS,
  APPLIANCE_HANDLE_HEIGHT,
  APPLIANCE_HANDLE_RADIUS,
  APPLIANCE_HANDLE_WIDTH,
  APPLIANCE_ICON_TINT,
  APPLIANCE_INDETERMINATE_FRACTION,
  APPLIANCE_INDETERMINATE_MS,
  APPLIANCE_LABEL_SIZE,
  APPLIANCE_NARROW_PX,
  APPLIANCE_OPTION_DROPDOWN_FROM,
  APPLIANCE_OPTION_HEIGHT,
  APPLIANCE_OPTION_RADIUS,
  APPLIANCE_OPTION_RADIUS_ACTIVE,
  APPLIANCE_OPTION_TINT,
  APPLIANCE_PALETTE,
  APPLIANCE_SLIDER_HEIGHT,
  APPLIANCE_SLIDER_THROTTLE_MS,
  APPLIANCE_SLIDER_TRACK,
  APPLIANCE_VALUE_SIZE,
  CARD_VERSION,
  DEFAULT_APPLIANCE_ACCENT,
  DEFAULT_APPLIANCE_ICON,
  DEFAULT_APPLIANCE_RADIUS,
  resolveCornerRadius,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { activateOnKey } from "./shared/a11y";
import { shouldAnimate, STANDARD_EASING } from "./shared/animation";
import { handleAction, isActionable } from "./shared/actions";
import {
  prettifyOption,
  remainingMinutes,
  resolveSliderRange,
  snapToRange,
  splitDuration,
  visibleOptions,
} from "./shared/appliance";
import {
  buildCssVars,
  foregroundOn,
  inkOn,
  resolveCommonColors,
  resolveThemeColor,
  tintOn,
} from "./shared/color-config";
import { DragThrottle } from "./shared/drag-throttle";
import {
  defaultEntityAction,
  isMissingState,
  isOnState,
  selectOptionDomain,
  setValueDomain,
} from "./shared/entity-actions";
import { formatNumber } from "./shared/formatting";
import { glassCardClass, glassCardStyles, renderMissingEntity } from "./shared/glass-card";
import { cardHeaderStyles, renderCardHeader } from "./shared/card-header";
import { hassChangeMatters } from "./shared/should-update";
import { findStateRule, numericState } from "./shared/state-rules";
import { TemplatedCard } from "./shared/templated-card";
import { VisibleTicker } from "./shared/visible-ticker";

console.info(
  `%c M3-APPLIANCE-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #85b7eb; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #85b7eb; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const EASING = unsafeCSS(STANDARD_EASING);

// Everything, in the order a person reads an appliance: what it is doing, how
// far along, what it is set to, what it offers, and the details at the bottom.
const DEFAULT_LAYOUT: ApplianceBlock[] = ["progress", "sliders", "selects", "buttons", "chips"];

/** Domains whose "on" is worth showing as a filled button. */
const TOGGLE_DOMAINS = new Set(["switch", "input_boolean", "light", "fan", "siren", "lock"]);

interface ProgressReading {
  percent?: number;
  remaining?: number;
  indeterminate: boolean;
}

@customElement("m3-appliance-card")
export class M3ApplianceCard extends TemplatedCard(LitElement) implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ApplianceCardConfig;
  @state() private _narrow = false;
  /** Only advances when doing so would change a shown minute — see `_onTick`. */
  @state() private _now = Date.now();
  /** The entity being dragged and the value the finger is on, before HA echoes it. */
  @state() private _drag?: { entity: string; value: number };

  private _resizeObserver?: ResizeObserver;
  private _dragEndTimer?: number;
  private readonly _throttles = new Map<string, DragThrottle<number>>();
  private readonly _ticker = new VisibleTicker(this, (now) => this._onTick(now));

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-appliance-card-editor");
    return document.createElement("m3-appliance-card-editor") as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): M3ApplianceCardConfig {
    const sensors = Object.keys(hass?.states ?? {}).filter((eid) => eid.startsWith("sensor."));
    const guess =
      sensors.find((eid) => /washer|washing|dryer|dishwasher|oven|waschmaschine|trockner/.test(eid)) ??
      sensors[0] ??
      "";
    return {
      type: "custom:m3-appliance-card",
      entity: guess,
      glass_background: true,
    };
  }

  public setConfig(config: M3ApplianceCardConfig): void {
    if (!config?.entity) throw new Error("m3-appliance-card: 'entity' is required");
    for (const key of ["sliders", "selects", "buttons", "chips"] as const) {
      const value = config[key];
      if (value !== undefined && !Array.isArray(value)) {
        throw new Error(`m3-appliance-card: '${key}' must be a list`);
      }
    }
    this._config = { glass_background: true, animation: "auto", ...config };
  }

  public getCardSize(): number {
    const cfg = this._config;
    if (!cfg) return 3;
    return (
      2 +
      (cfg.progress ? 1 : 0) +
      (cfg.sliders?.length ?? 0) +
      (cfg.selects?.length ?? 0) +
      (cfg.buttons?.length ? 1 : 0) +
      (cfg.chips?.length ? 1 : 0)
    );
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_rows: 2 };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return hassChangeMatters(changed, this.hass, this._watchedEntities());
  }

  /** Every entity the card reads, collected in one place for `shouldUpdate`. */
  private _watchedEntities(): string[] {
    const c = this._config;
    if (!c) return [];
    return [
      c.entity,
      c.progress?.percentage_entity,
      c.progress?.remaining_entity,
      ...(c.sliders ?? []).map((x) => x.entity),
      ...(c.selects ?? []).map((x) => x.entity),
      ...(c.buttons ?? []).map((x) => x.entity),
      ...(c.chips ?? []).map((x) => x.entity),
    ].filter((e): e is string => !!e);
  }

  // ---- lifecycle ------------------------------------------------------------

  public connectedCallback(): void {
    super.connectedCallback();
    this._resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      const narrow = width > 0 && width < APPLIANCE_NARROW_PX;
      if (narrow !== this._narrow) this._narrow = narrow;
    });
    this._resizeObserver.observe(this);
    this._ticker.connect();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this._ticker.disconnect();
    for (const throttle of this._throttles.values()) throttle.clear();
    window.clearTimeout(this._dragEndTimer);
  }

  /**
   * A remaining time given as a *completion timestamp* counts down on its own:
   * nothing in `hass` changes between now and the end of the programme, so
   * without a clock of its own the card would sit on "1 h 24 min" for the whole
   * 84 minutes. A remaining time given as a number needs no clock, because the
   * integration pushes a new state — hence the comparison rather than an
   * unconditional assignment: on those the minute tick renders nothing at all.
   */
  private _onTick(now: number): void {
    const before = this._remainingAt(this._now);
    const after = this._remainingAt(now);
    if (before === undefined && after === undefined) return;
    if (before !== undefined && after !== undefined && Math.round(before) === Math.round(after)) {
      return;
    }
    this._now = now;
  }

  // ---- reading --------------------------------------------------------------

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _state(entityId?: string): HassEntity | undefined {
    return entityId ? this.hass?.states[entityId] : undefined;
  }

  private get _main(): HassEntity | undefined {
    return this._state(this._config?.entity);
  }

  /** The value the status rules run against: the state, or a named attribute. */
  private get _raw(): string {
    const cfg = this._config;
    const st = this._main;
    const value = cfg?.attribute ? st?.attributes?.[cfg.attribute] : st?.state;
    return value === undefined || value === null ? "" : String(value);
  }

  private get _rule(): StatusRule | undefined {
    return findStateRule(this._config?.states, this._raw, numericState(this._raw));
  }

  private get _unavailable(): boolean {
    return isMissingState(this._raw);
  }

  private get _accent(): string {
    return resolveThemeColor(
      this._rule?.color ?? this._config?.accent_color ?? DEFAULT_APPLIANCE_ACCENT,
    );
  }

  private get _layout(): ApplianceBlock[] {
    return this._config?.layout?.length ? this._config.layout : DEFAULT_LAYOUT;
  }

  /** A state nobody wrote a rule for, tidied up rather than shown as `heavy_duty`. */
  private _stateText(st: HassEntity | undefined, raw: string): string {
    const numeric = numericState(raw);
    if (numeric === undefined) return prettifyOption(raw);
    const unit = st?.attributes?.unit_of_measurement as string | undefined;
    const decimals = Math.min(2, (raw.split(/[.,]/)[1] ?? "").length);
    const value = formatNumber(this._language, numeric, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return unit ? `${value} ${unit}` : value;
  }

  private _duration(totalMinutes: number): string {
    const { hours, minutes } = splitDuration(totalMinutes);
    return hours > 0
      ? this._t("appliance_duration_hm").replace("{h}", String(hours)).replace("{m}", String(minutes))
      : this._t("appliance_duration_m").replace("{m}", String(minutes));
  }

  // ---- progress -------------------------------------------------------------

  private _remainingAt(now: number): number | undefined {
    const st = this._state(this._config?.progress?.remaining_entity);
    if (!st || isMissingState(st.state)) return undefined;
    return remainingMinutes(st.state, st.attributes, now);
  }

  private _progress(): ProgressReading | undefined {
    const cfg = this._config?.progress;
    if (!cfg) return undefined;

    const pctState = this._state(cfg.percentage_entity);
    const pctRaw = pctState?.state ?? "";
    const pctValue = isMissingState(pctRaw) ? undefined : numericState(pctRaw);
    const percent = pctValue === undefined ? undefined : Math.min(100, Math.max(0, pctValue));

    const remaining = this._remainingAt(this._now);

    if (percent === undefined && remaining === undefined) return undefined;
    return { percent, remaining, indeterminate: percent === undefined };
  }

  // ---- service calls --------------------------------------------------------

  private _call(domain: string, service: string, data: Record<string, unknown>, entityId: string): void {
    this.hass?.callService(domain, service, { ...data, entity_id: entityId });
  }

  private _run(action: HaActionConfig | undefined, entityId?: string): void {
    // Every action in this card goes through the shared handler, so a
    // `confirmation:` on any of them is asked for in exactly one place — and
    // `navigate`, `url` and `perform-action` behave as they do on every other
    // card in the suite.
    handleAction(this, this.hass, action, entityId);
  }

  /**
   * One throttle per slider entity, kept across renders so a drag is not
   * restarted by the re-render its own first service call causes. The value
   * handed in is already snapped to the entity's grid, so nothing about the
   * range is captured here — the throttle outlives config edits.
   */
  private _throttleFor(entityId: string): DragThrottle<number> {
    let throttle = this._throttles.get(entityId);
    if (!throttle) {
      throttle = new DragThrottle<number>((value) => {
        this._call(setValueDomain(entityId.split(".")[0]), "set_value", { value }, entityId);
      }, APPLIANCE_SLIDER_THROTTLE_MS);
      this._throttles.set(entityId, throttle);
    }
    return throttle;
  }

  private _scheduleDragEnd(): void {
    window.clearTimeout(this._dragEndTimer);
    this._dragEndTimer = window.setTimeout(() => {
      this._drag = undefined;
      this._dragEndTimer = undefined;
    }, APPLIANCE_DRAG_SETTLE_MS);
  }

  // ---- render ---------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg || !this.hass) return nothing;
    if (!this.hass.states[cfg.entity]) return renderMissingEntity(cfg.entity);

    const unavailable = this._unavailable;
    const accent = this._accent;
    const rule = this._rule;
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(cfg);
    const radius = resolveCornerRadius(cfg.radius ?? DEFAULT_APPLIANCE_RADIUS, cfg.corners);

    const iconBg = tintOn(this, accent, cfg.accent_opacity, APPLIANCE_ICON_TINT);
    const cssVars = buildCssVars({
      "m3a-accent": accent,
      "m3a-ink": inkOn(accent, this),
      // The shared header reads the m3p-* names, so they are set rather than
      // re-styled — one fewer place for this card to drift from its siblings.
      "m3p-icon-bg": iconBg,
      "m3p-icon-color": foregroundOn(accent, iconBg, 3, this),
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
    });

    const subtitle = unavailable
      ? this._t("appliance_unavailable")
      : (rule?.label ?? this._stateText(this._main, this._raw));

    const progress = this._progress();
    const remaining = progress?.remaining;

    const headerAction = cfg.tap_action ?? { action: "more-info" as const };
    const headerInteractive = isActionable(headerAction);

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(cfg.glass_background)} ${
            unavailable ? "off" : ""
          } ${this._narrow ? "narrow" : ""} ${shouldAnimate(cfg.animation) ? "" : "no-animations"}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${renderCardHeader({
            icon: rule?.icon ?? cfg.icon ?? DEFAULT_APPLIANCE_ICON,
            name:
              cfg.name ??
              (this._main?.attributes?.friendly_name as string | undefined) ??
              this._t("appliance_default_name"),
            subtitle,
            onClick: headerInteractive
              ? (e: Event) => {
                  e.stopPropagation();
                  this._run(headerAction, cfg.entity);
                }
              : undefined,
            right:
              remaining === undefined
                ? undefined
                : html`
                    <div class="reading">
                      <div class="reading-value">${this._duration(remaining)}</div>
                      <div class="reading-caption">${this._t("appliance_remaining")}</div>
                    </div>
                  `,
          })}
          ${this._layout.map((block) => this._renderBlock(block, progress))}
        </div>
      </ha-card>
    `;
  }

  private _renderBlock(
    block: ApplianceBlock,
    progress: ProgressReading | undefined,
  ): TemplateResult | typeof nothing {
    switch (block) {
      case "progress":
        return this._renderProgress(progress);
      case "sliders":
        return html`${(this._config?.sliders ?? []).map((s) => this._renderSlider(s))}`;
      case "selects":
        return html`${(this._config?.selects ?? []).map((s, i) => this._renderSelect(s, i))}`;
      case "buttons":
        return this._renderButtons();
      case "chips":
        return this._renderChips();
      default:
        return nothing;
    }
  }

  // ---- progress block -------------------------------------------------------

  private _renderProgress(progress: ProgressReading | undefined): TemplateResult | typeof nothing {
    if (!progress) return nothing;
    const cfg = this._config?.progress;
    const color = cfg?.color ? resolveThemeColor(cfg.color) : undefined;
    const animate = shouldAnimate(this._config?.animation);

    return html`
      <div class="block" style=${color ? buildCssVars({ "m3a-accent": color }) : nothing}>
        <div class="block-head">
          <span class="block-label">${cfg?.label ?? this._t("appliance_progress")}</span>
          ${progress.percent === undefined
            ? nothing
            : html`<span class="block-value"
                >${formatNumber(this._language, progress.percent, { maximumFractionDigits: 0 })} %</span
              >`}
        </div>
        <div
          class="bar"
          role="progressbar"
          aria-label=${cfg?.label ?? this._t("appliance_progress")}
          aria-valuemin=${progress.indeterminate ? nothing : 0}
          aria-valuemax=${progress.indeterminate ? nothing : 100}
          aria-valuenow=${progress.indeterminate ? nothing : Math.round(progress.percent ?? 0)}
        >
          <div
            class="bar-fill ${progress.indeterminate ? "indeterminate" : ""} ${
              animate ? "" : "still"
            }"
            style=${progress.indeterminate ? nothing : `width: ${progress.percent ?? 0}%;`}
          ></div>
        </div>
      </div>
    `;
  }

  // ---- slider block ---------------------------------------------------------

  private _renderSlider(cfg: ApplianceSliderConfig): TemplateResult | typeof nothing {
    const st = this._state(cfg.entity);
    // A slider with no entity behind it has no range and no value; drawing a
    // dead track would only invite a drag that goes nowhere.
    if (!st || isMissingState(st.state)) return nothing;

    const range = resolveSliderRange(st.attributes, {
      min: cfg.min,
      max: cfg.max,
      step: cfg.step,
    });
    const live = numericState(st.state) ?? range.min;
    const value =
      this._drag?.entity === cfg.entity ? this._drag.value : snapToRange(live, range);
    const pct = ((value - range.min) / (range.max - range.min)) * 100;
    const unit = cfg.unit ?? (st.attributes?.unit_of_measurement as string | undefined) ?? "";
    const label =
      cfg.label ?? (st.attributes?.friendly_name as string | undefined) ?? cfg.entity;
    const decimals = range.step < 1 ? 1 : 0;

    const valueFromX = (clientX: number, el: HTMLElement): number => {
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const raw = rect.width > 0 ? range.min + (x / rect.width) * (range.max - range.min) : range.min;
      return snapToRange(raw, range);
    };
    const commit = (next: number): void => {
      this._drag = { entity: cfg.entity, value: next };
      this._throttleFor(cfg.entity).call(next);
    };

    return html`
      <div class="block" style=${cfg.color ? buildCssVars({ "m3a-accent": resolveThemeColor(cfg.color) }) : nothing}>
        <div class="block-head">
          <span class="block-label"
            >${cfg.icon ? html`<ha-icon icon=${cfg.icon}></ha-icon>` : nothing}${label}</span
          >
          <span class="block-value"
            >${formatNumber(this._language, value, {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}${unit ? ` ${unit}` : ""}</span
          >
        </div>
        <div
          class="slider"
          role="slider"
          aria-label=${this._t("appliance_slider_label").replace("{name}", label)}
          aria-valuemin=${range.min}
          aria-valuemax=${range.max}
          aria-valuenow=${value}
          aria-valuetext=${unit ? `${value} ${unit}` : String(value)}
          tabindex="0"
          @pointerdown=${(e: PointerEvent) => {
            e.preventDefault();
            const el = e.currentTarget as HTMLElement;
            el.setPointerCapture(e.pointerId);
            commit(valueFromX(e.clientX, el));
          }}
          @pointermove=${(e: PointerEvent) => {
            const el = e.currentTarget as HTMLElement;
            if (!el.hasPointerCapture(e.pointerId)) return;
            const next = valueFromX(e.clientX, el);
            if (next !== this._drag?.value) commit(next);
          }}
          @pointerup=${(e: PointerEvent) => {
            const el = e.currentTarget as HTMLElement;
            if (!el.hasPointerCapture(e.pointerId)) return;
            const next = valueFromX(e.clientX, el);
            this._drag = { entity: cfg.entity, value: next };
            this._throttleFor(cfg.entity).flush(next);
            this._scheduleDragEnd();
          }}
          @pointercancel=${() => this._scheduleDragEnd()}
          @keydown=${(e: KeyboardEvent) => {
            const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
            if (dir === undefined) return;
            e.preventDefault();
            const step = range.step * (e.shiftKey ? 5 : 1);
            commit(snapToRange(value + dir * step, range));
            this._scheduleDragEnd();
          }}
        >
          <div class="slider-track"></div>
          <div class="slider-fill" style=${`width: ${Math.max(0, Math.min(100, pct))}%;`}></div>
          <div class="slider-handle" style=${`left: ${Math.max(0, Math.min(100, pct))}%;`}></div>
        </div>
      </div>
    `;
  }

  // ---- select block ---------------------------------------------------------

  private _renderSelect(cfg: ApplianceSelectConfig, index: number): TemplateResult | typeof nothing {
    const st = this._state(cfg.entity);
    if (!st) return nothing;

    const options = visibleOptions(st.attributes?.options, cfg.options);
    if (options.length === 0) return nothing;

    const domain = selectOptionDomain(cfg.entity.split(".")[0]);
    const label = cfg.label ?? (st.attributes?.friendly_name as string | undefined) ?? cfg.entity;
    const color = resolveThemeColor(
      cfg.color ?? APPLIANCE_PALETTE[index % APPLIANCE_PALETTE.length],
    );
    const disabled = isMissingState(st.state);
    const style =
      cfg.style === "dropdown" || options.length > APPLIANCE_OPTION_DROPDOWN_FROM
        ? "dropdown"
        : (cfg.style ?? "icon_label");

    const nameFor = (option: string): string => cfg.names?.[option] ?? prettifyOption(option);
    const select = (option: string): void =>
      this._call(domain, "select_option", { option }, cfg.entity);

    if (style === "dropdown") {
      return html`
        <div class="block">
          <span class="block-label">${label}</span>
          <select
            class="dropdown"
            aria-label=${label}
            ?disabled=${disabled}
            @change=${(e: Event) => select((e.target as HTMLSelectElement).value)}
          >
            ${options.map(
              (option) =>
                html`<option value=${option} ?selected=${option === st.state}>
                  ${nameFor(option)}
                </option>`,
            )}
          </select>
        </div>
      `;
    }

    return html`
      <div
        class="block"
        style=${buildCssVars({
          "m3a-pill": color,
          "m3a-pill-tint": tintOn(this, color, undefined, APPLIANCE_OPTION_TINT),
          "m3a-pill-ink": inkOn(color, this),
        })}
      >
        <span class="block-label">${label}</span>
        <div class="pill-row wrap" role="group" aria-label=${label}>
          ${options.map((option) => {
            const active = st.state === option;
            const icon = cfg.icons?.[option];
            const onTap = (): void => select(option);
            return html`
              <button
                class="option-pill ${active ? "active" : ""}"
                type="button"
                ?disabled=${disabled}
                aria-pressed=${active ? "true" : "false"}
                @click=${onTap}
                @keydown=${activateOnKey(onTap)}
              >
                ${icon && style === "icon_label"
                  ? html`<ha-icon icon=${icon}></ha-icon>`
                  : nothing}
                <span class="pill-label">${nameFor(option)}</span>
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  // ---- button block ---------------------------------------------------------

  private _renderButtons(): TemplateResult | typeof nothing {
    const buttons = this._config?.buttons ?? [];
    if (buttons.length === 0) return nothing;

    return html`
      <div class="block">
        <div class="pill-row wrap" role="group" aria-label=${this._t("appliance_actions")}>
          ${buttons.map((btn, i) => this._renderButton(btn, i))}
        </div>
      </div>
    `;
  }

  private _renderButton(cfg: ApplianceButtonConfig, index: number): TemplateResult | typeof nothing {
    const st = this._state(cfg.entity);
    const domain = cfg.entity?.split(".")[0] ?? "";
    const action = cfg.tap_action ?? defaultEntityAction(domain);
    // A button with neither an entity nor an action of its own would be a pill
    // that does nothing at all.
    if (!cfg.entity && !cfg.tap_action) return nothing;

    const missing = !!cfg.entity && (!st || isMissingState(st.state));
    const active = TOGGLE_DOMAINS.has(domain) && isOnState(st?.state);
    const color = resolveThemeColor(cfg.color ?? APPLIANCE_PALETTE[index % APPLIANCE_PALETTE.length]);
    const tint = tintOn(this, color, undefined, APPLIANCE_BUTTON_TINT);
    const name =
      cfg.name ??
      (st?.attributes?.friendly_name as string | undefined) ??
      (cfg.entity ? prettifyOption(cfg.entity.split(".")[1] ?? cfg.entity) : "");
    const onTap = (e: Event): void => {
      e.stopPropagation();
      this._run(action, cfg.entity);
    };

    return html`
      <button
        class="action-btn ${active ? "active" : ""} ${missing ? "dimmed" : ""}"
        type="button"
        style=${buildCssVars({
          "m3a-btn": color,
          "m3a-btn-tint": tint,
          "m3a-btn-fg": foregroundOn(color, tint, 4.5, this),
          "m3a-btn-ink": inkOn(color, this),
        })}
        ?disabled=${missing}
        aria-label=${name}
        aria-pressed=${TOGGLE_DOMAINS.has(domain) ? (active ? "true" : "false") : nothing}
        @click=${onTap}
        @keydown=${activateOnKey(onTap)}
      >
        ${cfg.icon ? html`<ha-icon icon=${cfg.icon}></ha-icon>` : nothing}
        ${name ? html`<span class="pill-label">${name}</span>` : nothing}
      </button>
    `;
  }

  // ---- chip block -----------------------------------------------------------

  private _renderChips(): TemplateResult | typeof nothing {
    const chips = (this._config?.chips ?? [])
      .map((chip) => this._renderChip(chip))
      .filter((c): c is TemplateResult => c !== undefined);
    if (chips.length === 0) return nothing;
    return html`<div class="chip-row">${chips}</div>`;
  }

  private _renderChip(cfg: ApplianceChipConfig): TemplateResult | undefined {
    const st = this._state(cfg.entity);
    // An unreadable chip is left out rather than dimmed: a row of "—" says
    // nothing and pushes the ones that do say something off the edge.
    if (!st || isMissingState(st.state)) return undefined;

    const raw = st.state;
    const rule = findStateRule(cfg.states, raw, numericState(raw));
    const name = cfg.name ?? (st.attributes?.friendly_name as string | undefined);
    const valueText =
      cfg.show_state === false ? undefined : (rule?.label ?? this._stateText(st, raw));
    const text = cfg.label ?? ([name, valueText].filter(Boolean).join(" ") || cfg.entity);

    const color = resolveThemeColor(rule?.color ?? cfg.color ?? this._accent);
    const tint = tintOn(this, color, undefined, APPLIANCE_CHIP_TINT);
    const icon = rule?.icon ?? cfg.icon;
    const vars = buildCssVars({
      "m3a-chip": color,
      "m3a-chip-tint": tint,
      "m3a-chip-fg": foregroundOn(color, tint, 4.5, this),
      "m3a-chip-ink": inkOn(color, this),
    });
    const body = html`${icon ? html`<ha-icon icon=${icon}></ha-icon>` : nothing}<span>${text}</span>`;

    if (!cfg.tap_action || !isActionable(cfg.tap_action)) {
      return html`<span class="chip" style=${vars}>${body}</span>`;
    }

    // Only a chip that actually switches something reports a pressed state.
    // A chip whose tap navigates or opens more-info is a link, and announcing
    // it as a toggle would be a lie a screen reader has no way to see through.
    const togglish =
      cfg.tap_action.action === "toggle" || TOGGLE_DOMAINS.has(cfg.entity.split(".")[0]);
    const on = togglish && isOnState(raw);
    const onTap = (e: Event): void => {
      e.stopPropagation();
      this._run(cfg.tap_action, cfg.entity);
    };
    return html`
      <button
        class="chip control ${on ? "active" : ""}"
        type="button"
        style=${vars}
        aria-label=${text}
        aria-pressed=${togglish ? (on ? "true" : "false") : nothing}
        @click=${onTap}
        @keydown=${activateOnKey(onTap)}
      >
        ${body}
      </button>
    `;
  }

  static styles = css`
    ${glassCardStyles}
    ${cardHeaderStyles}

    ha-card {
      color: var(--m3p-text, var(--primary-text-color));
    }

    .card-inner {
      gap: 14px;
    }

    .card-inner.off {
      opacity: 0.5;
    }

    /* ---- header right-hand reading ---- */
    .reading {
      margin-left: auto;
      text-align: right;
      line-height: 1.1;
    }

    .reading-value {
      font-size: ${APPLIANCE_VALUE_SIZE}px;
      font-weight: 700;
      color: var(--m3a-accent);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .reading-caption {
      font-size: ${APPLIANCE_CAPTION_SIZE}px;
      opacity: 0.5;
      color: var(--m3p-secondary-text);
    }

    /* ---- blocks ---- */
    .block {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .block-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }

    .block-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      font-size: ${APPLIANCE_LABEL_SIZE}px;
      opacity: 0.5;
      color: var(--m3p-secondary-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .block-label ha-icon {
      --mdc-icon-size: 14px;
      width: 14px;
      height: 14px;
    }

    .block-value {
      flex-shrink: 0;
      font-size: 13px;
      font-weight: 700;
      color: var(--m3a-accent);
      font-variant-numeric: tabular-nums;
    }

    /* ---- progress bar ---- */
    .bar {
      position: relative;
      height: ${APPLIANCE_BAR_HEIGHT}px;
      border-radius: ${APPLIANCE_BAR_RADIUS}px;
      overflow: hidden;
      background: color-mix(in srgb, var(--m3p-secondary-text) 16%, transparent);
    }

    .bar-fill {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: ${APPLIANCE_BAR_RADIUS}px;
      background: var(--m3a-accent);
      transition: width 0.45s ${EASING};
    }

    .bar-fill.indeterminate {
      width: ${Math.round(APPLIANCE_INDETERMINATE_FRACTION * 100)}%;
      transition: none;
      animation: appliance-sweep ${unsafeCSS(APPLIANCE_INDETERMINATE_MS)}ms ${EASING} infinite;
    }

    /* An indeterminate bar with nothing to animate would otherwise sit as a
       stub at the left edge and read as "5% done". Parked in the middle it
       reads as "running, no idea how far". */
    .bar-fill.indeterminate.still {
      animation: none;
      left: ${Math.round((100 - APPLIANCE_INDETERMINATE_FRACTION * 100) / 2)}%;
    }

    @keyframes appliance-sweep {
      0% {
        transform: translateX(-100%);
      }
      50% {
        transform: translateX(${Math.round(100 / APPLIANCE_INDETERMINATE_FRACTION - 100)}%);
      }
      100% {
        transform: translateX(-100%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bar-fill.indeterminate {
        animation: none;
        left: ${Math.round((100 - APPLIANCE_INDETERMINATE_FRACTION * 100) / 2)}%;
      }

      .bar-fill {
        transition: none;
      }
    }

    /* ---- sliders ---- */
    .slider {
      position: relative;
      height: ${APPLIANCE_SLIDER_HEIGHT}px;
      cursor: pointer;
      touch-action: none;
      outline: none;
    }

    .slider:focus-visible {
      outline: 2px solid var(--m3a-accent);
      outline-offset: 3px;
      border-radius: 8px;
    }

    .slider-track,
    .slider-fill {
      position: absolute;
      top: 50%;
      left: 0;
      height: ${APPLIANCE_SLIDER_TRACK}px;
      border-radius: ${APPLIANCE_SLIDER_TRACK / 2}px;
      transform: translateY(-50%);
      pointer-events: none;
    }

    .slider-track {
      right: 0;
      background: color-mix(in srgb, var(--m3p-secondary-text) 22%, transparent);
    }

    .slider-fill {
      background: var(--m3a-accent);
    }

    .slider-handle {
      position: absolute;
      top: 50%;
      width: ${APPLIANCE_HANDLE_WIDTH}px;
      height: ${APPLIANCE_HANDLE_HEIGHT}px;
      border-radius: ${APPLIANCE_HANDLE_RADIUS}px;
      background: var(--m3p-text, var(--primary-text-color));
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    /* ---- pill rows ---- */
    .pill-row {
      display: flex;
      gap: 6px;
    }

    .pill-row.wrap {
      flex-wrap: wrap;
    }

    .option-pill,
    .action-btn {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: none;
      cursor: pointer;
      color: var(--m3p-text, var(--primary-text-color));
      font-family: inherit;
      transition:
        border-radius 0.35s ${EASING},
        background 0.35s ${EASING},
        color 0.35s ${EASING};
    }

    .option-pill:disabled,
    .action-btn:disabled {
      cursor: default;
    }

    .option-pill {
      flex-direction: column;
      gap: 2px;
      height: ${APPLIANCE_OPTION_HEIGHT}px;
      padding: 0 10px;
      border-radius: ${APPLIANCE_OPTION_RADIUS}px;
      background: var(--m3a-pill-tint);
    }

    .option-pill ha-icon {
      --mdc-icon-size: 16px;
      width: 16px;
      height: 16px;
    }

    .option-pill.active {
      border-radius: ${APPLIANCE_OPTION_RADIUS_ACTIVE}px;
      background: var(--m3a-pill);
      color: var(--m3a-pill-ink);
    }

    .action-btn {
      height: ${APPLIANCE_BUTTON_HEIGHT}px;
      padding: 0 14px;
      border-radius: ${APPLIANCE_BUTTON_RADIUS}px;
      background: var(--m3a-btn-tint);
      color: var(--m3a-btn-fg);
      font-weight: 600;
    }

    .action-btn ha-icon {
      --mdc-icon-size: 18px;
      width: 18px;
      height: 18px;
    }

    .action-btn.active {
      border-radius: ${APPLIANCE_BUTTON_RADIUS_ACTIVE}px;
      background: var(--m3a-btn);
      color: var(--m3a-btn-ink);
    }

    .action-btn.dimmed {
      opacity: 0.4;
    }

    /* On a narrow card the pills stop sharing a line: at 300px, three action
       buttons side by side leave room for about four characters each. */
    .narrow .action-btn,
    .narrow .option-pill {
      flex-basis: 100%;
    }

    .pill-label {
      font-size: 11px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .action-btn .pill-label {
      font-size: 13px;
    }

    .dropdown {
      width: 100%;
      height: 40px;
      border-radius: 14px;
      border: none;
      padding: 0 12px;
      font-family: inherit;
      font-size: 13px;
      color: var(--m3p-text, var(--primary-text-color));
      background: color-mix(in srgb, var(--m3p-secondary-text) 8%, transparent);
    }

    /* ---- chips ---- */
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: ${APPLIANCE_CHIP_GAP}px;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: ${APPLIANCE_CHIP_HEIGHT}px;
      padding: 0 12px;
      border: none;
      border-radius: ${APPLIANCE_CHIP_RADIUS}px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      color: var(--m3a-chip-fg, var(--m3p-secondary-text));
      background: var(--m3a-chip-tint, color-mix(in srgb, var(--m3p-secondary-text) 8%, transparent));
      transition:
        border-radius 0.35s ${EASING},
        background 0.35s ${EASING},
        color 0.35s ${EASING};
    }

    .chip ha-icon {
      --mdc-icon-size: 16px;
      width: 16px;
      height: 16px;
    }

    .chip.control {
      cursor: pointer;
    }

    .chip.control.active {
      border-radius: ${APPLIANCE_CHIP_RADIUS_ACTIVE}px;
      background: var(--m3a-chip);
      color: var(--m3a-chip-ink);
    }

    .option-pill:focus-visible,
    .action-btn:focus-visible,
    .chip.control:focus-visible {
      outline: 2px solid var(--m3a-accent);
      outline-offset: 2px;
    }

    .no-animations .option-pill,
    .no-animations .action-btn,
    .no-animations .chip,
    .no-animations .bar-fill {
      transition: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-appliance-card": M3ApplianceCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-appliance-card",
  name: "M3 Appliance Card",
  description:
    "One appliance, with its status and its everyday controls on the same card: progress, sliders, programme pills, action buttons and status chips.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
