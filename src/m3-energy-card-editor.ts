import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3EnergyCardConfig } from "./types";
import {
  DEFAULT_ENERGY_RADIUS,
  DEFAULT_ENERGY_DAYS,
  DEFAULT_ENERGY_HOURS,
  DEFAULT_ENERGY_MONTHS,
  ENERGY_MIN_DAYS,
  ENERGY_MAX_DAYS,
  ENERGY_MIN_HOURS,
  ENERGY_MAX_HOURS,
  ENERGY_MIN_MONTHS,
  ENERGY_MAX_MONTHS,
  } from "./const";
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
import { hasLongTermStatistics } from "./shared/ha-statistics";

@customElement("m3-energy-card-editor")
export class M3EnergyCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3EnergyCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };
  @state() private _showFallbackHint = false;

  private _lastCheckedEntity?: string;

  public setConfig(config: M3EnergyCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_ENERGY_RADIUS);
    this._maybeCheckFallback();
  }

  protected updated(): void {
    this._maybeCheckFallback();
  }

  private _maybeCheckFallback(): void {
    if (!this.hass || !this._config?.entity) return;
    if (this._config.entity === this._lastCheckedEntity) return;
    this._lastCheckedEntity = this._config.entity;
    hasLongTermStatistics(this.hass, this._config.entity).then((has) => {
      this._showFallbackHint = !has;
    });
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _entitiesSchema(): SchemaEntry[] {
    const mode = this._config?.mode ?? "consumption";
    const period = this._config?.period ?? "day";
    const source = this._config?.source ?? "entity";

    const modeField: SchemaEntry = {
      name: "mode",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "consumption", label: this._t("editor_energy_mode_consumption") },
            { value: "solar", label: this._t("editor_energy_mode_solar") },
          ],
        },
      },
    };

    if (mode === "solar") {
      const fields: SchemaEntry[] = [
        modeField,
        {
          name: "source",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "energy", label: this._t("editor_energy_source_energy") },
                { value: "entity", label: this._t("editor_energy_source_entity") },
              ],
            },
          },
        },
      ];
      if (source !== "energy") {
        fields.push({ name: "entity", required: true, selector: { entity: { domain: "sensor" } } });
      }
      fields.push({
        name: "statistic_type",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "change", label: this._t("editor_energy_statistic_type_change") },
              { value: "state", label: this._t("editor_energy_statistic_type_state") },
            ],
          },
        },
      });
      fields.push({ name: "forecast_entity", selector: { entity: { domain: "sensor" } } });
      fields.push({ name: "full_day", selector: { boolean: {} } });
      return fields;
    }

    const spanField: SchemaEntry =
      period === "hour"
        ? {
            name: "hours",
            selector: {
              number: {
                mode: "slider",
                min: ENERGY_MIN_HOURS,
                max: ENERGY_MAX_HOURS,
                step: 1,
              },
            },
          }
        : period === "month"
          ? {
              name: "months",
              selector: {
                number: {
                  mode: "slider",
                  min: ENERGY_MIN_MONTHS,
                  max: ENERGY_MAX_MONTHS,
                  step: 1,
                },
              },
            }
          : {
              name: "days",
              selector: {
                number: {
                  mode: "slider",
                  min: ENERGY_MIN_DAYS,
                  max: ENERGY_MAX_DAYS,
                  step: 1,
                },
              },
            };

    return [
      modeField,
      {
        name: "period",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "day", label: this._t("editor_energy_period_day") },
              { value: "hour", label: this._t("editor_energy_period_hour") },
              { value: "month", label: this._t("editor_energy_period_month") },
            ],
          },
        },
      },
      { name: "entity", required: true, selector: { entity: { domain: "sensor" } } },
      {
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
      },
      spanField,
    ];
  }

  private _contentSchema(): SchemaEntry[] {
    const mode = this._config?.mode ?? "consumption";
    const period = this._config?.period ?? "day";
    const fields: SchemaEntry[] = [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "subtitle", selector: { text: {} } },
    ];
    if (mode === "solar") {
      fields.push({ name: "show_legend", selector: { boolean: {} } });
    } else if (period === "month") {
      fields.push(
        { name: "show_projection", selector: { boolean: {} } },
        { name: "show_average", selector: { boolean: {} } },
        { name: "show_comparison", selector: { boolean: {} } },
        { name: "higher_is_better", selector: { boolean: {} } },
      );
    } else {
      fields.push({ name: "show_values", selector: { boolean: {} } });
    }
    return fields;
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
      mode: "editor_energy_mode",
      source: "editor_energy_source",
      period: "editor_energy_period",
      entity: "editor_energy_entity",
      statistic_type: "editor_energy_statistic_type",
      days: "editor_energy_days",
      hours: "editor_energy_hours",
      months: "editor_energy_months",
      forecast_entity: "editor_energy_forecast_entity",
      full_day: "editor_energy_full_day",
      name: "editor_name",
      icon: "editor_icon",
      subtitle: "editor_energy_subtitle",
      show_values: "editor_energy_show_values",
      show_legend: "editor_energy_show_legend",
      show_projection: "editor_energy_show_projection",
      show_average: "editor_energy_show_average",
      show_comparison: "editor_energy_show_comparison",
      higher_is_better: "editor_energy_higher_is_better",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _colorChanged(
    field:
      | "accent_color"
      | "bar_tint_color"
      | "text_color"
      | "secondary_text_color"
      | "card_background"
      | "comparison_better_color"
      | "comparison_worse_color",
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

    const mode = this._config.mode ?? "consumption";
    const entitiesData = {
      mode,
      source: this._config.source ?? "entity",
      period: this._config.period ?? "day",
      entity: this._config.entity,
      statistic_type: this._config.statistic_type ?? (mode === "solar" ? "change" : "state"),
      days: this._config.days ?? DEFAULT_ENERGY_DAYS,
      hours: this._config.hours ?? DEFAULT_ENERGY_HOURS,
      months: this._config.months ?? DEFAULT_ENERGY_MONTHS,
      forecast_entity: this._config.forecast_entity,
      full_day: this._config.full_day ?? false,
    };
    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      subtitle: this._config.subtitle,
      show_values: this._config.show_values ?? false,
      show_legend: this._config.show_legend ?? true,
      show_projection: this._config.show_projection ?? true,
      show_average: this._config.show_average ?? true,
      show_comparison: this._config.show_comparison ?? true,
      higher_is_better: this._config.higher_is_better ?? false,
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
            ${this._showFallbackHint
              ? html`<div class="hint">${this._t("editor_energy_fallback_hint")}</div>`
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
            <div class="hint">${this._t("editor_progress_colors_helper")}</div>
            ${colorRow(
              this._t("editor_energy_accent_color"),
              this._config.accent_color,
              (v) => this._colorChanged("accent_color", v),
            )}
            ${colorRow(
              this._t("editor_energy_bar_tint_color"),
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
            ${mode !== "solar" && (this._config.period ?? "day") === "month"
              ? html`
                  ${colorRow(
                    this._t("editor_energy_comparison_better_color"),
                    this._config.comparison_better_color,
                    (v) => this._colorChanged("comparison_better_color", v),
                  )}
                  ${colorRow(
                    this._t("editor_energy_comparison_worse_color"),
                    this._config.comparison_worse_color,
                    (v) => this._colorChanged("comparison_worse_color", v),
                  )}
                `
              : nothing}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_animation")}>
          <ha-icon slot="leading-icon" icon="mdi:chart-bar"></ha-icon>
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
          defaultRadius: DEFAULT_ENERGY_RADIUS,
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
    "m3-energy-card-editor": M3EnergyCardEditor;
  }
}
