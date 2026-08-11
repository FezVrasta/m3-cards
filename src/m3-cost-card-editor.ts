import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3CostCardConfig } from "./types";
import { DEFAULT_COST_RADIUS, DEFAULT_COST_CURRENCY } from "./const";
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

@customElement("m3-cost-card-editor")
export class M3CostCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3CostCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };

  public setConfig(config: M3CostCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_COST_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
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
    const isCustomUnit = source === "fixed" && this._config?.price_unit === "custom";
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
              { value: "custom", label: this._t("editor_cost_price_unit_custom") },
            ],
          },
        },
      });
      if (isCustomUnit) {
        schema.push({ name: "price_unit_label", selector: { text: {} } });
        schema.push({
          name: "price_quantity_factor",
          selector: { number: { min: 0, step: 0.0001, mode: "box" } },
        });
      }
    }
    if (source !== "energy_dashboard") {
      schema.push({
        name: "entity",
        selector: { entity: isCustomUnit ? { domain: "sensor" } : { domain: "sensor", device_class: "energy" } },
      });
      schema.push({
        name: "statistic_type",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "state", label: this._t("editor_energy_statistic_type_state") },
              { value: "change", label: this._t("editor_energy_statistic_type_change") },
            ],
          },
        },
      });
    }
    schema.push({ name: "base_fee", selector: { number: { min: 0, step: 0.5, mode: "box" } } });
    schema.push({ name: "currency", selector: { text: {} } });
    return schema;
  }

  private _contentSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "subtitle", selector: { text: {} } },
      {
        name: "period",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "day", label: this._t("editor_cost_period_day") },
              { value: "month", label: this._t("editor_cost_period_month") },
              { value: "year", label: this._t("editor_cost_period_year") },
            ],
          },
        },
      },
      { name: "show_projection", selector: { boolean: {} } },
      { name: "show_comparison", selector: { boolean: {} } },
      { name: "budget", selector: { number: { min: 0, step: 1, mode: "box" } } },
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
      price_source: "editor_cost_price_source",
      price_entity: "editor_cost_price_entity",
      price: "editor_cost_price",
      price_unit: "editor_cost_price_unit",
      price_unit_label: "editor_cost_price_unit_label",
      price_quantity_factor: "editor_cost_price_quantity_factor",
      entity: "editor_cost_entity",
      statistic_type: "editor_energy_statistic_type",
      base_fee: "editor_cost_base_fee",
      currency: "editor_cost_currency",
      name: "editor_name",
      icon: "editor_icon",
      subtitle: "editor_energy_subtitle",
      period: "editor_cost_period",
      show_projection: "editor_cost_show_projection",
      show_comparison: "editor_cost_show_comparison",
      budget: "editor_cost_budget",
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

    const priceData = {
      price_source: this._config.price_source ?? "energy_dashboard",
      price_entity: this._config.price_entity,
      price: this._config.price,
      price_unit: this._config.price_unit ?? "eur_per_kwh",
      price_unit_label: this._config.price_unit_label ?? "",
      price_quantity_factor: this._config.price_quantity_factor ?? 1,
      entity: this._config.entity,
      statistic_type: this._config.statistic_type ?? "state",
      base_fee: this._config.base_fee ?? 0,
      currency: this._config.currency ?? DEFAULT_COST_CURRENCY,
    };
    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      subtitle: this._config.subtitle,
      period: this._config.period ?? "month",
      show_projection: this._config.show_projection ?? true,
      show_comparison: this._config.show_comparison ?? true,
      budget: this._config.budget,
    };
    const animationData = { animation: this._config.animation ?? "auto" };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_cost_price_section")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:cash-multiple"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${priceData}
              .schema=${this._priceSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            ${this._config.base_fee
              ? html`<div class="hint">${this._t("editor_cost_base_fee_helper")}</div>`
              : nothing}
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
            ${colorRow(this._t("editor_summary_accent_color"), this._config.accent_color, (v) => this._colorChanged("accent_color", v))}
            ${colorRow(this._t("editor_progress_text_color"), this._config.text_color, (v) => this._colorChanged("text_color", v))}
            ${colorRow(this._t("editor_progress_secondary_text_color"), this._config.secondary_text_color, (v) => this._colorChanged("secondary_text_color", v))}
            ${colorRow(this._t("editor_progress_card_background"), this._config.card_background, (v) => this._colorChanged("card_background", v))}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_animation")}>
          <ha-icon slot="leading-icon" icon="mdi:cash-multiple"></ha-icon>
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
          defaultRadius: DEFAULT_COST_RADIUS,
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
    "m3-cost-card-editor": M3CostCardEditor;
  }
}
