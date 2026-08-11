import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3ClimateOverviewCardConfig,
  ClimateOverviewRoomConfig,
} from "./types";
import {
  DEFAULT_CLIMATE_OVERVIEW_RADIUS,
  DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS,
  DEFAULT_CLIMATE_OVERVIEW_HUMIDITY_RANGE,
  DEFAULT_CLIMATE_OVERVIEW_NAME_STRIP,
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

type ClimateOverviewColorField =
  | "cold_color"
  | "cool_color"
  | "comfortable_color"
  | "warm_color"
  | "hot_color"
  | "humidity_warn_color"
  | "accent_color"
  | "text_color"
  | "secondary_text_color"
  | "card_background";

@customElement("m3-climate-overview-card-editor")
export class M3ClimateOverviewCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ClimateOverviewCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };

  public setConfig(config: M3ClimateOverviewCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_CLIMATE_OVERVIEW_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _roomsMetaSchema(): SchemaEntry[] {
    return [
      { name: "auto_discover", selector: { boolean: {} } },
      { name: "include_area", selector: { area: { multiple: true } } },
      { name: "exclude_entities", selector: { entity: { domain: "sensor", multiple: true } } },
    ];
  }

  private _roomSchema(): SchemaEntry[] {
    return [
      { name: "name", required: true, selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "temperature_entity", required: true, selector: { entity: { domain: "sensor", device_class: "temperature" } } },
      { name: "humidity_entity", selector: { entity: { domain: "sensor", device_class: "humidity" } } },
    ];
  }

  private _displaySchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      {
        name: "sort",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "area", label: this._t("editor_climate_overview_sort_area") },
              { value: "temp_desc", label: this._t("editor_climate_overview_sort_temp_desc") },
              { value: "temp_asc", label: this._t("editor_climate_overview_sort_temp_asc") },
              { value: "name", label: this._t("editor_climate_overview_sort_name") },
            ],
          },
        },
      },
      { name: "show_scale", selector: { boolean: {} } },
      { name: "show_outlier_chip", selector: { boolean: {} } },
      { name: "show_trend", selector: { boolean: {} } },
      { name: "show_mold_warning", selector: { boolean: {} } },
    ];
  }

  private _thresholdsSchema(): SchemaEntry[] {
    return [
      { name: "cold", selector: { number: { mode: "box", step: 0.5, unit_of_measurement: "°" } } },
      { name: "cool", selector: { number: { mode: "box", step: 0.5, unit_of_measurement: "°" } } },
      { name: "comfortable", selector: { number: { mode: "box", step: 0.5, unit_of_measurement: "°" } } },
      { name: "warm", selector: { number: { mode: "box", step: 0.5, unit_of_measurement: "°" } } },
    ];
  }

  private _humidityRangeSchema(): SchemaEntry[] {
    return [
      { name: "humidity_min", selector: { number: { min: 0, max: 100, mode: "box", unit_of_measurement: "%" } } },
      { name: "humidity_max", selector: { number: { min: 0, max: 100, mode: "box", unit_of_measurement: "%" } } },
    ];
  }

  private _scaleRangeSchema(): SchemaEntry[] {
    return [
      { name: "scale_min", selector: { number: { mode: "box", unit_of_measurement: "°" } } },
      { name: "scale_max", selector: { number: { mode: "box", unit_of_measurement: "°" } } },
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
      auto_discover: "editor_climate_overview_auto_discover",
      include_area: "editor_climate_overview_include_area",
      exclude_entities: "editor_climate_overview_exclude_entities",
      name: "editor_name",
      icon: "editor_icon",
      temperature_entity: "editor_climate_overview_room_temp_entity",
      humidity_entity: "editor_climate_overview_room_humidity_entity",
      sort: "editor_climate_overview_sort",
      show_scale: "editor_climate_overview_show_scale",
      show_outlier_chip: "editor_climate_overview_show_outlier_chip",
      show_trend: "editor_climate_overview_show_trend",
      show_mold_warning: "editor_climate_overview_show_mold_warning",
      cold: "editor_climate_overview_threshold_cold",
      cool: "editor_climate_overview_threshold_cool",
      comfortable: "editor_climate_overview_threshold_comfortable",
      warm: "editor_climate_overview_threshold_warm",
      humidity_min: "editor_climate_overview_humidity_min",
      humidity_max: "editor_climate_overview_humidity_max",
      scale_min: "editor_climate_overview_scale_min",
      scale_max: "editor_climate_overview_scale_max",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, ...ev.detail.value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _thresholdsChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, temp_thresholds: { ...ev.detail.value } };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _humidityRangeChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const v = ev.detail.value as { humidity_min: number; humidity_max: number };
    this._config = { ...this._config, humidity_range: [v.humidity_min, v.humidity_max] };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _scaleRangeChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const v = ev.detail.value as { scale_min?: number; scale_max?: number };
    const config = { ...this._config };
    if (v.scale_min === undefined || v.scale_min === null || Number.isNaN(v.scale_min)) {
      delete config.scale_min;
    } else {
      config.scale_min = v.scale_min;
    }
    if (v.scale_max === undefined || v.scale_max === null || Number.isNaN(v.scale_max)) {
      delete config.scale_max;
    } else {
      config.scale_max = v.scale_max;
    }
    this._config = config;
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _colorChanged(field: ClimateOverviewColorField, value: string): void {
    if (!this._config) return;
    if (value) {
      this._config = { ...this._config, [field]: value };
    } else {
      const { [field]: _removed, ...rest } = this._config;
      this._config = rest;
    }
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _nameStripChanged(values: string[]): void {
    if (!this._config) return;
    this._config = { ...this._config, name_strip: values };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _roomChanged(index: number, ev: CustomEvent): void {
    if (!this._config) return;
    const rooms = [...(this._config.rooms ?? [])];
    const value = ev.detail.value as ClimateOverviewRoomConfig;
    rooms[index] = {
      name: value.name ?? "",
      icon: value.icon || undefined,
      temperature_entity: value.temperature_entity ?? "",
      humidity_entity: value.humidity_entity || undefined,
    };
    this._config = { ...this._config, rooms };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _addRoom(): void {
    if (!this._config) return;
    const rooms = [...(this._config.rooms ?? []), { name: "", temperature_entity: "" }];
    this._config = { ...this._config, rooms };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _removeRoom(index: number): void {
    if (!this._config) return;
    const rooms = [...(this._config.rooms ?? [])];
    rooms.splice(index, 1);
    this._config = { ...this._config, rooms };
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

    const roomsMetaData = {
      auto_discover: this._config.auto_discover ?? true,
      include_area: this._config.include_area ?? [],
      exclude_entities: this._config.exclude_entities ?? [],
    };
    const rooms = this._config.rooms ?? [];

    const displayData = {
      name: this._config.name,
      icon: this._config.icon,
      sort: this._config.sort ?? "area",
      show_scale: this._config.show_scale ?? true,
      show_outlier_chip: this._config.show_outlier_chip ?? true,
      show_trend: this._config.show_trend ?? false,
      show_mold_warning: this._config.show_mold_warning ?? false,
    };

    const t = this._config.temp_thresholds ?? {};
    const thresholdsData = {
      cold: t.cold ?? DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS.cold,
      cool: t.cool ?? DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS.cool,
      comfortable: t.comfortable ?? DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS.comfortable,
      warm: t.warm ?? DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS.warm,
    };
    const [humidityMin, humidityMax] = this._config.humidity_range ?? DEFAULT_CLIMATE_OVERVIEW_HUMIDITY_RANGE;
    const humidityRangeData = { humidity_min: humidityMin, humidity_max: humidityMax };
    const scaleRangeData = { scale_min: this._config.scale_min, scale_max: this._config.scale_max };
    const animationData = { animation: this._config.animation ?? "auto" };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_entities")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:home-search-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${roomsMetaData}
              .schema=${this._roomsMetaSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_climate_overview_rooms_helper")}</div>
            ${rooms.map(
              (r, i) => html`
                <div class="override-row">
                  <ha-form
                    .hass=${this.hass}
                    .data=${{
                      name: r.name,
                      icon: r.icon ?? "",
                      temperature_entity: r.temperature_entity,
                      humidity_entity: r.humidity_entity ?? "",
                    }}
                    .schema=${this._roomSchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${(ev: CustomEvent) => this._roomChanged(i, ev)}
                  ></ha-form>
                  <button class="remove-btn" @click=${() => this._removeRoom(i)}>
                    <ha-icon icon="mdi:close"></ha-icon>
                  </button>
                </div>
              `,
            )}
            <button class="add-btn" @click=${() => this._addRoom()}>
              <ha-icon icon="mdi:plus"></ha-icon>
              ${this._t("editor_climate_overview_add_room")}
            </button>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_content")}>
          <ha-icon slot="leading-icon" icon="mdi:text-short"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${displayData}
              .schema=${this._displaySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            ${listRow(
              this._t("editor_climate_overview_name_strip"),
              this._config.name_strip ?? DEFAULT_CLIMATE_OVERVIEW_NAME_STRIP,
              (v) => this._nameStripChanged(v),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_battery_thresholds")}>
          <ha-icon slot="leading-icon" icon="mdi:thermometer-lines"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_climate_overview_thresholds_helper")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${thresholdsData}
              .schema=${this._thresholdsSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._thresholdsChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_climate_overview_humidity_range_helper")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${humidityRangeData}
              .schema=${this._humidityRangeSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._humidityRangeChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_climate_overview_scale_range_helper")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${scaleRangeData}
              .schema=${this._scaleRangeSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._scaleRangeChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_climate_overview_cold_color"), this._config.cold_color, (v) => this._colorChanged("cold_color", v))}
            ${colorRow(this._t("editor_climate_overview_cool_color"), this._config.cool_color, (v) => this._colorChanged("cool_color", v))}
            ${colorRow(this._t("editor_climate_overview_comfortable_color"), this._config.comfortable_color, (v) => this._colorChanged("comfortable_color", v))}
            ${colorRow(this._t("editor_climate_overview_warm_color"), this._config.warm_color, (v) => this._colorChanged("warm_color", v))}
            ${colorRow(this._t("editor_climate_overview_hot_color"), this._config.hot_color, (v) => this._colorChanged("hot_color", v))}
            ${colorRow(this._t("editor_climate_overview_humidity_warn_color"), this._config.humidity_warn_color, (v) => this._colorChanged("humidity_warn_color", v))}
            ${colorRow(this._t("editor_climate_overview_accent_color"), this._config.accent_color, (v) => this._colorChanged("accent_color", v))}
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
          defaultRadius: DEFAULT_CLIMATE_OVERVIEW_RADIUS,
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

  static styles = [
    editorStyles,
    css`
      .override-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      .override-row ha-form {
        flex: 1;
        min-width: 0;
      }

      .remove-btn {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 8px;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--primary-text-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .add-btn {
        width: 100%;
        height: 40px;
        border: none;
        border-radius: 8px;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--primary-text-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 14px;
        font-family: inherit;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-climate-overview-card-editor": M3ClimateOverviewCardEditor;
  }
}
