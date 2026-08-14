import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3TopConsumersCardConfig } from "./types";
import { DEFAULT_TOP_CONSUMERS_RADIUS, DEFAULT_TOP_CONSUMERS_COUNT, TOP_CONSUMERS_MIN_COUNT, TOP_CONSUMERS_MAX_COUNT } from "./const";
import { localize, type TranslationKey } from "./localize";
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

@customElement("m3-top-consumers-card-editor")
export class M3TopConsumersCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3TopConsumersCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };

  public setConfig(config: M3TopConsumersCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_TOP_CONSUMERS_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _sourceSchema(): SchemaEntry[] {
    const schema: SchemaEntry[] = [
      {
        name: "source",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "energy", label: this._t("editor_top_consumers_source_energy") },
              { value: "entities", label: this._t("editor_top_consumers_source_entities") },
            ],
          },
        },
      },
    ];
    if (this._config?.source === "entities") {
      schema.push({
        name: "entities_flat",
        selector: { entity: { domain: "sensor", device_class: "energy", multiple: true } },
      });
    }
    schema.push({
      name: "period",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "today", label: this._t("editor_top_consumers_period_today") },
            { value: "yesterday", label: this._t("editor_top_consumers_period_yesterday") },
            { value: "week", label: this._t("editor_top_consumers_period_week") },
            { value: "month", label: this._t("editor_top_consumers_period_month") },
          ],
        },
      },
    });
    return schema;
  }

  private _contentSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "subtitle", selector: { text: {} } },
      {
        name: "unit_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "energy", label: this._t("editor_top_consumers_unit_mode_energy") },
              { value: "cost", label: this._t("editor_top_consumers_unit_mode_cost") },
            ],
          },
        },
      },
      { name: "top_count", selector: { number: { min: TOP_CONSUMERS_MIN_COUNT, max: TOP_CONSUMERS_MAX_COUNT, mode: "slider", step: 1 } } },
      {
        name: "rest_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "collapse", label: this._t("editor_top_consumers_rest_collapse") },
              { value: "hide", label: this._t("editor_top_consumers_rest_hide") },
              { value: "show_all", label: this._t("editor_top_consumers_rest_show_all") },
            ],
          },
        },
      },
    ];
  }

  private _priceSchema(): SchemaEntry[] {
    const schema: SchemaEntry[] = [
      {
        name: "price_source",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "energy_dashboard", label: this._t("editor_cost_price_source_energy_dashboard") },
              { value: "input_number", label: this._t("editor_cost_price_source_input_number") },
              { value: "fixed", label: this._t("editor_cost_price_source_fixed") },
            ],
          },
        },
      },
    ];
    const source = this._config?.price_source ?? "energy_dashboard";
    if (source === "input_number") {
      schema.push({ name: "price_entity", selector: { entity: { domain: "input_number" } } });
    }
    if (source === "fixed") {
      schema.push({ name: "price", selector: { number: { min: 0, step: 0.001, mode: "box" } } });
      schema.push({
        name: "price_unit",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "eur_per_kwh", label: this._t("editor_cost_price_unit_eur") },
              { value: "ct_per_kwh", label: this._t("editor_cost_price_unit_ct") },
            ],
          },
        },
      });
    }
    schema.push({ name: "currency", selector: { text: {} } });
    return schema;
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
      source: "editor_top_consumers_source",
      entities_flat: "editor_top_consumers_entities",
      period: "editor_top_consumers_period",
      name: "editor_name",
      icon: "editor_icon",
      subtitle: "editor_energy_subtitle",
      top_count: "editor_top_consumers_top_count",
      rest_mode: "editor_top_consumers_rest_mode",
      unit_mode: "editor_top_consumers_unit_mode",
      price_source: "editor_cost_price_source",
      price_entity: "editor_cost_price_entity",
      price: "editor_cost_price",
      price_unit: "editor_cost_price_unit",
      currency: "editor_cost_currency",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _colorChanged(
    field: "accent_color" | "text_color" | "secondary_text_color" | "card_background",
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

  private _opacityChanged(field: "accent_opacity", value: number): void {
    if (!this._config) return;
    this._config = { ...this._config, [field]: value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _nameStripChanged(values: string[]): void {
    if (!this._config) return;
    this._config = { ...this._config, name_strip: values };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _paletteChanged(values: string[]): void {
    if (!this._config) return;
    this._config = { ...this._config, palette: values };
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

    const sourceData = {
      source: this._config.source ?? "energy",
      entities_flat: (this._config.entities ?? []).map((e) => e.entity),
      period: this._config.period ?? "today",
    };
    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      subtitle: this._config.subtitle,
      unit_mode: this._config.unit_mode ?? "energy",
      top_count: this._config.top_count ?? DEFAULT_TOP_CONSUMERS_COUNT,
      rest_mode: this._config.rest_mode ?? "collapse",
    };
    const priceData = {
      price_source: this._config.price_source ?? "energy_dashboard",
      price_entity: this._config.price_entity,
      price: this._config.price,
      price_unit: this._config.price_unit ?? "eur_per_kwh",
      currency: this._config.currency ?? "EUR",
    };
    const animationData = { animation: this._config.animation ?? "auto" };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_top_consumers_source_header")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:database"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${sourceData}
              .schema=${this._sourceSchema()}
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
          </div>
        </ha-expansion-panel>

        ${this._config.unit_mode === "cost"
          ? html`
              <ha-expansion-panel outlined .header=${this._t("editor_cost_price_section")}>
                <ha-icon slot="leading-icon" icon="mdi:cash-multiple"></ha-icon>
                <div class="panel-content">
                  <ha-form
                    .hass=${this.hass}
                    .data=${priceData}
                    .schema=${this._priceSchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${this._valueChanged}
                  ></ha-form>
                </div>
              </ha-expansion-panel>
            `
          : nothing}

        <ha-expansion-panel outlined .header=${this._t("editor_top_consumers_name_strip_header")}>
          <ha-icon slot="leading-icon" icon="mdi:format-letter-case"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_top_consumers_name_strip_helper")}</div>
            ${listRow(
              this._t("editor_top_consumers_name_strip"),
              this._config.name_strip ?? [],
              (v) => this._nameStripChanged(v),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(
              this._t("editor_top_consumers_accent_color"),
              this._config.accent_color,
              (v) => this._colorChanged("accent_color", v),
              {
                label: this._t("editor_opacity"),
                value: this._config.accent_opacity,
                defaultValue: 18,
                onChange: (v) => this._opacityChanged("accent_opacity", v),
              },
            )}
            ${listRow(this._t("editor_top_consumers_palette"), this._config.palette ?? [], (v) => this._paletteChanged(v))}
            ${colorRow(this._t("editor_progress_text_color"), this._config.text_color, (v) => this._colorChanged("text_color", v))}
            ${colorRow(this._t("editor_progress_secondary_text_color"), this._config.secondary_text_color, (v) => this._colorChanged("secondary_text_color", v))}
            ${colorRow(this._t("editor_progress_card_background"), this._config.card_background, (v) => this._colorChanged("card_background", v))}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_animation")}>
          <ha-icon slot="leading-icon" icon="mdi:trophy-outline"></ha-icon>
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
          defaultRadius: DEFAULT_TOP_CONSUMERS_RADIUS,
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
    "m3-top-consumers-card-editor": M3TopConsumersCardEditor;
  }
}
