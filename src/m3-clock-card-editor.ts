import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ClockStyle, HomeAssistant, LovelaceCardEditor, M3ClockCardConfig } from "./types";
import {
  CLOCK_DIGIT_OVERLAP,
  CLOCK_DIGIT_OVERLAP_MAX,
  CLOCK_DIGIT_OVERLAP_MIN,
  CLOCK_SIZE_MAX,
  CLOCK_SIZE_MIN,
  DEFAULT_CLOCK_ACCENT,
  DEFAULT_CLOCK_RADIUS,
  DEFAULT_CLOCK_SECONDARY,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, colorRow, editorStyles, type SchemaEntry } from "./shared/editor-helpers";
import { SHAPE_NAMES } from "./shared/shapes";
import {
  cornerPresetPatch,
  initAppearanceState,
  radiusPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

/** Which optional sections a style actually has. Keeping this in one table
 *  rather than scattered `style === "…"` checks means a new style declares its
 *  panels in one place. */
const SECTIONS: Record<ClockStyle, { shapes: boolean; tiles: boolean; ring: boolean }> = {
  tiles: { shapes: false, tiles: true, ring: false },
  shapes: { shapes: true, tiles: false, ring: false },
  lockscreen: { shapes: true, tiles: false, ring: false },
  scallop: { shapes: true, tiles: false, ring: false },
  ring: { shapes: false, tiles: false, ring: true },
};

@customElement("m3-clock-card-editor")
export class M3ClockCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ClockCardConfig;
  @state() private _appearance: AppearanceState = {
    showCustomRadius: false,
    showCorners: false,
    cornerCustom: {},
  };

  public setConfig(config: M3ClockCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_CLOCK_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _emit(config: M3ClockCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private get _style(): ClockStyle {
    return this._config?.style ?? "tiles";
  }

  // ---- schemas -------------------------------------------------------------

  private _styleSchema(): SchemaEntry[] {
    return [
      {
        name: "style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "tiles", label: "Tiles — two large rounded tiles" },
              { value: "shapes", label: "Shapes — digits inside lobed shapes" },
              { value: "lockscreen", label: "Lockscreen — one filled, one outlined" },
              { value: "scallop", label: "Scallop — organic analogue dial" },
              { value: "ring", label: "Ring — sixty segments round the time" },
            ],
          },
        },
      },
      {
        name: "size",
        selector: {
          number: { min: CLOCK_SIZE_MIN, max: CLOCK_SIZE_MAX, step: 0.05, mode: "slider" },
        },
      },
    ];
  }

  private _timeSchema(): SchemaEntry[] {
    return [
      { name: "time_zone", selector: { text: {} } },
      {
        name: "time_format",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: "auto" },
              { value: "12", label: "12 h" },
              { value: "24", label: "24 h" },
            ],
          },
        },
      },
      { name: "show_date", selector: { boolean: {} } },
      {
        name: "date_format",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: "auto" },
              { value: "short", label: "short" },
              { value: "long", label: "long" },
            ],
          },
        },
      },
    ];
  }

  private _secondsSchema(): SchemaEntry[] {
    const style = this._style;
    const out: SchemaEntry[] = [{ name: "show_seconds", selector: { boolean: {} } }];
    if (style === "tiles") {
      out.push(
        {
          name: "seconds_style",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "bar", label: "bar" },
                { value: "dots", label: "dots" },
                { value: "none", label: "none" },
              ],
            },
          },
        },
        { name: "show_seconds_tile", selector: { boolean: {} } },
        { name: "colon_blink", selector: { boolean: {} } },
      );
    }
    if (SECTIONS[style].ring) {
      out.push({
        name: "ring_animation",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "reset", label: "reset" },
              { value: "drain", label: "drain" },
            ],
          },
        },
      });
    }
    return out;
  }

  private _shapeSchema(): SchemaEntry[] {
    const style = this._style;
    const shapeOptions = SHAPE_NAMES.map((n) => ({ value: n, label: n }));
    const out: SchemaEntry[] = [];
    if (style === "shapes") {
      out.push(
        { name: "shape_hours", selector: { select: { mode: "dropdown", options: shapeOptions } } },
        { name: "shape_minutes", selector: { select: { mode: "dropdown", options: shapeOptions } } },
        {
          name: "digit_overlap",
          selector: {
            number: {
              min: CLOCK_DIGIT_OVERLAP_MIN,
              max: CLOCK_DIGIT_OVERLAP_MAX,
              step: 1,
              mode: "slider",
            },
          },
        },
      );
    }
    if (style === "lockscreen") {
      out.push(
        {
          name: "outline_target",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "minutes", label: "minutes" },
                { value: "hours", label: "hours" },
                { value: "none", label: "none" },
              ],
            },
          },
        },
        { name: "show_decor", selector: { boolean: {} } },
        {
          name: "layout",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "stacked", label: "stacked" },
                { value: "inline", label: "inline" },
              ],
            },
          },
        },
      );
    }
    if (style === "scallop") {
      out.push({
        name: "tick_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "dots", label: "dots" },
              { value: "lines", label: "lines" },
              { value: "none", label: "none" },
            ],
          },
        },
      });
    }
    // Motion applies to every style that draws a lobed shape.
    out.push(
      { name: "shape_motion", selector: { boolean: {} } },
      {
        name: "shape_speed",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "slow", label: "slow" },
              { value: "normal", label: "normal" },
              { value: "fast", label: "fast" },
            ],
          },
        },
      },
    );
    return out;
  }

  private _tilesSchema(): SchemaEntry[] {
    return [
      {
        name: "tile_color_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "accent_hours", label: "accent hours" },
              { value: "both_accent", label: "both accent" },
              { value: "neutral", label: "neutral" },
            ],
          },
        },
      },
    ];
  }

  private _extrasSchema(): SchemaEntry[] {
    const out: SchemaEntry[] = [
      { name: "alarm_entity", selector: { entity: {} } },
      { name: "sun_entity", selector: { entity: { domain: "sun" } } },
      { name: "show_day_progress", selector: { boolean: {} } },
    ];
    if (this._config?.show_day_progress) {
      out.push({
        name: "progress_range",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "day", label: "day" },
              { value: "custom", label: "custom" },
            ],
          },
        },
      });
      if (this._config.progress_range === "custom") {
        out.push(
          { name: "progress_start", selector: { text: {} } },
          { name: "progress_end", selector: { text: {} } },
        );
      }
    }
    return out;
  }

  private _animationSchema(): SchemaEntry[] {
    return [
      {
        name: "animation",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: "auto" },
              { value: "on", label: "on" },
              { value: "off", label: "off" },
            ],
          },
        },
      },
    ];
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const map: Record<string, TranslationKey> = {
      style: "editor_clock_style",
      size: "editor_clock_size",
      time_zone: "editor_clock_time_zone",
      time_format: "editor_clock_time_format",
      show_date: "editor_clock_show_date",
      date_format: "editor_clock_date_format",
      show_seconds: "editor_clock_show_seconds",
      seconds_style: "editor_clock_seconds_style",
      show_seconds_tile: "editor_clock_show_seconds_tile",
      colon_blink: "editor_clock_colon_blink",
      ring_animation: "editor_clock_ring_animation",
      shape_hours: "editor_clock_shape_hours",
      shape_minutes: "editor_clock_shape_minutes",
      digit_overlap: "editor_clock_digit_overlap",
      shape_motion: "editor_clock_shape_motion",
      shape_speed: "editor_clock_shape_speed",
      show_decor: "editor_clock_show_decor",
      outline_target: "editor_clock_outline_target",
      tick_style: "editor_clock_tick_style",
      tile_color_mode: "editor_clock_tile_color_mode",
      alarm_entity: "editor_clock_alarm_entity",
      sun_entity: "editor_clock_sun_entity",
      show_day_progress: "editor_clock_show_day_progress",
      progress_range: "editor_clock_progress_range",
      progress_start: "editor_clock_progress_start",
      progress_end: "editor_clock_progress_end",
      animation: "editor_animations",
      layout: "editor_clock_style",
    };
    const key = map[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = { ...(ev.detail.value as Record<string, unknown>) };
    // An empty text field means "unset", not the empty string — otherwise an
    // emptied time zone would be stored and then fail to resolve every render.
    for (const key of ["time_zone", "progress_start", "progress_end"]) {
      if (patch[key] === "") delete patch[key];
    }
    this._emit({ ...this._config, ...patch } as M3ClockCardConfig);
  }

  private _colorChanged(field: "accent_color" | "secondary_color", value: string | undefined): void {
    if (!this._config) return;
    const next = { ...this._config };
    if (value) next[field] = value;
    else delete next[field];
    this._emit(next);
  }

  private _radiusPresetChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = radiusPresetPatch(ev.detail.value.radius_preset as string);
    this._appearance = { ...this._appearance, showCustomRadius: patch.showCustomRadius };
    if (patch.radius !== undefined) this._emit({ ...this._config, radius: patch.radius });
  }

  private _cornersToggleChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const showCorners = ev.detail.value.use_corners as boolean;
    this._appearance = { ...this._appearance, showCorners };
    if (!showCorners) {
      const { corners: _removed, ...rest } = this._config;
      this._emit(rest as M3ClockCardConfig);
    }
  }

  private _cornerPresetChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const patch = cornerPresetPatch(ev.detail.value[key] as string);
    this._appearance = {
      ...this._appearance,
      cornerCustom: { ...this._appearance.cornerCustom, [key]: patch.custom },
    };
    if (patch.px !== undefined) {
      this._emit({ ...this._config, corners: { ...(this._config.corners ?? {}), [key]: patch.px } });
    }
  }

  private _cornerValueChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const px = ev.detail.value[key] as number;
    this._emit({ ...this._config, corners: { ...(this._config.corners ?? {}), [key]: px } });
  }

  // ---- render --------------------------------------------------------------

  protected render() {
    if (!this.hass || !this._config) return nothing;
    const cfg = this._config;
    const style = this._style;
    const sections = SECTIONS[style];

    const panel = (
      header: TranslationKey,
      icon: string,
      data: Record<string, unknown>,
      schema: SchemaEntry[],
      expanded = false,
    ) =>
      schema.length
        ? html`<ha-expansion-panel outlined .header=${this._t(header)} ?expanded=${expanded}>
            <ha-icon slot="leading-icon" icon=${icon}></ha-icon>
            <div class="panel-content">
              <ha-form
                .hass=${this.hass}
                .data=${data}
                .schema=${schema}
                .computeLabel=${this._computeLabel}
                @value-changed=${this._valueChanged}
              ></ha-form>
            </div>
          </ha-expansion-panel>`
        : nothing;

    return html`
      <div class="editor">
        ${panel(
          "editor_clock_style_section",
          "mdi:palette-swatch-outline",
          { style, size: cfg.size ?? 1 },
          this._styleSchema(),
          true,
        )}
        ${panel(
          "editor_clock_time_section",
          "mdi:clock-outline",
          {
            time_zone: cfg.time_zone ?? "",
            time_format: cfg.time_format ?? "auto",
            show_date: cfg.show_date ?? true,
            date_format: cfg.date_format ?? "auto",
          },
          this._timeSchema(),
        )}
        ${panel(
          "editor_clock_seconds_section",
          "mdi:timer-outline",
          {
            show_seconds: cfg.show_seconds ?? true,
            seconds_style: cfg.seconds_style ?? "bar",
            show_seconds_tile: cfg.show_seconds_tile ?? false,
            colon_blink: cfg.colon_blink ?? true,
            ring_animation: cfg.ring_animation ?? "reset",
          },
          this._secondsSchema(),
        )}
        ${sections.shapes
          ? panel(
              "editor_clock_shapes_section",
              "mdi:shape-outline",
              {
                shape_hours: cfg.shape_hours ?? "cookie",
                shape_minutes: cfg.shape_minutes ?? "clover",
                digit_overlap: cfg.digit_overlap ?? CLOCK_DIGIT_OVERLAP,
                shape_motion: cfg.shape_motion ?? true,
                shape_speed: cfg.shape_speed ?? "normal",
                show_decor: cfg.show_decor ?? true,
                outline_target: cfg.outline_target ?? "minutes",
                tick_style: cfg.tick_style ?? "dots",
                layout: cfg.layout ?? "stacked",
              },
              this._shapeSchema(),
            )
          : nothing}
        ${sections.tiles
          ? panel(
              "editor_clock_tiles_section",
              "mdi:view-grid-outline",
              { tile_color_mode: cfg.tile_color_mode ?? "accent_hours" },
              this._tilesSchema(),
            )
          : nothing}
        ${panel(
          "editor_clock_extras_section",
          "mdi:plus-box-outline",
          {
            alarm_entity: cfg.alarm_entity,
            sun_entity: cfg.sun_entity,
            show_day_progress: cfg.show_day_progress ?? false,
            progress_range: cfg.progress_range ?? "day",
            progress_start: cfg.progress_start ?? "",
            progress_end: cfg.progress_end ?? "",
          },
          this._extrasSchema(),
        )}

        <ha-expansion-panel outlined .header=${this._t("editor_clock_colors_section")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(
              this._t("editor_clock_accent_color"),
              cfg.accent_color ?? DEFAULT_CLOCK_ACCENT,
              (v: string) => this._colorChanged("accent_color", v),
            )}
            ${colorRow(
              this._t("editor_clock_secondary_color"),
              cfg.secondary_color ?? DEFAULT_CLOCK_SECONDARY,
              (v: string) => this._colorChanged("secondary_color", v),
            )}
            <p class="hint">${this._t("editor_clock_zones_hint")}</p>
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: cfg,
          defaultRadius: DEFAULT_CLOCK_RADIUS,
          state: this._appearance,
          computeLabel: this._computeLabel,
          onValueChanged: this._valueChanged.bind(this),
          onRadiusPresetChanged: this._radiusPresetChanged.bind(this),
          onCornersToggleChanged: this._cornersToggleChanged.bind(this),
          onCornerPresetChanged: this._cornerPresetChanged.bind(this),
          onCornerValueChanged: this._cornerValueChanged.bind(this),
        })}
        ${panel(
          "editor_animations",
          "mdi:animation-outline",
          { animation: cfg.animation ?? "auto" },
          this._animationSchema(),
        )}
      </div>
    `;
  }

  static styles = editorStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-clock-card-editor": M3ClockCardEditor;
  }
}
