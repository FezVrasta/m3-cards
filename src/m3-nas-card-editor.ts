import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3NasCardConfig } from "./types";
import {
  DEFAULT_NAS_RADIUS,
  DEFAULT_NAS_MAX_VISIBLE,
  DEFAULT_NAS_DISK_WARN,
  DEFAULT_NAS_DISK_CRITICAL,
  DEFAULT_NAS_TEMP_WARN,
  DEFAULT_NAS_TEMP_CRITICAL,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, colorRow, opacityRow, editorStyles, type SchemaEntry } from "./shared/editor-helpers";
import { radiusLabelMap } from "./shared/radius-editor";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

@customElement("m3-nas-card-editor")
export class M3NasCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3NasCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };

  public setConfig(config: M3NasCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_NAS_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _sourceSchema(): SchemaEntry[] {
    return [
      { name: "auto_discover", selector: { boolean: {} } },
      { name: "exclude_mounts", selector: { select: { multiple: true, custom_value: true, options: [] } } },
    ];
  }

  private _thresholdSchema(): SchemaEntry[] {
    return [
      { name: "disk_warn", selector: { number: { min: 1, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
      {
        name: "disk_critical",
        selector: { number: { min: 1, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } },
      },
      { name: "temp_warn", selector: { number: { min: 20, max: 120, step: 1, mode: "box", unit_of_measurement: "°C" } } },
      {
        name: "temp_critical",
        selector: { number: { min: 20, max: 120, step: 1, mode: "box", unit_of_measurement: "°C" } },
      },
    ];
  }

  private _contentSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "max_visible", selector: { number: { min: 0, step: 1, mode: "box" } } },
      { name: "show_cpu", selector: { boolean: {} } },
      { name: "show_memory", selector: { boolean: {} } },
      { name: "show_temperature", selector: { boolean: {} } },
      { name: "show_network", selector: { boolean: {} } },
      { name: "show_uptime", selector: { boolean: {} } },
      { name: "show_sync", selector: { boolean: {} } },
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
    const map: Record<string, TranslationKey> = {
      auto_discover: "editor_nas_auto_discover",
      exclude_mounts: "editor_nas_exclude_mounts",
      disk_warn: "editor_nas_disk_warn",
      disk_critical: "editor_nas_disk_critical",
      temp_warn: "editor_nas_temp_warn",
      temp_critical: "editor_nas_temp_critical",
      name: "editor_name",
      icon: "editor_icon",
      max_visible: "editor_nas_max_visible",
      show_cpu: "editor_nas_show_cpu",
      show_memory: "editor_nas_show_memory",
      show_temperature: "editor_nas_show_temperature",
      show_network: "editor_nas_show_network",
      show_uptime: "editor_nas_show_uptime",
      show_sync: "editor_nas_show_sync",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = map[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _colorChanged(
    field:
      | "ok_color"
      | "warn_color"
      | "critical_color"
      | "offline_color"
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

  private _opacityChanged(value: number): void {
    if (!this._config) return;
    this._config = { ...this._config, accent_opacity: value };
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
      const { corners: _dropped, ...rest } = this._config;
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
      auto_discover: this._config.auto_discover ?? true,
      exclude_mounts: this._config.exclude_mounts ?? [],
    };
    const thresholdData = {
      disk_warn: this._config.disk_warn ?? DEFAULT_NAS_DISK_WARN,
      disk_critical: this._config.disk_critical ?? DEFAULT_NAS_DISK_CRITICAL,
      temp_warn: this._config.temp_warn ?? DEFAULT_NAS_TEMP_WARN,
      temp_critical: this._config.temp_critical ?? DEFAULT_NAS_TEMP_CRITICAL,
    };
    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      max_visible: this._config.max_visible ?? DEFAULT_NAS_MAX_VISIBLE,
      show_cpu: this._config.show_cpu ?? true,
      show_memory: this._config.show_memory ?? true,
      show_temperature: this._config.show_temperature ?? true,
      show_network: this._config.show_network ?? true,
      show_uptime: this._config.show_uptime ?? true,
      show_sync: this._config.show_sync ?? true,
    };
    const animationData = { animation: this._config.animation ?? "auto" };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_entities")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:database"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${sourceData}
              .schema=${this._sourceSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_nas_auto_discover_helper")}</div>
            <div class="hint">${this._t("editor_nas_exclude_mounts_helper")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_nas_thresholds")}>
          <ha-icon slot="leading-icon" icon="mdi:gauge"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${thresholdData}
              .schema=${this._thresholdSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_nas_thresholds_helper")}</div>
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
            <div class="hint">${this._t("editor_nas_sync_helper")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_nas_ok_color"), this._config.ok_color, (v) => this._colorChanged("ok_color", v))}
            ${colorRow(this._t("editor_nas_warn_color"), this._config.warn_color, (v) => this._colorChanged("warn_color", v))}
            ${colorRow(this._t("editor_nas_critical_color"), this._config.critical_color, (v) => this._colorChanged("critical_color", v))}
            ${colorRow(this._t("editor_nas_offline_color"), this._config.offline_color, (v) => this._colorChanged("offline_color", v))}
            ${opacityRow(this._t("editor_nas_accent_opacity"), this._config.accent_opacity, 18, (v) => this._opacityChanged(v))}
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
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: this._config,
          defaultRadius: DEFAULT_NAS_RADIUS,
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

  static styles = [editorStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-nas-card-editor": M3NasCardEditor;
  }
}
