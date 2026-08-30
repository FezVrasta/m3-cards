import { LitElement, html, svg, css, nothing, unsafeCSS } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  ClockShape,
  ClockStyle,
  HomeAssistant,
  LovelaceCard,
  LovelaceGridOptions,
  M3ClockCardConfig,
} from "./types";
import {
  CARD_VERSION,
  CLOCK_CELL,
  CLOCK_CELL_DIGIT,
  CLOCK_CELL_NARROW,
  CLOCK_COLON_DIM,
  CLOCK_COLON_RADIUS,
  CLOCK_COLON_SIZE,
  CLOCK_DIAL,
  CLOCK_DIAL_INNER_TINT,
  CLOCK_DIAL_OUTER_TINT,
  CLOCK_DIGIT_OVERLAP,
  CLOCK_DIGIT_OVERLAP_MAX,
  CLOCK_DIGIT_OVERLAP_MIN,
  CLOCK_DIGIT_POP_MS,
  CLOCK_HAND_HOUR,
  CLOCK_HAND_MINUTE,
  CLOCK_HUB_R,
  CLOCK_LOCK_DECOR,
  CLOCK_LOCK_DECOR_OPACITY,
  CLOCK_LOCK_DIGIT,
  CLOCK_LOCK_DIGIT_NARROW,
  CLOCK_LOCK_STROKE,
  CLOCK_NARROW_PX,
  CLOCK_PAIR_GAP,
  CLOCK_RING_DRAIN_MS,
  CLOCK_RING_INNER,
  CLOCK_RING_OUTER,
  CLOCK_RING_PAST_OPACITY,
  CLOCK_RING_SECONDS_SIZE,
  CLOCK_RING_SEGMENTS,
  CLOCK_RING_STROKE,
  CLOCK_RING_TIME_SIZE,
  CLOCK_RING_TRACK_TINT,
  CLOCK_ROLL_DELAY_MS,
  CLOCK_ROLL_MS,
  CLOCK_SECOND_FLOWER_R,
  CLOCK_SECONDS_BAR_HEIGHT,
  CLOCK_SECONDS_BAR_RADIUS,
  CLOCK_SECONDS_TRACK_TINT,
  CLOCK_SHAPE_SPEED_RAD_S,
  CLOCK_SHAPES_MINUTE_TINT,
  CLOCK_SIZE_MAX,
  CLOCK_SIZE_MIN,
  CLOCK_TICK_MAJOR_OPACITY,
  CLOCK_TICK_MAJOR_R,
  CLOCK_TICK_MINOR_OPACITY,
  CLOCK_TICK_MINOR_R,
  CLOCK_TILE_ACCENT_TINT,
  CLOCK_TILE_DIGIT_SIZE,
  CLOCK_TILE_HEIGHT,
  CLOCK_TILE_HEIGHT_NARROW,
  CLOCK_TILE_NEUTRAL_TINT,
  CLOCK_TILE_RADIUS,
  CLOCK_TILE_SECONDS_WIDTH,
  CLOCK_TILE_WIDTH,
  CLOCK_TILE_WIDTH_NARROW,
  CLOCK_TIME_JUMP_MS,
  DEFAULT_CLOCK_ACCENT,
  DEFAULT_CLOCK_RADIUS,
  DEFAULT_CLOCK_SECONDARY,
  resolveCornerRadius,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { STANDARD_EASING, isReducedMotion, shouldAnimate } from "./shared/animation";
import {
  buildCssVars,
  foregroundColor,
  inkOn,
  resolveCommonColors,
  resolveThemeColor,
  tintInk,
  tintOn,
} from "./shared/color-config";
import { glassCardClass, glassCardStyles } from "./shared/glass-card";
import { pad2, to12Hour, uses12Hour } from "./shared/ha-time";
import { SHAPE_PRESETS, lobedPath, shapePath } from "./shared/shapes";
import { VisibleTicker } from "./shared/visible-ticker";

const EASING = unsafeCSS(STANDARD_EASING);

interface ClockParts {
  hours: string;
  minutes: string;
  seconds: string;
  /** 0…23 regardless of the display format, for the analog hands. */
  hours24: number;
  minutesNum: number;
  secondsNum: number;
  /** Fraction of the current minute already elapsed, 0…1. */
  minuteFraction: number;
  pm: boolean;
  date: Date;
}

@customElement("m3-clock-card")
export class M3ClockCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ClockCardConfig;
  @state() private _narrow = false;

  /** What is on screen. Assigned only when the rendered text would change. */
  @state() private _shown = "";
  /** Which tile is mid-roll, so only the digit that changed animates. */
  @state() private _rolling: "hours" | "minutes" | "seconds" | "" = "";
  /** Colon phase. Flips once a second at most, so reactive state is fine. */
  @state() private _colonOn = true;

  private _ticker?: VisibleTicker;
  private _resizeObserver?: ResizeObserver;
  /** Precise fraction of the current minute. Drives the seconds bar and the
   *  second hand through the DOM directly: routing this through reactive state
   *  would be 60 renders a second for a bar that moves a pixel. */
  private _barFraction = 0;
  /** Shape rotation in radians. Also written straight to the DOM. */
  private _rotation = 0;
  private _rollTimer?: number;
  private _lastNow = 0;
  private _lastFrame = 0;

  public static getStubConfig(): Partial<M3ClockCardConfig> {
    return { style: "tiles", show_seconds: true, show_date: true };
  }

  public setConfig(config: M3ClockCardConfig): void {
    this._config = { ...config };
  }

  public getCardSize(): number {
    const style = this._config?.style ?? "tiles";
    return style === "scallop" || style === "ring" ? 5 : 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_rows: 2 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._ticker = new VisibleTicker(this, (now) => this._tick(now));
    this._ticker.connect();
    this._ticker.setCadence(this._cadence);
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        const narrow = w > 0 && w < CLOCK_NARROW_PX;
        if (narrow !== this._narrow) this._narrow = narrow;
      });
      this._resizeObserver.observe(this);
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ticker?.disconnect();
    this._ticker = undefined;
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    if (this._rollTimer !== undefined) clearTimeout(this._rollTimer);
  }

  /**
   * A clock reads no entity state, so a hass tick can only matter for the
   * optional alarm and sun chips; everything else comes from its own timer.
   */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!changed.has("hass") || changed.size > 1) return true;
    const previous = changed.get("hass") as HomeAssistant | undefined;
    if (!previous || !this.hass) return true;
    if (
      previous.locale !== this.hass.locale ||
      previous.language !== this.hass.language ||
      previous.config?.time_zone !== this.hass.config?.time_zone
    ) {
      return true;
    }
    for (const id of [this._config?.alarm_entity, this._config?.sun_entity]) {
      if (id && previous.states[id] !== this.hass.states[id]) return true;
    }
    return false;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has("_config")) this._ticker?.setCadence(this._cadence);
    this._paintFrame();
  }

  // ---- timing --------------------------------------------------------------

  private get _motion(): boolean {
    const cfg = this._config;
    if (!shouldAnimate(cfg?.animation) || isReducedMotion()) return false;
    return cfg?.shape_motion ?? true;
  }

  private get _style(): ClockStyle {
    return this._config?.style ?? "tiles";
  }

  private get _cadence(): "frame" | "second" | "minute" {
    const cfg = this._config;
    const style = this._style;
    const seconds = cfg?.show_seconds ?? true;

    // Only something that moves between whole seconds needs frames: a filling
    // bar, a turning shape, a sweeping hand.
    const shaped = style === "shapes" || style === "lockscreen" || style === "scallop";
    if (shaped && this._motion) return "frame";
    if (style === "tiles" && seconds && (cfg?.seconds_style ?? "bar") === "bar") return "frame";

    if (seconds) return "second";
    if (style === "tiles" && (cfg?.colon_blink ?? true)) return "second";
    // Nothing moves until the minute turns — by far the cheapest cadence.
    return "minute";
  }

  private _tick(now: number): void {
    const jumped = Math.abs(now - this._lastNow) > CLOCK_TIME_JUMP_MS;
    // Elapsed time, not a per-frame constant: a 120Hz display must not turn the
    // shapes twice as fast as a 60Hz one.
    const dt = this._lastFrame ? Math.min(0.1, (now - this._lastFrame) / 1000) : 0;
    this._lastFrame = now;
    this._lastNow = now;

    if (this._motion) {
      const speed = CLOCK_SHAPE_SPEED_RAD_S[this._config?.shape_speed ?? "normal"];
      this._rotation = (this._rotation + speed * dt) % (Math.PI * 2);
    }

    const parts = this._parts(now);
    this._barFraction = parts.minuteFraction;
    this._paintFrame();

    const key = `${parts.hours}:${parts.minutes}:${parts.seconds}|${parts.pm}`;
    if (key !== this._shown) {
      const previous = this._shown;
      this._shown = key;
      if (!jumped) this._startRoll(previous, key);
    }

    if (this._config?.colon_blink ?? true) {
      const on = Math.floor(now / 1000) % 2 === 0;
      if (on !== this._colonOn) this._colonOn = on;
    } else if (!this._colonOn) {
      this._colonOn = true;
    }
  }

  /** Roll only the tile whose digits actually changed. */
  private _startRoll(previous: string, next: string): void {
    if (!shouldAnimate(this._config?.animation) || isReducedMotion()) return;
    if (!previous) return;
    const [ph, pm] = previous.split("|")[0].split(":");
    const [nh, nm] = next.split("|")[0].split(":");
    const which = ph !== nh ? "hours" : pm !== nm ? "minutes" : "";
    if (!which) return;
    this._rolling = which;
    if (this._rollTimer !== undefined) clearTimeout(this._rollTimer);
    this._rollTimer = window.setTimeout(
      () => (this._rolling = ""),
      CLOCK_ROLL_MS + CLOCK_ROLL_DELAY_MS,
    );
  }

  /**
   * Everything that moves between renders is written here, straight to the DOM.
   * Nothing in this method may assign reactive state.
   */
  private _paintFrame(): void {
    const root = this.renderRoot as ParentNode | undefined;
    if (!root) return;

    const fill = root.querySelector<HTMLElement>(".sec-fill");
    if (fill) fill.style.width = `${(this._barFraction * 100).toFixed(2)}%`;

    // The lobed shapes re-sample their path rather than rotating the element,
    // so the shape turns while the digit inside it stays upright.
    for (const el of root.querySelectorAll<SVGPathElement>("path[data-lobes]")) {
      const lobes = Number(el.dataset.lobes);
      if (!Number.isFinite(lobes) || lobes <= 0) continue;
      el.setAttribute(
        "d",
        lobedPath(
          Number(el.dataset.cx),
          Number(el.dataset.cy),
          Number(el.dataset.r),
          lobes,
          Number(el.dataset.amp),
          this._rotation * Number(el.dataset.dir || "1"),
        ),
      );
    }

    const hand = root.querySelector<SVGGElement>(".hand-second");
    if (hand) {
      const seconds = this._parts(this._lastNow || Date.now()).secondsNum;
      const c = (CLOCK_DIAL * this._size) / 2;
      hand.setAttribute("transform", `rotate(${seconds * 6} ${c} ${c})`);
    }
  }

  // ---- model ---------------------------------------------------------------

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private get _zone(): string | undefined {
    const wanted = this._config?.time_zone || this.hass?.config?.time_zone;
    if (!wanted) return undefined;
    try {
      new Intl.DateTimeFormat("en", { timeZone: wanted });
      return wanted;
    } catch {
      // Invalid zone: system time rather than a broken card.
      return undefined;
    }
  }

  private get _twelveHour(): boolean {
    const format = this._config?.time_format ?? "auto";
    return format === "12" || (format === "auto" && uses12Hour(this.hass));
  }

  private get _size(): number {
    return Math.min(CLOCK_SIZE_MAX, Math.max(CLOCK_SIZE_MIN, this._config?.size ?? 1));
  }

  private _parts(now: number): ClockParts {
    const date = new Date(now);
    const zone = this._zone;
    let h: number;
    let m: number;
    let sec: number;
    if (zone) {
      const f = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const got: Record<string, string> = {};
      for (const p of f.formatToParts(date)) got[p.type] = p.value;
      h = Number(got.hour ?? 0) % 24;
      m = Number(got.minute ?? 0);
      sec = Number(got.second ?? 0);
    } else {
      h = date.getHours();
      m = date.getMinutes();
      sec = date.getSeconds();
    }

    const { display, pm } = to12Hour(h);
    // 12-hour drops the leading zero, as a clock face would.
    const hours = this._twelveHour ? String(display) : pad2(h);
    const ms = date.getMilliseconds();

    return {
      hours,
      minutes: pad2(m),
      seconds: pad2(sec),
      hours24: h,
      minutesNum: m,
      secondsNum: sec,
      minuteFraction: (sec + ms / 1000) / 60,
      pm,
      date,
    };
  }

  private _dateText(date: Date): string {
    const mode = this._config?.date_format ?? "auto";
    const zone = this._zone;
    const opts: Intl.DateTimeFormatOptions =
      mode === "short"
        ? { weekday: "short", day: "numeric", month: "short" }
        : mode === "long"
          ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
          : { weekday: "long", day: "numeric", month: "short" };
    try {
      return new Intl.DateTimeFormat(this._language, { ...opts, timeZone: zone }).format(date);
    } catch {
      return new Intl.DateTimeFormat(this._language, opts).format(date);
    }
  }

  private _ampm(parts: ClockParts): string {
    return this._t(parts.pm ? "clock_pm" : "clock_am");
  }

  /**
   * A lobed path that `_paintFrame` can re-sample. The geometry travels in data
   * attributes so the frame loop needs no lookup table. With motion off the
   * shape is emitted once and never touched again — it stands still rather than
   * disappearing.
   */
  private _lobed(
    name: ClockShape,
    cx: number,
    cy: number,
    r: number,
    cls: string,
    fill: string,
    direction = 1,
  ) {
    const preset = SHAPE_PRESETS[name] ?? SHAPE_PRESETS.cookie;
    const spin = this._motion && preset.lobes > 0;
    return svg`<path
      class=${cls}
      fill=${fill}
      d=${shapePath(name, cx, cy, r, spin ? this._rotation * direction : 0)}
      data-lobes=${spin ? String(preset.lobes) : ""}
      data-amp=${String(preset.amp)}
      data-cx=${String(cx)}
      data-cy=${String(cy)}
      data-r=${String(r)}
      data-dir=${String(direction)}
    ></path>`;
  }

  // ---- render --------------------------------------------------------------

  protected render() {
    if (!this._config) return nothing;
    const cfg = this._config;

    const accent = cfg.accent_color ? resolveThemeColor(cfg.accent_color) : DEFAULT_CLOCK_ACCENT;
    const secondary = cfg.secondary_color
      ? resolveThemeColor(cfg.secondary_color)
      : DEFAULT_CLOCK_SECONDARY;
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(cfg);

    const mode = cfg.tile_color_mode ?? "accent_hours";
    const hourTint = tintOn(this, accent, undefined, CLOCK_TILE_ACCENT_TINT);
    const minuteTint =
      mode === "both_accent"
        ? tintOn(this, secondary, undefined, CLOCK_TILE_ACCENT_TINT)
        : tintOn(this, "var(--primary-text-color)", undefined, CLOCK_TILE_NEUTRAL_TINT);

    const cssVars = buildCssVars({
      "clock-accent": accent,
      "clock-accent-fg": foregroundColor(this, accent),
      "clock-secondary": secondary,
      "clock-hour-bg": hourTint,
      // Digits sit on their tile, not on the card, so they are measured
      // against the tile.
      "clock-hour-ink":
        mode === "neutral"
          ? textColorCss
          : tintInk(this, accent, undefined, CLOCK_TILE_ACCENT_TINT, 3),
      "clock-minute-bg": minuteTint,
      "clock-minute-ink":
        mode === "both_accent"
          ? tintInk(this, secondary, undefined, CLOCK_TILE_ACCENT_TINT, 3)
          : textColorCss,
      "clock-sec-track": tintOn(
        this,
        "var(--primary-text-color)",
        undefined,
        CLOCK_SECONDS_TRACK_TINT,
      ),
      "clock-sec-fill": foregroundColor(this, secondary, 3),
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
    });

    const size = this._size;
    const radius = resolveCornerRadius(cfg.radius ?? DEFAULT_CLOCK_RADIUS, cfg.corners);
    const parts = this._parts(this._lastNow || Date.now());

    const sizeVars =
      `--clock-tile-w: ${(this._narrow ? CLOCK_TILE_WIDTH_NARROW : CLOCK_TILE_WIDTH) * size}px;` +
      ` --clock-tile-h: ${(this._narrow ? CLOCK_TILE_HEIGHT_NARROW : CLOCK_TILE_HEIGHT) * size}px;` +
      ` --clock-digit: ${CLOCK_TILE_DIGIT_SIZE * size}px;` +
      ` --clock-tile-r: ${CLOCK_TILE_RADIUS * size}px;` +
      ` --clock-sec-w: ${CLOCK_TILE_SECONDS_WIDTH * size}px;` +
      ` --clock-cell: ${(this._narrow ? CLOCK_CELL_NARROW : CLOCK_CELL) * size}px;` +
      ` --clock-lock: ${(this._narrow ? CLOCK_LOCK_DIGIT_NARROW : CLOCK_LOCK_DIGIT) * size}px;`;

    const style = this._style;
    const body =
      style === "shapes"
        ? this._renderShapes(parts, accent, secondary)
        : style === "lockscreen"
          ? this._renderLockscreen(parts, accent)
          : style === "scallop"
            ? this._renderScallop(parts, accent, secondary)
            : style === "ring"
              ? this._renderRing(parts, accent)
              : this._renderTiles(parts);

    return html`
      <ha-card style=${`${cssVars} ${sizeVars} border-radius: ${radius};`}>
        <div
          class="card-inner style-${style} ${glassCardClass(cfg.glass_background)} ${
            shouldAnimate(cfg.animation) ? "" : "no-animations"
          }"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${body}
          ${(cfg.show_date ?? true) && style !== "ring"
            ? html`<div class="date">${this._dateText(parts.date)}</div>`
            : nothing}
        </div>
      </ha-card>
    `;
  }

  // ---- style: tiles --------------------------------------------------------

  private _renderTiles(parts: ClockParts): TemplateResult {
    const cfg = this._config!;
    const showSeconds = cfg.show_seconds ?? true;
    const secondsStyle = cfg.seconds_style ?? "bar";
    return html`
      <div class="tiles">
        <div class="tile hours ${this._rolling === "hours" ? "roll" : ""}">
          <span class="digits">${parts.hours}</span>
        </div>
        <div class="colon ${this._colonOn ? "" : "dim"}"><i></i><i></i></div>
        <div class="tile minutes ${this._rolling === "minutes" ? "roll" : ""}">
          <span class="digits">${parts.minutes}</span>
        </div>
        ${cfg.show_seconds_tile
          ? html`<div class="tile seconds"><span class="digits">${parts.seconds}</span></div>`
          : nothing}
        ${this._twelveHour ? html`<span class="ampm">${this._ampm(parts)}</span>` : nothing}
      </div>
      ${showSeconds && secondsStyle === "bar"
        ? html`<div class="sec-track"><div class="sec-fill"></div></div>`
        : nothing}
      ${showSeconds && secondsStyle === "dots"
        ? html`<div class="sec-dots">
            ${Array.from(
              { length: 60 },
              (_, i) => html`<i class=${i <= parts.secondsNum ? "on" : ""}></i>`,
            )}
          </div>`
        : nothing}
    `;
  }

  // ---- style: shapes -------------------------------------------------------

  private _renderShapes(parts: ClockParts, accent: string, secondary: string): TemplateResult {
    const cfg = this._config!;
    const cell = (this._narrow ? CLOCK_CELL_NARROW : CLOCK_CELL) * this._size;
    // Negative: the two digits of a pair overlap so "14" reads as one number
    // rather than as two separate badges.
    const overlap = Math.min(
      CLOCK_DIGIT_OVERLAP_MAX,
      Math.max(CLOCK_DIGIT_OVERLAP_MIN, cfg.digit_overlap ?? CLOCK_DIGIT_OVERLAP),
    );
    const hourShape = cfg.shape_hours ?? "cookie";
    const minuteShape = cfg.shape_minutes ?? "clover";
    const minuteTint = tintOn(this, secondary, undefined, CLOCK_SHAPES_MINUTE_TINT);
    // The hour pair is a solid fill in the user's accent, so the digit picks
    // the ink that reads on it rather than shifting the accent itself. The
    // minute pair is a tint, so its digit is measured against the tint.
    // Measuring either against the card would be the mistake that made chips
    // unreadable in a light theme.
    const hourInk = inkOn(accent, this);
    const minuteInk = tintInk(this, secondary, undefined, CLOCK_SHAPES_MINUTE_TINT, 4.5);

    const digitCell = (digit: string, shape: ClockShape, fill: string, ink: string, i: number) => {
      const r = cell / 2;
      return html`<div
        class="cell"
        style=${`width:${cell}px;height:${cell}px;margin-left:${i === 1 ? overlap : 0}px;z-index:${2 - i};`}
      >
        <svg viewBox=${`0 0 ${cell} ${cell}`} width=${cell} height=${cell} aria-hidden="true">
          ${this._lobed(shape, r, r, r * 0.94, "cell-shape", fill)}
        </svg>
        <span class="cell-digit" style=${`color:${ink};`}>${digit}</span>
      </div>`;
    };

    const hourDigits = parts.hours.length === 1 ? ["", parts.hours] : parts.hours.split("");
    const [m1, m2] = parts.minutes.split("");

    return html`
      <div class="shape-row">
        <div class="pair">
          ${hourDigits[0]
            ? digitCell(hourDigits[0], hourShape, accent, hourInk, 0)
            : nothing}
          ${digitCell(hourDigits[1], hourShape, accent, hourInk, hourDigits[0] ? 1 : 0)}
        </div>
        <div class="colon ${this._colonOn ? "" : "dim"}"><i></i><i></i></div>
        <div class="pair">
          ${digitCell(m1, minuteShape, minuteTint, minuteInk, 0)}
          ${digitCell(m2, minuteShape, minuteTint, minuteInk, 1)}
        </div>
        ${this._twelveHour ? html`<span class="ampm">${this._ampm(parts)}</span>` : nothing}
      </div>
    `;
  }

  // ---- style: lockscreen ---------------------------------------------------

  private _renderLockscreen(parts: ClockParts, accent: string): TemplateResult {
    const cfg = this._config!;
    const target = cfg.outline_target ?? "minutes";
    // The outline is the only thing drawing that line, so it must carry the
    // contrast itself — a pale accent stroke vanishes on a light card.
    const stroke = foregroundColor(this, accent);
    const decor = CLOCK_LOCK_DECOR * this._size;

    const line = (text: string, outlined: boolean) => html`<div
      class="lock-line ${outlined ? "outline" : "solid"}"
      style=${outlined ? `-webkit-text-stroke: ${CLOCK_LOCK_STROKE}px ${stroke};` : ""}
    >
      ${text}
    </div>`;

    return html`
      <div class="lock ${cfg.layout === "inline" ? "inline" : "stacked"}">
        ${(cfg.show_decor ?? true)
          ? html`<svg
              class="decor"
              width=${decor}
              height=${decor}
              viewBox=${`0 0 ${decor} ${decor}`}
              aria-hidden="true"
            >
              ${this._lobed("cookie", decor / 2, decor / 2, decor / 2 - 2, "decor-shape", accent)}
            </svg>`
          : nothing}
        ${line(parts.hours, target === "hours")} ${line(parts.minutes, target === "minutes")}
        ${this._twelveHour ? html`<span class="ampm">${this._ampm(parts)}</span>` : nothing}
      </div>
    `;
  }

  // ---- style: scallop ------------------------------------------------------

  private _renderScallop(parts: ClockParts, accent: string, secondary: string): TemplateResult {
    const cfg = this._config!;
    const D = CLOCK_DIAL * this._size;
    const c = D / 2;
    const outer = tintOn(this, accent, undefined, CLOCK_DIAL_OUTER_TINT);
    const inner = tintOn(this, secondary, undefined, CLOCK_DIAL_INNER_TINT);
    const tickStyle = cfg.tick_style ?? "dots";
    const showSeconds = cfg.show_seconds ?? true;

    const hourAngle = ((parts.hours24 % 12) + parts.minutesNum / 60) * 30;
    const minuteAngle = (parts.minutesNum + parts.secondsNum / 60) * 6;

    const ticks = [];
    if (tickStyle !== "none") {
      for (let i = 0; i < 12; i++) {
        const a = ((i * 30 - 90) * Math.PI) / 180;
        const major = i % 3 === 0;
        const rr = c * 0.72;
        const x = c + rr * Math.cos(a);
        const y = c + rr * Math.sin(a);
        ticks.push(
          tickStyle === "dots"
            ? svg`<circle cx=${x} cy=${y} r=${major ? CLOCK_TICK_MAJOR_R : CLOCK_TICK_MINOR_R}
                fill="var(--m3p-text)"
                opacity=${major ? CLOCK_TICK_MAJOR_OPACITY : CLOCK_TICK_MINOR_OPACITY}></circle>`
            : svg`<line x1=${c + rr * 0.9 * Math.cos(a)} y1=${c + rr * 0.9 * Math.sin(a)}
                x2=${x} y2=${y} stroke="var(--m3p-text)" stroke-width=${major ? 3 : 1.5}
                stroke-linecap="round"
                opacity=${major ? CLOCK_TICK_MAJOR_OPACITY : CLOCK_TICK_MINOR_OPACITY}></line>`,
        );
      }
    }

    const hand = (angle: number, length: number, width: number) => svg`<line
      x1=${c} y1=${c}
      x2=${c + length * Math.cos(((angle - 90) * Math.PI) / 180)}
      y2=${c + length * Math.sin(((angle - 90) * Math.PI) / 180)}
      stroke="var(--m3p-text)" stroke-width=${width} stroke-linecap="round"></line>`;

    return html`
      <svg class="dial" width=${D} height=${D} viewBox=${`0 0 ${D} ${D}`} aria-hidden="true">
        ${this._lobed("scallop", c, c, c - 2, "dial-outer", outer, 1)}
        ${this._lobed("clover", c, c, c * 0.74, "dial-inner", inner, -1)} ${ticks}
        ${hand(hourAngle, c * 0.42, CLOCK_HAND_HOUR * this._size)}
        ${hand(minuteAngle, c * 0.6, CLOCK_HAND_MINUTE * this._size)}
        ${showSeconds
          ? svg`<g class="hand-second" transform=${`rotate(${parts.secondsNum * 6} ${c} ${c})`}>
              <path d=${lobedPath(c, c - c * 0.66, CLOCK_SECOND_FLOWER_R * this._size, 5, 0.2, 0)}
                fill="var(--clock-secondary)"></path>
            </g>`
          : nothing}
        <circle cx=${c} cy=${c} r=${CLOCK_HUB_R * this._size} fill="var(--clock-accent)"></circle>
      </svg>
    `;
  }

  // ---- style: ring ---------------------------------------------------------

  /**
   * Sixty segments round a dial. With seconds on, the ring is the current
   * minute filling up. With seconds off it becomes the current *hour* filling
   * up, one segment a minute — the same picture at a slower pace, which is more
   * use than a ring that has simply been switched off.
   */
  private _renderRing(parts: ClockParts, accent: string): TemplateResult {
    const cfg = this._config!;
    const showSeconds = cfg.show_seconds ?? true;
    const size = this._size;
    const outer = CLOCK_RING_OUTER * size;
    const inner = CLOCK_RING_INNER * size;
    const D = outer * 2 + CLOCK_RING_STROKE * 2;
    const c = D / 2;
    const track = tintOn(this, "var(--primary-text-color)", undefined, CLOCK_RING_TRACK_TINT);
    const lit = foregroundColor(this, accent, 3);
    const filled = showSeconds ? parts.secondsNum : parts.minutesNum;
    const drain = (cfg.ring_animation ?? "reset") === "drain";

    const segments = [];
    for (let i = 0; i < CLOCK_RING_SEGMENTS; i++) {
      const a = ((i * 6 - 90) * Math.PI) / 180;
      const on = i <= filled;
      segments.push(svg`<line
        class="seg"
        x1=${c + outer * Math.cos(a)} y1=${c + outer * Math.sin(a)}
        x2=${c + inner * Math.cos(a)} y2=${c + inner * Math.sin(a)}
        stroke=${on ? lit : track}
        stroke-width=${CLOCK_RING_STROKE}
        stroke-linecap="round"
        opacity=${on && i !== filled ? CLOCK_RING_PAST_OPACITY : 1}></line>`);
    }

    return html`
      <div class="ring-wrap ${drain ? "drain" : ""}">
        <svg width=${D} height=${D} viewBox=${`0 0 ${D} ${D}`} aria-hidden="true">${segments}</svg>
        <div class="ring-centre">
          <div class="ring-time">
            ${parts.hours}:${parts.minutes}${this._twelveHour
              ? html`<span class="ring-ampm">${this._ampm(parts)}</span>`
              : nothing}
          </div>
          <div class="ring-seconds">
            ${showSeconds
              ? parts.seconds
              : (this._config?.show_date ?? true)
                ? this._dateText(parts.date)
                : nothing}
          </div>
        </div>
      </div>
    `;
  }

  static styles = css`
    ${glassCardStyles}

    .card-inner {
      align-items: center;
      justify-content: center;
      gap: 10px;
      /* Width-based breakpoints only, so this can stay inline-size: a size
         container would need a definite height and collapses to zero without
         one in a masonry column. */
      container-type: inline-size;
    }

    /* ---- tiles ---- */

    .tiles {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .tile {
      width: var(--clock-tile-w);
      height: var(--clock-tile-h);
      border-radius: var(--clock-tile-r);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .tile.hours {
      background: var(--clock-hour-bg);
      color: var(--clock-hour-ink);
    }

    .tile.minutes,
    .tile.seconds {
      background: var(--clock-minute-bg);
      color: var(--clock-minute-ink);
    }

    .tile.seconds {
      width: var(--clock-sec-w);
    }

    .digits {
      font-size: var(--clock-digit);
      font-weight: 800;
      letter-spacing: -3px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .tile.roll .digits {
      animation: roll ${unsafeCSS(String(CLOCK_ROLL_MS))}ms ${EASING};
    }

    @keyframes roll {
      0% {
        transform: translateY(-100%);
        opacity: 0;
      }
      100% {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .colon {
      display: flex;
      flex-direction: column;
      gap: 7px;
      transition: opacity 0.5s ${EASING};
    }

    .colon i {
      display: block;
      width: ${CLOCK_COLON_SIZE}px;
      height: ${CLOCK_COLON_SIZE}px;
      border-radius: ${CLOCK_COLON_RADIUS}px;
      background: var(--m3p-secondary-text);
      opacity: 0.55;
    }

    .colon.dim {
      opacity: ${CLOCK_COLON_DIM};
    }

    .ampm {
      align-self: flex-start;
      margin-top: 4px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--clock-accent-fg, var(--clock-accent));
    }

    .sec-track {
      width: 100%;
      max-width: calc(var(--clock-tile-w) * 2 + 24px);
      height: ${CLOCK_SECONDS_BAR_HEIGHT}px;
      border-radius: ${CLOCK_SECONDS_BAR_RADIUS}px;
      background: var(--clock-sec-track);
      overflow: hidden;
    }

    .sec-fill {
      height: 100%;
      width: 0;
      border-radius: inherit;
      background: var(--clock-sec-fill);
    }

    .sec-dots {
      display: flex;
      gap: 2px;
      justify-content: center;
      width: 100%;
      max-width: calc(var(--clock-tile-w) * 2 + 24px);
    }

    .sec-dots i {
      flex: 1 1 0;
      height: 4px;
      border-radius: 2px;
      background: var(--clock-sec-track);
    }

    .sec-dots i.on {
      background: var(--clock-sec-fill);
    }

    /* ---- shapes ---- */

    .shape-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: ${CLOCK_PAIR_GAP}px;
    }

    .pair {
      display: flex;
      align-items: center;
    }

    .cell {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .cell svg {
      position: absolute;
      inset: 0;
    }

    .cell-digit {
      position: relative;
      font-size: calc(var(--clock-cell) * ${unsafeCSS(String(CLOCK_CELL_DIGIT / CLOCK_CELL))});
      font-weight: 800;
      letter-spacing: -2px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      transition: transform ${unsafeCSS(String(CLOCK_DIGIT_POP_MS))}ms ${EASING};
    }

    /* ---- lockscreen ---- */

    .lock {
      position: relative;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .lock.inline {
      flex-direction: row;
      align-items: baseline;
      gap: 12px;
    }

    .lock-line {
      font-size: var(--clock-lock);
      line-height: 0.95;
      letter-spacing: -5px;
      font-variant-numeric: tabular-nums;
    }

    .lock-line.solid {
      font-weight: 900;
      color: var(--m3p-text);
    }

    .lock-line.outline {
      font-weight: 200;
      color: transparent;
    }

    .decor {
      position: absolute;
      top: -18px;
      right: -14px;
      opacity: ${CLOCK_LOCK_DECOR_OPACITY};
      pointer-events: none;
    }

    /* ---- scallop ---- */

    .dial {
      display: block;
      max-width: 100%;
      height: auto;
    }

    /* ---- ring ---- */

    .ring-wrap {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ring-wrap svg {
      display: block;
      max-width: 100%;
      height: auto;
    }

    .ring-centre {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
    }

    .ring-time {
      font-size: ${CLOCK_RING_TIME_SIZE}px;
      font-weight: 700;
      color: var(--m3p-text);
      font-variant-numeric: tabular-nums;
    }

    .ring-ampm {
      font-size: 12px;
      font-weight: 700;
      margin-left: 4px;
      color: var(--clock-accent-fg, var(--clock-accent));
    }

    .ring-seconds {
      font-size: ${CLOCK_RING_SECONDS_SIZE}px;
      font-weight: 600;
      color: var(--clock-accent-fg, var(--clock-accent));
      font-variant-numeric: tabular-nums;
    }

    .ring-wrap.drain .seg {
      transition: opacity ${unsafeCSS(String(CLOCK_RING_DRAIN_MS))}ms ${EASING};
    }

    /* ---- shared ---- */

    .date {
      font-size: 14px;
      font-weight: 600;
      color: var(--m3p-secondary-text);
      text-align: center;
    }

    /* Motion off means the shapes stand still — not that they disappear. */
    .card-inner.no-animations .tile.roll .digits,
    .card-inner.no-animations .colon,
    .card-inner.no-animations .ring-wrap .seg,
    .card-inner.no-animations .cell-digit {
      animation: none;
      transition: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .tile.roll .digits,
      .colon,
      .ring-wrap .seg,
      .cell-digit {
        animation: none !important;
        transition: none !important;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-clock-card": M3ClockCard;
  }
}

const windowWithCards = window as unknown as Window & {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-clock-card",
  name: "M3 Clock Card",
  description:
    "Eine Material-3-Uhr mit fünf wählbaren Stilen — Kacheln, Formen-Ziffern, Sperrbildschirm-Typografie, organisch-analog und Sekundenring.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});

// eslint-disable-next-line no-console
console.info(
  `%c M3-CLOCK-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #85b7eb; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #85b7eb; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);
