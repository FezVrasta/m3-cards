import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3CounterCardConfig, PowerThreshold } from "./types";
import { DEFAULT_COUNTER_RADIUS } from "./const";
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

function thresholdsToText(thresholds: PowerThreshold[] | undefined): string {
  return (thresholds ?? []).map((t) => `${t.above}:${t.color}`).join(", ");
}

function textToThresholds(text: string): PowerThreshold[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const [above, color] = s.split(":").map((p) => p.trim());
      return { above: parseFloat(above), color: color ?? "" };
    })
    .filter((t) => !Number.isNaN(t.above) && t.color.length > 0);
}

@customElement("m3-counter-card-editor")
export class M3CounterCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3CounterCardConfig;
  @state() private _digitsMode: "auto" | "fixed" = "auto";
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };

  public setConfig(config: M3CounterCardConfig): void {
    this._config = config;
    this._digitsMode = typeof config.digits === "number" ? "fixed" : "auto";
    this._appearance = initAppearanceState(config, DEFAULT_COUNTER_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _entitiesSchema(): SchemaEntry[] {
    return [
      { name: "entity", selector: { entity: { domain: "sensor" } } },
      { name: "power_entity", selector: { entity: { domain: "sensor" } } },
      { name: "daily_entity", selector: { entity: { domain: "sensor" } } },
    ];
  }

  private _contentSchema(): SchemaEntry[] {
    const schema: SchemaEntry[] = [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "subtitle", selector: { text: {} } },
      {
        name: "decimals",
        selector: { number: { min: 0, max: 3, mode: "box" } },
      },
      {
        name: "digits_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: this._t("editor_counter_digits_auto") },
              { value: "fixed", label: this._t("editor_counter_digits_fixed") },
            ],
          },
        },
      },
    ];
    if (this._digitsMode === "fixed") {
      schema.push({
        name: "digits",
        selector: { number: { min: 1, max: 12, mode: "box" } },
      });
    }
    schema.push({ name: "show_ticker", selector: { boolean: {} } });
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
      entity: "editor_entity",
      power_entity: "editor_counter_power_entity",
      daily_entity: "editor_counter_daily_entity",
      name: "editor_name",
      icon: "editor_icon",
      subtitle: "editor_energy_subtitle",
      decimals: "editor_counter_decimals",
      digits_mode: "editor_counter_digits_mode",
      digits: "editor_counter_digits",
      show_ticker: "editor_counter_show_ticker",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _colorChanged(
    field: "accent_color" | "cell_background" | "power_chip_color" | "text_color" | "secondary_text_color" | "card_background",
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

  private _thresholdsChanged(ev: Event): void {
    if (!this._config) return;
    const text = (ev.target as HTMLInputElement).value;
    const thresholds = textToThresholds(text);
    this._config = { ...this._config, power_thresholds: thresholds };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const value = ev.detail.value;
    if ("digits_mode" in value) {
      this._digitsMode = value.digits_mode;
      const { digits_mode: _dm, ...rest } = value;
      if (this._digitsMode === "auto") {
        const { digits: _d, ...configRest } = this._config;
        this._config = { ...configRest, ...rest };
      } else {
        this._config = { ...this._config, ...rest, digits: this._config.digits ?? 5 };
      }
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

    const entitiesData = {
      entity: this._config.entity,
      power_entity: this._config.power_entity,
      daily_entity: this._config.daily_entity,
    };
    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      subtitle: this._config.subtitle,
      decimals: this._config.decimals ?? 2,
      digits_mode: this._digitsMode,
      digits: typeof this._config.digits === "number" ? this._config.digits : 5,
      show_ticker: this._config.show_ticker ?? false,
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
              this._t("editor_counter_accent_color"),
              this._config.accent_color,
              (v) => this._colorChanged("accent_color", v),
            )}
            ${colorRow(
              this._t("editor_counter_cell_background"),
              this._config.cell_background,
              (v) => this._colorChanged("cell_background", v),
            )}
            ${colorRow(
              this._t("editor_counter_power_chip_color"),
              this._config.power_chip_color,
              (v) => this._colorChanged("power_chip_color", v),
            )}
            <div class="color-row">
              <label class="color-label"
                >${this._t("editor_counter_power_thresholds")}</label
              >
              <input
                type="text"
                class="color-text list-input"
                .value=${thresholdsToText(this._config.power_thresholds)}
                placeholder="2000:orange, 3500:red"
                @change=${this._thresholdsChanged}
              />
            </div>
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
          <ha-icon slot="leading-icon" icon="mdi:counter"></ha-icon>
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
          defaultRadius: DEFAULT_COUNTER_RADIUS,
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
    "m3-counter-card-editor": M3CounterCardEditor;
  }
}
