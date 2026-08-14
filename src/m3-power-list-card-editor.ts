import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3PowerListCardConfig } from "./types";
import { DEFAULT_POWER_LIST_RADIUS, DEFAULT_POWER_LIST_THRESHOLD } from "./const";
import { localize, type TranslationKey } from "./localize";
import {
  fireEvent,
  colorRow,
  editorStyles,
  type SchemaEntry,
} from "./shared/editor-helpers";
import { radiusLabelMap } from "./shared/radius-editor";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

@customElement("m3-power-list-card-editor")
export class M3PowerListCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3PowerListCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };

  public setConfig(config: M3PowerListCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_POWER_LIST_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _entitiesSchema(): SchemaEntry[] {
    const schema: SchemaEntry[] = [
      { name: "auto_discover", selector: { boolean: {} } },
    ];
    if (this._config?.auto_discover) {
      schema.push(
        { name: "include_area", selector: { area: { multiple: true } } },
        { name: "include_label", selector: { label: { multiple: true } } },
        {
          name: "exclude_entities",
          selector: { entity: { domain: "sensor", device_class: "power", multiple: true } },
        },
      );
    } else {
      schema.push({
        name: "entities_flat",
        selector: { entity: { domain: "sensor", device_class: "power", multiple: true } },
      });
    }
    return schema;
  }

  private _contentSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "subtitle", selector: { text: {} } },
      {
        name: "threshold",
        selector: { number: { min: 0, step: 0.1, mode: "box", unit_of_measurement: "W" } },
      },
      {
        name: "sort",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "power_desc", label: this._t("editor_power_list_sort_power_desc") },
              { value: "power_asc", label: this._t("editor_power_list_sort_power_asc") },
              { value: "name", label: this._t("editor_power_list_sort_name") },
              { value: "config", label: this._t("editor_power_list_sort_config") },
            ],
          },
        },
      },
      { name: "max_visible", selector: { number: { min: 0, step: 1, mode: "box" } } },
      { name: "show_idle_toggle", selector: { boolean: {} } },
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
      auto_discover: "editor_power_list_auto_discover",
      include_area: "editor_power_list_include_area",
      include_label: "editor_power_list_include_label",
      exclude_entities: "editor_power_list_exclude_entities",
      entities_flat: "editor_power_list_entities",
      name: "editor_name",
      icon: "editor_icon",
      subtitle: "editor_power_list_subtitle",
      threshold: "editor_power_list_threshold",
      sort: "editor_power_list_sort",
      max_visible: "editor_power_list_max_visible",
      show_idle_toggle: "editor_power_list_show_idle_toggle",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _colorChanged(
    field: "accent_color" | "producer_color" | "bar_tint_color" | "text_color" | "secondary_text_color" | "card_background",
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

  private _opacityChanged(field: "accent_opacity" | "producer_opacity", value: number): void {
    if (!this._config) return;
    this._config = { ...this._config, [field]: value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const value = ev.detail.value;
    if ("entities_flat" in value) {
      const flat = value.entities_flat as string[];
      const existingByEntity = new Map((this._config.entities ?? []).map((e) => [e.entity, e]));
      const entities = flat.map((entity) => existingByEntity.get(entity) ?? { entity });
      const { entities_flat: _ef, ...rest } = value;
      this._config = { ...this._config, ...rest, entities };
    } else {
      this._config = { ...this._config, ...value };
    }
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
      this._config = {
        ...this._config,
        corners: { ...(this._config.corners ?? {}), [key]: patch.px },
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

    const entitiesData = {
      auto_discover: this._config.auto_discover ?? false,
      include_area: this._config.include_area ?? [],
      include_label: this._config.include_label ?? [],
      exclude_entities: this._config.exclude_entities ?? [],
      entities_flat: (this._config.entities ?? []).map((e) => e.entity),
    };
    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      subtitle: this._config.subtitle,
      threshold: this._config.threshold ?? DEFAULT_POWER_LIST_THRESHOLD,
      sort: this._config.sort ?? "power_desc",
      max_visible: this._config.max_visible ?? 3,
      show_idle_toggle: this._config.show_idle_toggle ?? true,
    };
    const animationData = { animation: this._config.animation ?? "auto" };

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
            <div class="hint">${this._t("editor_power_list_entities_helper")}</div>
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
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(
              this._t("editor_power_list_accent_color"),
              this._config.accent_color,
              (v) => this._colorChanged("accent_color", v),
              {
                label: this._t("editor_opacity"),
                value: this._config.accent_opacity,
                defaultValue: 18,
                onChange: (v) => this._opacityChanged("accent_opacity", v),
              },
            )}
            ${colorRow(
              this._t("editor_power_list_producer_color"),
              this._config.producer_color,
              (v) => this._colorChanged("producer_color", v),
              {
                label: this._t("editor_opacity"),
                value: this._config.producer_opacity,
                defaultValue: 24,
                onChange: (v) => this._opacityChanged("producer_opacity", v),
              },
            )}
            ${colorRow(
              this._t("editor_power_list_bar_tint_color"),
              this._config.bar_tint_color,
              (v) => this._colorChanged("bar_tint_color", v),
            )}
            ${colorRow(
              this._t("editor_progress_text_color"),
              this._config.text_color,
              (v) => this._colorChanged("text_color", v),
            )}
            ${colorRow(
              this._t("editor_progress_secondary_text_color"),
              this._config.secondary_text_color,
              (v) => this._colorChanged("secondary_text_color", v),
            )}
            ${colorRow(
              this._t("editor_progress_card_background"),
              this._config.card_background,
              (v) => this._colorChanged("card_background", v),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_animation")}>
          <ha-icon slot="leading-icon" icon="mdi:power-socket-de"></ha-icon>
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
          defaultRadius: DEFAULT_POWER_LIST_RADIUS,
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
    "m3-power-list-card-editor": M3PowerListCardEditor;
  }
}
