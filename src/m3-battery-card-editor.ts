import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3BatteryCardConfig, BatteryEntityConfig } from "./types";
import {
  DEFAULT_BATTERY_RADIUS,
  DEFAULT_BATTERY_THRESHOLD_CRITICAL,
  DEFAULT_BATTERY_THRESHOLD_LOW,
  DEFAULT_BATTERY_THRESHOLD_MEDIUM,
  DEFAULT_BATTERY_NAME_STRIP,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { discoverBatteryEntities } from "./shared/ha-registry";
import {
  fireEvent,
  colorRow,
  listRow,
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

@customElement("m3-battery-card-editor")
export class M3BatteryCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3BatteryCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };
  @state() private _discoveredCount?: number;

  public setConfig(config: M3BatteryCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_BATTERY_RADIUS);
    this._refreshDiscoveredCount();
  }

  private async _refreshDiscoveredCount(): Promise<void> {
    if (!this.hass || !this._config || !(this._config.auto_discover ?? true)) return;
    const ids = await discoverBatteryEntities(this.hass, {
      excludeEntities: this._config.exclude_entities,
      includeAreas: this._config.include_area,
      includeLabels: this._config.include_label,
    });
    this._discoveredCount = ids.length;
  }

  private async _convertToManualList(): Promise<void> {
    if (!this._config || !this.hass) return;
    const ids = await discoverBatteryEntities(this.hass, {
      excludeEntities: this._config.exclude_entities,
      includeAreas: this._config.include_area,
      includeLabels: this._config.include_label,
    });
    const existingByEntity = new Map((this._config.entities ?? []).map((e) => [e.entity, e]));
    const entities: BatteryEntityConfig[] = ids.map((id) => existingByEntity.get(id) ?? { entity: id });
    this._config = { ...this._config, auto_discover: false, entities };
    fireEvent(this, "config-changed", { config: this._config });
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
    if (this._config?.auto_discover ?? true) {
      schema.push(
        { name: "include_area", selector: { area: { multiple: true } } },
        { name: "include_label", selector: { label: { multiple: true } } },
        {
          name: "exclude_entities",
          selector: { entity: { domain: ["sensor", "binary_sensor"], device_class: "battery", multiple: true } },
        },
      );
    }
    return schema;
  }

  private _overrideSchema(): SchemaEntry[] {
    return [
      {
        name: "entity",
        required: true,
        selector: { entity: { domain: ["sensor", "binary_sensor"], device_class: "battery" } },
      },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
    ];
  }

  private _thresholdsSchema(): SchemaEntry[] {
    return [
      { name: "critical", selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
      { name: "low", selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
      { name: "medium", selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
    ];
  }

  private _contentSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "max_visible", selector: { number: { min: 0, step: 1, mode: "box" } } },
      { name: "show_healthy_toggle", selector: { boolean: {} } },
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
      auto_discover: "editor_battery_auto_discover",
      include_area: "editor_battery_include_area",
      include_label: "editor_battery_include_label",
      exclude_entities: "editor_battery_exclude_entities",
      entity: "editor_battery_override_entity",
      name: "editor_name",
      icon: "editor_icon",
      critical: "editor_battery_threshold_critical",
      low: "editor_battery_threshold_low",
      medium: "editor_battery_threshold_medium",
      max_visible: "editor_battery_max_visible",
      show_healthy_toggle: "editor_battery_show_healthy_toggle",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _colorChanged(
    field:
      | "critical_color"
      | "low_color"
      | "medium_color"
      | "ok_color"
      | "unavailable_color"
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

  private _nameStripChanged(values: string[]): void {
    if (!this._config) return;
    this._config = { ...this._config, name_strip: values };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, ...ev.detail.value };
    fireEvent(this, "config-changed", { config: this._config });
    this._refreshDiscoveredCount();
  }

  private _thresholdsChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, thresholds: { ...ev.detail.value } };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _overrideChanged(index: number, ev: CustomEvent): void {
    if (!this._config) return;
    const entities = [...(this._config.entities ?? [])];
    const value = ev.detail.value as BatteryEntityConfig;
    entities[index] = {
      entity: value.entity,
      ...(value.name ? { name: value.name } : {}),
      ...(value.icon ? { icon: value.icon } : {}),
    };
    this._config = { ...this._config, entities };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _removeOverride(index: number): void {
    if (!this._config) return;
    const entities = [...(this._config.entities ?? [])];
    entities.splice(index, 1);
    this._config = { ...this._config, entities };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _addOverride(): void {
    if (!this._config) return;
    const entities = [...(this._config.entities ?? []), { entity: "" }];
    this._config = { ...this._config, entities };
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

    const autoDiscover = this._config.auto_discover ?? true;
    const entitiesData = {
      auto_discover: autoDiscover,
      include_area: this._config.include_area ?? [],
      include_label: this._config.include_label ?? [],
      exclude_entities: this._config.exclude_entities ?? [],
    };
    const thresholdsData = {
      critical: this._config.thresholds?.critical ?? DEFAULT_BATTERY_THRESHOLD_CRITICAL,
      low: this._config.thresholds?.low ?? DEFAULT_BATTERY_THRESHOLD_LOW,
      medium: this._config.thresholds?.medium ?? DEFAULT_BATTERY_THRESHOLD_MEDIUM,
    };
    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      max_visible: this._config.max_visible ?? 3,
      show_healthy_toggle: this._config.show_healthy_toggle ?? true,
    };
    const animationData = { animation: this._config.animation ?? "auto" };
    const overrides = this._config.entities ?? [];

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
            ${autoDiscover
              ? html`
                  <div class="hint">${this._t("editor_battery_auto_discover_helper")}</div>
                  <button class="add-btn" @click=${() => this._convertToManualList()}>
                    <ha-icon icon="mdi:format-list-checks"></ha-icon>
                    ${this._t("editor_battery_convert_to_manual")}
                  </button>
                  <div class="hint">
                    ${this._t("editor_battery_convert_to_manual_helper").replace(
                      "{n}",
                      this._discoveredCount === undefined ? "…" : String(this._discoveredCount),
                    )}
                  </div>
                `
              : nothing}

            <div class="hint">${this._t("editor_battery_overrides_helper")}</div>
            ${overrides.map(
              (o, i) => html`
                <div class="override-row">
                  <ha-form
                    .hass=${this.hass}
                    .data=${{ entity: o.entity, name: o.name ?? "", icon: o.icon ?? "" }}
                    .schema=${this._overrideSchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${(ev: CustomEvent) => this._overrideChanged(i, ev)}
                  ></ha-form>
                  <button class="remove-btn" @click=${() => this._removeOverride(i)}>
                    <ha-icon icon="mdi:close"></ha-icon>
                  </button>
                </div>
              `,
            )}
            <button class="add-btn" @click=${() => this._addOverride()}>
              <ha-icon icon="mdi:plus"></ha-icon>
              ${this._t("editor_battery_add_override")}
            </button>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_battery_thresholds")}>
          <ha-icon slot="leading-icon" icon="mdi:battery-alert-variant-outline"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_battery_thresholds_helper")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${thresholdsData}
              .schema=${this._thresholdsSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._thresholdsChanged}
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
            ${listRow(
              this._t("editor_battery_name_strip"),
              this._config.name_strip ?? DEFAULT_BATTERY_NAME_STRIP,
              (v) => this._nameStripChanged(v),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_battery_critical_color"), this._config.critical_color, (v) => this._colorChanged("critical_color", v))}
            ${colorRow(this._t("editor_battery_low_color"), this._config.low_color, (v) => this._colorChanged("low_color", v))}
            ${colorRow(this._t("editor_battery_medium_color"), this._config.medium_color, (v) => this._colorChanged("medium_color", v))}
            ${colorRow(this._t("editor_battery_ok_color"), this._config.ok_color, (v) => this._colorChanged("ok_color", v))}
            ${colorRow(this._t("editor_battery_unavailable_color"), this._config.unavailable_color, (v) => this._colorChanged("unavailable_color", v))}
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
          defaultRadius: DEFAULT_BATTERY_RADIUS,
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
    "m3-battery-card-editor": M3BatteryCardEditor;
  }
}
