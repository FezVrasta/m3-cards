import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3ClimateCardConfig,
  ModeColorOverrides,
} from "./types";
import {
  DEFAULT_MODE_COLORS,
  DEFAULT_BATTERY_THRESHOLD,
  DEFAULT_CLIMATE_RADIUS,
  CLIMATE_RADIUS_PRESETS,
} from "./const";
import { localize, type TranslationKey } from "./localize";

const MODE_KEYS: (keyof ModeColorOverrides)[] = [
  "off",
  "heat",
  "cool",
  "dry",
  "auto",
  "fan_only",
  "heat_cool",
];

const CORNER_KEYS = [
  "top_left",
  "top_right",
  "bottom_right",
  "bottom_left",
] as const;

interface SchemaEntry {
  name: string;
  selector: Record<string, unknown>;
  required?: boolean;
  default?: unknown;
}

function fireEvent(node: HTMLElement, type: string, detail: unknown): void {
  const event = new CustomEvent(type, {
    detail,
    bubbles: true,
    composed: true,
  });
  node.dispatchEvent(event);
}

@customElement("m3-climate-card-editor")
export class M3ClimateCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ClimateCardConfig;
  @state() private _showCustomRadius = false;
  @state() private _showCorners = false;
  @state() private _cornerCustom: Record<string, boolean> = {};

  public setConfig(config: M3ClimateCardConfig): void {
    this._config = config;
    this._showCustomRadius = this._radiusPreset(config.radius) === "custom";
    this._showCorners = !!config.corners;
    const cornerCustom: Record<string, boolean> = {};
    for (const key of CORNER_KEYS) {
      cornerCustom[key] =
        this._radiusPreset(config.corners?.[key]) === "custom";
    }
    this._cornerCustom = cornerCustom;
  }

  private _radiusPreset(radius?: number): string {
    const current = radius ?? DEFAULT_CLIMATE_RADIUS;
    const match = Object.entries(CLIMATE_RADIUS_PRESETS).find(
      ([, px]) => px === current,
    );
    return match ? match[0] : "custom";
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _entitySchema(): SchemaEntry[] {
    return [
      {
        name: "entity",
        required: true,
        selector: { entity: { domain: "climate" } },
      },
    ];
  }

  private _contentSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "show_presets", selector: { boolean: {} } },
      {
        name: "preset_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "chip", label: this._t("editor_preset_style_chip") },
              { value: "pill", label: this._t("editor_preset_style_pill") },
            ],
          },
        },
      },
      { name: "show_sensors", selector: { boolean: {} } },
      {
        name: "hidden_modes",
        selector: {
          select: {
            mode: "list",
            multiple: true,
            options: this._availableHvacModes().map((mode) => ({
              value: mode,
              label: this._t(mode as TranslationKey),
            })),
          },
        },
      },
    ];
  }

  private _availableHvacModes(): string[] {
    const entity = this._config?.entity
      ? this.hass?.states[this._config.entity]
      : undefined;
    const modes: string[] = Array.isArray(entity?.attributes.hvac_modes)
      ? entity!.attributes.hvac_modes
      : [];
    return modes.filter((m) => m !== "off");
  }

  private _sensorsSchema(): SchemaEntry[] {
    return [
      {
        name: "temperature_sensor",
        selector: { entity: { domain: "sensor", device_class: "temperature" } },
      },
      {
        name: "humidity_sensor",
        selector: { entity: { domain: "sensor", device_class: "humidity" } },
      },
      {
        name: "window_sensor",
        selector: { entity: { domain: "binary_sensor" } },
      },
      {
        name: "battery_sensor",
        selector: { entity: { domain: "sensor", device_class: "battery" } },
      },
      {
        name: "battery_threshold",
        selector: {
          number: { mode: "box", min: 0, max: 100, step: 1, unit_of_measurement: "%" },
        },
      },
      {
        name: "temperature_chip_placement",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              {
                value: "info_row",
                label: this._t("editor_temp_placement_info_row"),
              },
              {
                value: "header",
                label: this._t("editor_temp_placement_header"),
              },
            ],
          },
        },
      },
    ];
  }

  private _appearanceSchema(): SchemaEntry[] {
    return [
      { name: "glass_background", selector: { boolean: {} } },
      { name: "animations", selector: { boolean: {} } },
      {
        name: "unavailable_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              {
                value: "dimmed",
                label: this._t("editor_unavailable_style_dimmed"),
              },
              {
                value: "normal",
                label: this._t("editor_unavailable_style_normal"),
              },
              {
                value: "hidden",
                label: this._t("editor_unavailable_style_hidden"),
              },
            ],
          },
        },
      },
      {
        name: "height",
        selector: {
          number: { mode: "box", min: 0, step: 1, unit_of_measurement: "px" },
        },
      },
    ];
  }

  private _radiusPresetSchema(): SchemaEntry[] {
    return [
      {
        name: "radius_preset",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "eckig", label: this._t("editor_radius_square") },
              { value: "leicht_rund", label: this._t("editor_radius_soft") },
              { value: "rund", label: this._t("editor_radius_round") },
              { value: "custom", label: this._t("editor_radius_custom") },
            ],
          },
        },
      },
    ];
  }

  private _radiusValueSchema(): SchemaEntry[] {
    return [
      {
        name: "radius",
        selector: {
          number: { mode: "box", min: 0, step: 1, unit_of_measurement: "px" },
        },
      },
    ];
  }

  private _cornersToggleSchema(): SchemaEntry[] {
    return [{ name: "use_corners", selector: { boolean: {} } }];
  }

  private _cornerPresetSchema(key: string): SchemaEntry[] {
    return [
      {
        name: key,
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "eckig", label: this._t("editor_radius_square") },
              { value: "leicht_rund", label: this._t("editor_radius_soft") },
              { value: "rund", label: this._t("editor_radius_round") },
              { value: "custom", label: this._t("editor_radius_custom") },
            ],
          },
        },
      },
    ];
  }

  private _cornerValueSchema(key: string): SchemaEntry[] {
    return [
      {
        name: key,
        selector: {
          number: { mode: "box", min: 0, step: 1, unit_of_measurement: "px" },
        },
      },
    ];
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      entity: "editor_entity",
      name: "editor_name",
      icon: "editor_icon",
      show_presets: "editor_show_presets",
      show_sensors: "editor_show_sensors",
      temperature_sensor: "editor_temperature_sensor",
      humidity_sensor: "editor_humidity_sensor",
      window_sensor: "editor_window_sensor",
      battery_sensor: "editor_battery_sensor",
      battery_threshold: "editor_battery_threshold",
      glass_background: "editor_glass_background",
      preset_style: "editor_preset_style",
      hidden_modes: "editor_hidden_modes",
      temperature_chip_placement: "editor_temperature_chip_placement",
      height: "editor_height",
      radius: "editor_radius",
      radius_preset: "editor_radius_preset",
      animations: "editor_animations",
      unavailable_style: "editor_unavailable_style",
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

  private _modeColorChanged(mode: keyof ModeColorOverrides, value: string): void {
    if (!this._config) return;
    const mode_colors = { ...(this._config.mode_colors ?? {}) };
    if (value) mode_colors[mode] = value;
    else delete mode_colors[mode];
    this._config = { ...this._config, mode_colors };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _elementColorChanged(
    field:
      | "icon_active_color"
      | "icon_inactive_color"
      | "plus_active_color"
      | "plus_inactive_color"
      | "minus_active_color"
      | "minus_inactive_color",
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

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const newConfig = { ...this._config, ...ev.detail.value };
    this._config = newConfig;
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _radiusPresetChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const preset = ev.detail.value.radius_preset as string;
    this._showCustomRadius = preset === "custom";
    if (preset !== "custom") {
      this._config = { ...this._config, radius: CLIMATE_RADIUS_PRESETS[preset] };
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornersToggleChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._showCorners = ev.detail.value.use_corners as boolean;
    if (!this._showCorners) {
      const { corners, ...rest } = this._config;
      this._config = rest;
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornerPresetChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const preset = ev.detail.value[key] as string;
    this._cornerCustom = { ...this._cornerCustom, [key]: preset === "custom" };
    if (preset !== "custom") {
      const px = CLIMATE_RADIUS_PRESETS[preset];
      if (px === undefined) return;
      this._config = {
        ...this._config,
        corners: { ...(this._config.corners ?? {}), [key]: px },
      };
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornerValueChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const px = ev.detail.value[key] as number;
    this._config = {
      ...this._config,
      corners: { ...(this._config.corners ?? {}), [key]: px },
    };
    fireEvent(this, "config-changed", { config: this._config });
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      show_presets: this._config.show_presets ?? true,
      preset_style: this._config.preset_style ?? "chip",
      show_sensors: this._config.show_sensors ?? true,
      hidden_modes: this._config.hidden_modes ?? [],
    };

    const sensorsData = {
      temperature_sensor: this._config.temperature_sensor,
      humidity_sensor: this._config.humidity_sensor,
      window_sensor: this._config.window_sensor,
      battery_sensor: this._config.battery_sensor,
      battery_threshold:
        this._config.battery_threshold ?? DEFAULT_BATTERY_THRESHOLD,
      temperature_chip_placement:
        this._config.temperature_chip_placement ?? "info_row",
    };

    const appearanceData = {
      glass_background: this._config.glass_background ?? true,
      animations: this._config.animations ?? true,
      unavailable_style: this._config.unavailable_style ?? "dimmed",
      height: this._config.height,
    };

    const radiusPresetData = {
      radius_preset: this._radiusPreset(this._config.radius),
    };

    const radiusValueData = {
      radius: this._config.radius ?? DEFAULT_CLIMATE_RADIUS,
    };

    const baseRadius = this._config.radius ?? DEFAULT_CLIMATE_RADIUS;
    const cornersToggleData = { use_corners: this._showCorners };

    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${{ entity: this._config.entity }}
          .schema=${this._entitySchema()}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._valueChanged}
        ></ha-form>

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
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_sensors")}>
          <ha-icon slot="leading-icon" icon="mdi:thermometer"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${sensorsData}
              .schema=${this._sensorsSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_appearance")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${appearanceData}
              .schema=${this._appearanceSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <ha-form
              .hass=${this.hass}
              .data=${radiusPresetData}
              .schema=${this._radiusPresetSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._radiusPresetChanged}
            ></ha-form>
            ${this._showCustomRadius
              ? html`
                  <ha-form
                    .hass=${this.hass}
                    .data=${radiusValueData}
                    .schema=${this._radiusValueSchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${this._valueChanged}
                  ></ha-form>
                `
              : nothing}
            <ha-form
              .hass=${this.hass}
              .data=${cornersToggleData}
              .schema=${this._cornersToggleSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._cornersToggleChanged}
            ></ha-form>
            ${this._showCorners
              ? CORNER_KEYS.map((key) => {
                  const currentPx = this._config?.corners?.[key] ?? baseRadius;
                  const presetVal = this._cornerCustom[key]
                    ? "custom"
                    : this._radiusPreset(currentPx);
                  return html`
                    <ha-form
                      .hass=${this.hass}
                      .data=${{ [key]: presetVal }}
                      .schema=${this._cornerPresetSchema(key)}
                      .computeLabel=${this._computeLabel}
                      @value-changed=${(ev: CustomEvent) =>
                        this._cornerPresetChanged(key, ev)}
                    ></ha-form>
                    ${this._cornerCustom[key]
                      ? html`
                          <ha-form
                            .hass=${this.hass}
                            .data=${{ [key]: currentPx }}
                            .schema=${this._cornerValueSchema(key)}
                            .computeLabel=${this._computeLabel}
                            @value-changed=${(ev: CustomEvent) =>
                              this._cornerValueChanged(key, ev)}
                          ></ha-form>
                        `
                      : nothing}
                  `;
                })
              : nothing}
            <div class="hint">${this._t("editor_element_colors_helper")}</div>
            ${this._colorRow(
              this._t("editor_icon_active_color"),
              this._config?.icon_active_color,
              (v) => this._elementColorChanged("icon_active_color", v),
            )}
            ${this._colorRow(
              this._t("editor_icon_inactive_color"),
              this._config?.icon_inactive_color,
              (v) => this._elementColorChanged("icon_inactive_color", v),
            )}
            ${this._colorRow(
              this._t("editor_plus_active_color"),
              this._config?.plus_active_color,
              (v) => this._elementColorChanged("plus_active_color", v),
            )}
            ${this._colorRow(
              this._t("editor_plus_inactive_color"),
              this._config?.plus_inactive_color,
              (v) => this._elementColorChanged("plus_inactive_color", v),
            )}
            ${this._colorRow(
              this._t("editor_minus_active_color"),
              this._config?.minus_active_color,
              (v) => this._elementColorChanged("minus_active_color", v),
            )}
            ${this._colorRow(
              this._t("editor_minus_inactive_color"),
              this._config?.minus_inactive_color,
              (v) => this._elementColorChanged("minus_inactive_color", v),
            )}
            <div class="hint">${this._t("editor_color_helper")}</div>
            ${MODE_KEYS.map((mode) =>
              this._colorRow(
                `${this._t(mode as TranslationKey)} – ${this._t("editor_mode_color")}`,
                this._config?.mode_colors?.[mode] ?? DEFAULT_MODE_COLORS[mode],
                (v) => this._modeColorChanged(mode, v),
              ),
            )}
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
    "m3-climate-card-editor": M3ClimateCardEditor;
  }
}
