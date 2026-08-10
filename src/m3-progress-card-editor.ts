import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3ProgressCardConfig,
  ProgressStateColors,
} from "./types";
import {
  DEFAULT_PROGRESS_RADIUS,
  DEFAULT_RUNNING_STATES,
  DEFAULT_PREPARING_STATES,
  DEFAULT_DONE_STATES,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, type SchemaEntry } from "./shared/editor-helpers";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderRadiusCornerFields,
  type AppearanceState,
} from "./shared/appearance-editor";

@customElement("m3-progress-card-editor")
export class M3ProgressCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ProgressCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };

  public setConfig(config: M3ProgressCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_PROGRESS_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _entitiesSchema(): SchemaEntry[] {
    return [
      {
        name: "entity",
        required: true,
        selector: { entity: { domain: "sensor" } },
      },
      { name: "percentage_entity", selector: { entity: { domain: "sensor" } } },
      { name: "remaining_entity", selector: { entity: { domain: "sensor" } } },
    ];
  }

  private _contentSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "status_text_running", selector: { text: {} } },
      { name: "status_text_preparing", selector: { text: {} } },
      { name: "status_text_done", selector: { text: {} } },
      { name: "status_text_ready", selector: { text: {} } },
    ];
  }

  private _animationSchema(): SchemaEntry[] {
    const schema: SchemaEntry[] = [
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
    if (this._config?.animation === "off") {
      schema.push({
        name: "wave_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "wavy", label: this._t("editor_progress_wave_style_wavy") },
              { value: "flat", label: this._t("editor_progress_wave_style_flat") },
            ],
          },
        },
      });
    }
    return schema;
  }

  private _appearanceSchema(): SchemaEntry[] {
    return [
      { name: "glass_background", selector: { boolean: {} } },
      { name: "hide_when_ready", selector: { boolean: {} } },
    ];
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      entity: "editor_progress_status_entity",
      percentage_entity: "editor_progress_percentage_entity",
      remaining_entity: "editor_progress_remaining_entity",
      name: "editor_name",
      icon: "editor_icon",
      status_text_running: "editor_progress_status_text_running",
      status_text_preparing: "editor_progress_status_text_preparing",
      status_text_done: "editor_progress_status_text_done",
      status_text_ready: "editor_progress_status_text_ready",
      animation: "editor_progress_animation",
      wave_style: "editor_progress_wave_style",
      glass_background: "editor_glass_background",
      hide_when_ready: "editor_progress_hide_when_ready",
      radius: "editor_radius",
      radius_preset: "editor_radius_preset",
      use_corners: "editor_use_corners",
      top_left: "editor_corner_top_left",
      top_right: "editor_corner_top_right",
      bottom_right: "editor_corner_bottom_right",
      bottom_left: "editor_corner_bottom_left",
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _colorRow(
    label: string,
    value: string | undefined,
    onChange: (value: string) => void,
  ) {
    const hexValue = /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : "#888888";
    return html`
      <div class="color-row">
        <label class="color-label">${label}</label>
        <input
          type="text"
          class="color-text"
          .value=${value ?? ""}
          placeholder="z.B. red oder #6ba7dc"
          @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)}
        />
        <input
          type="color"
          class="swatch"
          .value=${hexValue}
          @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)}
        />
      </div>
    `;
  }

  private _listRow(
    label: string,
    values: string[],
    onChange: (values: string[]) => void,
  ) {
    return html`
      <div class="color-row">
        <label class="color-label">${label}</label>
        <input
          type="text"
          class="color-text list-input"
          .value=${values.join(", ")}
          @input=${(e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            const parsed = raw
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            onChange(parsed);
          }}
        />
      </div>
    `;
  }

  private _progressColorChanged(
    field:
      | "accent_color"
      | "track_color"
      | "dot_color"
      | "icon_color"
      | "icon_background"
      | "text_color"
      | "secondary_text_color"
      | "card_background",
    value: string,
  ): void {
    if (!this._config) return;
    if (value) {
      this._config = { ...this._config, [field]: value };
    } else {
      const { [field]: _removed, ...rest } = this._config;
      this._config = rest;
    }
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _stateColorChanged(
    key: keyof ProgressStateColors,
    value: string,
  ): void {
    if (!this._config) return;
    const state_colors = { ...(this._config.state_colors ?? {}) };
    if (value) state_colors[key] = value;
    else delete state_colors[key];
    this._config = { ...this._config, state_colors };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _statesChanged(
    field: "running_states" | "preparing_states" | "done_states",
    values: string[],
  ): void {
    if (!this._config) return;
    this._config = { ...this._config, [field]: values };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, ...ev.detail.value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _radiusPresetChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = radiusPresetPatch(ev.detail.value.radius_preset as string);
    this._appearance = { ...this._appearance, showCustomRadius: patch.showCustomRadius };
    if (patch.radius !== undefined) {
      this._config = { ...this._config, radius: patch.radius };
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornersToggleChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const showCorners = ev.detail.value.use_corners as boolean;
    this._appearance = { ...this._appearance, showCorners };
    if (!showCorners) {
      const { corners, ...rest } = this._config;
      this._config = rest;
      fireEvent(this, "config-changed", { config: this._config });
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
      this._config = { ...this._config, corners: { ...(this._config.corners ?? {}), [key]: patch.px } };
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornerValueChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const px = ev.detail.value[key] as number;
    this._config = { ...this._config, corners: { ...(this._config.corners ?? {}), [key]: px } };
    fireEvent(this, "config-changed", { config: this._config });
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const entitiesData = {
      entity: this._config.entity,
      percentage_entity: this._config.percentage_entity,
      remaining_entity: this._config.remaining_entity,
    };

    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      status_text_running: this._config.status_text_running,
      status_text_preparing: this._config.status_text_preparing,
      status_text_done: this._config.status_text_done,
      status_text_ready: this._config.status_text_ready,
    };

    const animationData = {
      animation: this._config.animation ?? "auto",
      wave_style: this._config.wave_style ?? "wavy",
    };

    const appearanceData = {
      glass_background: this._config.glass_background ?? true,
      hide_when_ready: this._config.hide_when_ready ?? false,
    };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_entities")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:database"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${entitiesData}
              .schema=${this._entitiesSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_content")}>
          <ha-icon slot="leading-icon" icon="mdi:text-short"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${contentData}
              .schema=${this._contentSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_progress_status_text_running_helper")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_state_mapping")}>
          <ha-icon slot="leading-icon" icon="mdi:state-machine"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_progress_state_mapping_helper")}</div>
            ${this._listRow(
              this._t("editor_progress_running_states"),
              this._config.running_states ?? DEFAULT_RUNNING_STATES,
              (v) => this._statesChanged("running_states", v),
            )}
            ${this._listRow(
              this._t("editor_progress_preparing_states"),
              this._config.preparing_states ?? DEFAULT_PREPARING_STATES,
              (v) => this._statesChanged("preparing_states", v),
            )}
            ${this._listRow(
              this._t("editor_progress_done_states"),
              this._config.done_states ?? DEFAULT_DONE_STATES,
              (v) => this._statesChanged("done_states", v),
            )}
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

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_progress_colors_helper")}</div>
            ${this._colorRow(
              this._t("editor_progress_accent_color"),
              this._config.accent_color,
              (v) => this._progressColorChanged("accent_color", v),
            )}
            ${this._colorRow(
              this._t("editor_progress_track_color"),
              this._config.track_color,
              (v) => this._progressColorChanged("track_color", v),
            )}
            ${this._colorRow(
              this._t("editor_progress_dot_color"),
              this._config.dot_color,
              (v) => this._progressColorChanged("dot_color", v),
            )}
            ${this._colorRow(
              this._t("editor_progress_icon_color"),
              this._config.icon_color,
              (v) => this._progressColorChanged("icon_color", v),
            )}
            ${this._colorRow(
              this._t("editor_progress_icon_background"),
              this._config.icon_background,
              (v) => this._progressColorChanged("icon_background", v),
            )}
            ${this._colorRow(
              this._t("editor_progress_text_color"),
              this._config.text_color,
              (v) => this._progressColorChanged("text_color", v),
            )}
            ${this._colorRow(
              this._t("editor_progress_secondary_text_color"),
              this._config.secondary_text_color,
              (v) => this._progressColorChanged("secondary_text_color", v),
            )}
            ${this._colorRow(
              this._t("editor_progress_card_background"),
              this._config.card_background,
              (v) => this._progressColorChanged("card_background", v),
            )}
            <div class="hint">${this._t("editor_progress_state_colors_helper")}</div>
            ${this._colorRow(
              this._t("editor_progress_state_running"),
              this._config.state_colors?.running,
              (v) => this._stateColorChanged("running", v),
            )}
            ${this._colorRow(
              this._t("editor_progress_state_preparing"),
              this._config.state_colors?.preparing,
              (v) => this._stateColorChanged("preparing", v),
            )}
            ${this._colorRow(
              this._t("editor_progress_state_done"),
              this._config.state_colors?.done,
              (v) => this._stateColorChanged("done", v),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_appearance")}>
          <ha-icon slot="leading-icon" icon="mdi:card-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${appearanceData}
              .schema=${this._appearanceSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_progress_hide_when_ready_helper")}</div>
            ${renderRadiusCornerFields({
              hass: this.hass,
              language: this._language,
              config: this._config,
              defaultRadius: DEFAULT_PROGRESS_RADIUS,
              state: this._appearance,
              computeLabel: this._computeLabel,
              onValueChanged: this._valueChanged.bind(this),
              onRadiusPresetChanged: this._radiusPresetChanged.bind(this),
              onCornersToggleChanged: this._cornersToggleChanged.bind(this),
              onCornerPresetChanged: this._cornerPresetChanged.bind(this),
              onCornerValueChanged: this._cornerValueChanged.bind(this),
            })}
          </div>
        </ha-expansion-panel>
      </div>
    `;
  }

  static styles = css`
    .editor {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    ha-expansion-panel {
      border-radius: 12px;
      --expansion-panel-summary-padding: 0 8px;
      --ha-card-border-radius: 12px;
    }

    .panel-content {
      padding: 12px 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    ha-form {
      display: block;
    }

    .hint {
      font-size: 12px;
      opacity: 0.6;
      color: var(--primary-text-color);
    }

    .color-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 8px;
    }

    .color-label {
      flex-basis: 100%;
      font-size: 13px;
      color: var(--secondary-text-color, var(--primary-text-color));
    }

    .color-text {
      flex: 1;
      min-width: 120px;
      height: 40px;
      box-sizing: border-box;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid rgba(127, 127, 127, 0.4);
      background: transparent;
      color: var(--primary-text-color);
      font-size: 14px;
      font-family: inherit;
    }

    .list-input {
      min-width: 100%;
    }

    .swatch {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 8px;
      padding: 0;
      background: none;
      cursor: pointer;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-progress-card-editor": M3ProgressCardEditor;
  }
}
