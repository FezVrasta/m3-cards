import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3TimeCardConfig } from "./types";
import {
  DEFAULT_TIME_RADIUS,
  DEFAULT_TIME_MINUTE_STEP,
  DEFAULT_TIME_MINUTE_STEP_COMPACT,
  TIME_MINUTE_STEPS,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, colorRow, listRow, editorStyles, type SchemaEntry } from "./shared/editor-helpers";
import { radiusLabelMap } from "./shared/radius-editor";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

@customElement("m3-time-card-editor")
export class M3TimeCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3TimeCardConfig;
  @state() private _appearance: AppearanceState = {
    showCustomRadius: false,
    showCorners: false,
    cornerCustom: {},
  };

  public setConfig(config: M3TimeCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_TIME_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _emit(config: M3TimeCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private _entitySchema(): SchemaEntry[] {
    return [
      { name: "entity", required: true, selector: { entity: { domain: "input_datetime" } } },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
    ];
  }

  private _operationSchema(): SchemaEntry[] {
    return [
      {
        name: "style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "stepper", label: this._t("editor_time_style_stepper") },
              { value: "compact", label: this._t("editor_time_style_compact") },
              { value: "wheel", label: this._t("editor_time_style_wheel") },
            ],
          },
        },
      },
      {
        name: "minute_step",
        selector: {
          select: {
            mode: "dropdown",
            options: TIME_MINUTE_STEPS.map((n) => ({ value: String(n), label: String(n) })),
          },
        },
      },
      {
        name: "apply_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "button", label: this._t("editor_time_apply_button") },
              { value: "instant", label: this._t("editor_time_apply_instant") },
            ],
          },
        },
      },
      {
        name: "apply_visibility",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "always", label: this._t("editor_time_apply_always") },
              { value: "when_changed", label: this._t("editor_time_apply_when_changed") },
            ],
          },
        },
      },
      { name: "show_revert", selector: { boolean: {} } },
    ];
  }

  private _displaySchema(): SchemaEntry[] {
    return [
      { name: "subtitle", selector: { text: {} } },
      { name: "show_date", selector: { boolean: {} } },
      { name: "keep_seconds", selector: { boolean: {} } },
    ];
  }

  private _animationSchema(): SchemaEntry[] {
    return [
      {
        name: "animation",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: this._t("editor_progress_animation_auto") },
              { value: "on", label: this._t("editor_progress_animation_on") },
              { value: "off", label: this._t("editor_progress_animation_off") },
            ],
          },
        },
      },
    ];
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      entity: "editor_entity",
      name: "editor_name",
      icon: "editor_icon",
      style: "editor_time_style",
      minute_step: "editor_time_minute_step",
      apply_mode: "editor_time_apply_mode",
      apply_visibility: "editor_time_apply_visibility",
      show_revert: "editor_time_show_revert",
      subtitle: "editor_time_subtitle",
      show_date: "editor_time_show_date",
      keep_seconds: "editor_time_keep_seconds",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = { ...(ev.detail.value as Record<string, unknown>) };
    // The step selector carries strings so the dropdown can render them;
    // the config keeps a number.
    if (typeof patch.minute_step === "string") patch.minute_step = Number(patch.minute_step);
    this._emit({ ...this._config, ...patch } as M3TimeCardConfig);
  }

  private _colorChanged(
    field: "accent_color" | "text_color" | "secondary_text_color" | "card_background",
    value: string,
  ): void {
    if (!this._config) return;
    if (value) {
      this._emit({ ...this._config, [field]: value });
    } else {
      const { [field]: _removed, ...rest } = this._config;
      this._emit(rest as M3TimeCardConfig);
    }
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
      this._emit(rest as M3TimeCardConfig);
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

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const entityData = {
      entity: this._config.entity,
      name: this._config.name,
      icon: this._config.icon,
    };
    const operationData = {
      style: this._config.style ?? "stepper",
      minute_step: String(
        this._config.minute_step ??
          (this._config.style === "compact"
            ? DEFAULT_TIME_MINUTE_STEP_COMPACT
            : DEFAULT_TIME_MINUTE_STEP),
      ),
      apply_mode: this._config.apply_mode ?? "button",
      apply_visibility:
        this._config.apply_visibility ??
        (this._config.style === "compact" ? "when_changed" : "always"),
      show_revert: this._config.show_revert ?? true,
    };
    const displayData = {
      subtitle: this._config.subtitle,
      show_date: this._config.show_date ?? false,
      keep_seconds: this._config.keep_seconds ?? true,
    };
    const animationData = { animation: this._config.animation ?? "auto" };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_entity")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:clock-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${entityData}
              .schema=${this._entitySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_time_operation")}>
          <ha-icon slot="leading-icon" icon="mdi:gesture-tap-button"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${operationData}
              .schema=${this._operationSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            ${listRow(this._t("editor_time_presets"), this._config.presets ?? [], (v) =>
              this._emit({ ...this._config!, presets: v }),
            )}
            <div class="hint">${this._t("editor_time_presets_hint")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_supply_display")}>
          <ha-icon slot="leading-icon" icon="mdi:view-dashboard-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${displayData}
              .schema=${this._displaySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_time_accent_color"), this._config.accent_color, (v) => this._colorChanged("accent_color", v))}
            ${colorRow(this._t("editor_progress_text_color"), this._config.text_color, (v) => this._colorChanged("text_color", v))}
            ${colorRow(this._t("editor_progress_secondary_text_color"), this._config.secondary_text_color, (v) => this._colorChanged("secondary_text_color", v))}
            ${colorRow(this._t("editor_progress_card_background"), this._config.card_background, (v) => this._colorChanged("card_background", v))}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_animation")}>
          <ha-icon slot="leading-icon" icon="mdi:wave"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${animationData}
              .schema=${this._animationSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_progress_animation_reduced_motion_hint")}</div>
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: this._config,
          defaultRadius: DEFAULT_TIME_RADIUS,
          state: this._appearance,
          computeLabel: this._computeLabel,
          onValueChanged: this._valueChanged.bind(this),
          onRadiusPresetChanged: this._radiusPresetChanged.bind(this),
          onCornersToggleChanged: this._cornersToggleChanged.bind(this),
          onCornerPresetChanged: this._cornerPresetChanged.bind(this),
          onCornerValueChanged: this._cornerValueChanged.bind(this),
        })}
      </div>
    `;
  }

  static styles = editorStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-time-card-editor": M3TimeCardEditor;
  }
}
