import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3HumidifierCardConfig,
  HumidifierChipConfig,
  HumidifierBlock,
} from "./types";
import {
  DEFAULT_HUMIDIFIER_RADIUS,
  HUMIDIFIER_STEP_DEFAULT,
  HUMIDIFIER_TANK_WARN,
  HUMIDIFIER_TANK_FULL,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, colorRow, editorStyles, type SchemaEntry } from "./shared/editor-helpers";
import { deviceEntityIds } from "./shared/ha-registry";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

/** Domains worth offering as a suggestion from the same device. */
const CONTROL_DOMAINS = ["switch", "select", "button", "number"];
const SENSOR_DOMAINS = ["sensor", "binary_sensor"];

@customElement("m3-humidifier-card-editor")
export class M3HumidifierCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3HumidifierCardConfig;
  @state() private _appearance: AppearanceState = {
    showCustomRadius: false,
    showCorners: false,
    cornerCustom: {},
  };

  public setConfig(config: M3HumidifierCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_HUMIDIFIER_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }
  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }
  private _emit(config: M3HumidifierCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._emit({
      ...this._config,
      ...(ev.detail.value as Record<string, unknown>),
    } as M3HumidifierCardConfig);
  }

  private _colorChanged(
    field: "accent_color" | "text_color" | "secondary_text_color" | "card_background",
    value: string,
  ): void {
    if (!this._config) return;
    if (value) {
      this._emit({ ...this._config, [field]: value });
    } else {
      const { [field]: _drop, ...rest } = this._config;
      this._emit(rest as M3HumidifierCardConfig);
    }
  }

  private _radiusPresetChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = radiusPresetPatch(ev.detail.value.radius_preset as string);
    this._appearance = { ...this._appearance, showCustomRadius: patch.showCustomRadius };
    if (patch.radius !== undefined) this._emit({ ...this._config, radius: patch.radius });
  }
  private _cornersToggleChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const showCorners = ev.detail.value.use_corners as boolean;
    this._appearance = { ...this._appearance, showCorners };
    if (!showCorners) {
      const { corners: _removed, ...rest } = this._config;
      this._emit(rest as M3HumidifierCardConfig);
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
      this._emit({ ...this._config, corners: { ...(this._config.corners ?? {}), [key]: patch.px } });
    }
  }
  private _cornerValueChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const px = ev.detail.value[key] as number;
    this._emit({ ...this._config, corners: { ...(this._config.corners ?? {}), [key]: px } });
  }

  // ---- chip lists -----------------------------------------------------------

  private _list(field: "controls" | "sensors"): HumidifierChipConfig[] {
    return this._config?.[field] ?? [];
  }

  private _chipChanged(field: "controls" | "sensors", index: number, ev: CustomEvent): void {
    if (!this._config) return;
    const list = [...this._list(field)];
    const value = ev.detail.value as HumidifierChipConfig;
    list[index] = {
      entity: value.entity,
      ...(value.name ? { name: value.name } : {}),
      ...(value.icon ? { icon: value.icon } : {}),
      ...(value.label ? { label: value.label } : {}),
      ...(list[index]?.color ? { color: list[index].color } : {}),
    };
    this._emit({ ...this._config, [field]: list });
  }

  private _chipColorChanged(field: "controls" | "sensors", index: number, value: string): void {
    if (!this._config) return;
    const list = [...this._list(field)];
    const current = list[index];
    if (!current) return;
    if (value) list[index] = { ...current, color: value };
    else {
      const { color: _drop, ...rest } = current;
      list[index] = rest;
    }
    this._emit({ ...this._config, [field]: list });
  }

  private _addChip(field: "controls" | "sensors", entity = ""): void {
    if (!this._config) return;
    this._emit({ ...this._config, [field]: [...this._list(field), { entity }] });
  }

  private _removeChip(field: "controls" | "sensors", index: number): void {
    if (!this._config) return;
    this._emit({ ...this._config, [field]: this._list(field).filter((_, i) => i !== index) });
  }

  /**
   * Entities on the same device as the main one, minus everything already in
   * use. Offered as buttons rather than applied on its own: guessing which of a
   * device's fifteen entities belong on the card is exactly the kind of
   * decision that should stay with the person configuring it.
   */
  private _suggestions(): { controls: string[]; sensors: string[]; fan?: string } {
    const empty = { controls: [], sensors: [] };
    const cfg = this._config;
    if (!cfg?.entity || !this.hass) return empty;
    const registry = this.hass.entities as unknown as
      | Record<string, { device_id?: string | null }>
      | undefined;
    const deviceId = registry?.[cfg.entity]?.device_id;
    if (!deviceId) return empty;

    const used = new Set(
      [
        cfg.entity,
        cfg.current_entity,
        cfg.target_entity,
        cfg.action_entity,
        cfg.mode_entity,
        cfg.fan_entity,
        cfg.tank_entity,
        ...this._list("controls").map((c) => c.entity),
        ...this._list("sensors").map((c) => c.entity),
      ].filter((e): e is string => !!e),
    );

    const siblings = deviceEntityIds(this.hass, deviceId).filter((e) => !used.has(e));
    return {
      controls: siblings.filter((e) => CONTROL_DOMAINS.includes(e.split(".")[0])),
      sensors: siblings.filter((e) => SENSOR_DOMAINS.includes(e.split(".")[0])),
      fan: cfg.fan_entity ? undefined : siblings.find((e) => e.startsWith("fan.")),
    };
  }

  private _friendly(entityId: string): string {
    return (this.hass?.states[entityId]?.attributes?.friendly_name as string) ?? entityId;
  }

  // ---- schemas --------------------------------------------------------------

  private _deviceSchema(): SchemaEntry[] {
    return [
      { name: "entity", selector: { entity: { domain: ["humidifier", "switch", "fan"] } }, required: true },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      {
        name: "device_kind",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "", label: this._t("editor_humidifier_kind_auto") },
              { value: "humidifier", label: this._t("editor_humidifier_kind_hum") },
              { value: "dehumidifier", label: this._t("editor_humidifier_kind_dehum") },
            ],
          },
        },
      },
    ];
  }

  private _readingsSchema(): SchemaEntry[] {
    return [
      { name: "current_entity", selector: { entity: { domain: ["sensor", "number", "input_number"] } } },
      { name: "target_entity", selector: { entity: { domain: ["humidifier", "number", "input_number"] } } },
      { name: "action_entity", selector: { entity: { domain: ["sensor", "select", "input_select"] } } },
    ];
  }

  private _fanSchema(): SchemaEntry[] {
    return [
      { name: "fan_entity", selector: { entity: { domain: ["fan", "select", "input_select"] } } },
      { name: "mode_entity", selector: { entity: { domain: ["select", "input_select"] } } },
    ];
  }

  private _tankSchema(): SchemaEntry[] {
    return [
      { name: "tank_entity", selector: { entity: { domain: ["sensor", "binary_sensor"] } } },
      { name: "tank_warn", selector: { number: { min: 0, max: 100, step: 1, mode: "box" } } },
      { name: "tank_full", selector: { number: { min: 0, max: 100, step: 1, mode: "box" } } },
      {
        name: "tank_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "chip", label: this._t("editor_humidifier_tank_chip") },
              { value: "bar", label: this._t("editor_humidifier_tank_bar") },
            ],
          },
        },
      },
    ];
  }

  private _displaySchema(): SchemaEntry[] {
    return [
      {
        name: "layout",
        selector: {
          select: {
            multiple: true,
            mode: "list",
            options: [
              { value: "slider", label: this._t("editor_humidifier_block_slider") },
              { value: "modes", label: this._t("editor_humidifier_block_modes") },
              { value: "fan", label: this._t("editor_humidifier_block_fan") },
              { value: "chips", label: this._t("editor_humidifier_block_chips") },
            ],
          },
        },
      },
      {
        name: "mode_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "icon_label", label: this._t("editor_humidifier_mode_icon_label") },
              { value: "icon_only", label: this._t("editor_humidifier_mode_icon_only") },
              { value: "dropdown", label: this._t("editor_humidifier_mode_dropdown") },
            ],
          },
        },
      },
      { name: "humidity_step", selector: { number: { min: 1, max: 10, step: 1, mode: "box" } } },
      { name: "min_humidity", selector: { number: { min: 0, max: 100, step: 1, mode: "box" } } },
      { name: "max_humidity", selector: { number: { min: 0, max: 100, step: 1, mode: "box" } } },
    ];
  }

  private _chipSchema(field: "controls" | "sensors"): SchemaEntry[] {
    const domains = field === "controls" ? CONTROL_DOMAINS : SENSOR_DOMAINS;
    return [
      { name: "entity", selector: { entity: { domain: domains } }, required: true },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      ...(field === "sensors"
        ? [{ name: "label", selector: { text: {} } } as SchemaEntry]
        : []),
    ];
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const map: Record<string, TranslationKey> = {
      animation: "editor_progress_animation",
      entity: "editor_humidifier_entity",
      name: "editor_humidifier_name",
      icon: "editor_humidifier_icon",
      label: "editor_humidifier_label",
      device_kind: "editor_humidifier_kind",
      current_entity: "editor_humidifier_current_entity",
      target_entity: "editor_humidifier_target_entity",
      action_entity: "editor_humidifier_action_entity",
      fan_entity: "editor_humidifier_fan_entity",
      mode_entity: "editor_humidifier_mode_dropdown",
      tank_entity: "editor_humidifier_tank_entity",
      tank_warn: "editor_humidifier_tank_warn",
      tank_full: "editor_humidifier_tank_full",
      tank_style: "editor_humidifier_tank_style",
      layout: "editor_humidifier_layout",
      mode_style: "editor_humidifier_mode_style",
      humidity_step: "editor_humidifier_step",
      min_humidity: "editor_humidifier_min",
      max_humidity: "editor_humidifier_max",
    };
    const key = map[schema.name];
    return key ? this._t(key) : schema.name;
  };

  // ---- render ---------------------------------------------------------------

  private _renderChipList(field: "controls" | "sensors"): unknown {
    const list = this._list(field);
    const addLabel =
      field === "controls" ? "editor_humidifier_add_control" : "editor_humidifier_add_sensor";
    return html`
      <div class="hint">
        ${this._t(field === "controls" ? "editor_humidifier_controls_hint" : "editor_humidifier_sensors_hint")}
      </div>
      ${list.map(
        (chip, index) => html`
          <div class="chip-row">
            <ha-form
              .hass=${this.hass}
              .data=${{
                entity: chip.entity,
                name: chip.name ?? "",
                icon: chip.icon ?? "",
                ...(field === "sensors" ? { label: chip.label ?? "" } : {}),
              }}
              .schema=${this._chipSchema(field)}
              .computeLabel=${this._computeLabel}
              @value-changed=${(e: CustomEvent) => this._chipChanged(field, index, e)}
            ></ha-form>
            ${colorRow(this._t("editor_humidifier_color"), chip.color, (v) =>
              this._chipColorChanged(field, index, v),
            )}
            <button class="remove-btn" @click=${() => this._removeChip(field, index)}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
        `,
      )}
      <button class="add-btn" @click=${() => this._addChip(field)}>
        <ha-icon icon="mdi:plus"></ha-icon>
        ${this._t(addLabel)}
      </button>
    `;
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;
    const cfg = this._config;
    const suggestions = this._suggestions();
    const hasSuggestions =
      !!suggestions.fan || suggestions.controls.length > 0 || suggestions.sensors.length > 0;

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_humidifier_device")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:air-humidifier"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{
                entity: cfg.entity ?? "",
                name: cfg.name ?? "",
                icon: cfg.icon ?? "",
                device_kind: cfg.device_kind ?? "",
              }}
              .schema=${this._deviceSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>

            ${hasSuggestions
              ? html`
                  <div class="suggestions">
                    <div class="hint">${this._t("editor_humidifier_found")}</div>
                    <div class="hint dim">${this._t("editor_humidifier_found_hint")}</div>
                    ${suggestions.fan
                      ? html`
                          <button
                            class="suggest-btn"
                            @click=${() => this._emit({ ...cfg, fan_entity: suggestions.fan })}
                          >
                            <ha-icon icon="mdi:fan"></ha-icon>
                            ${this._friendly(suggestions.fan)}
                          </button>
                        `
                      : nothing}
                    ${suggestions.controls.map(
                      (e) => html`
                        <button class="suggest-btn" @click=${() => this._addChip("controls", e)}>
                          <ha-icon icon="mdi:toggle-switch-outline"></ha-icon>
                          ${this._friendly(e)}
                        </button>
                      `,
                    )}
                    ${suggestions.sensors.map(
                      (e) => html`
                        <button class="suggest-btn" @click=${() => this._addChip("sensors", e)}>
                          <ha-icon icon="mdi:gauge"></ha-icon>
                          ${this._friendly(e)}
                        </button>
                      `,
                    )}
                  </div>
                `
              : nothing}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_humidifier_readings")}>
          <ha-icon slot="leading-icon" icon="mdi:water-percent"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_humidifier_readings_hint")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${{
                current_entity: cfg.current_entity ?? "",
                target_entity: cfg.target_entity ?? "",
                action_entity: cfg.action_entity ?? "",
              }}
              .schema=${this._readingsSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_humidifier_fan")}>
          <ha-icon slot="leading-icon" icon="mdi:fan"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_humidifier_fan_hint")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${{ fan_entity: cfg.fan_entity ?? "", mode_entity: cfg.mode_entity ?? "" }}
              .schema=${this._fanSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_humidifier_tank")}>
          <ha-icon slot="leading-icon" icon="mdi:cup-water"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{
                tank_entity: cfg.tank_entity ?? "",
                tank_warn: cfg.tank_warn ?? HUMIDIFIER_TANK_WARN,
                tank_full: cfg.tank_full ?? HUMIDIFIER_TANK_FULL,
                tank_style: cfg.tank_style ?? "chip",
              }}
              .schema=${this._tankSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_humidifier_controls")}>
          <ha-icon slot="leading-icon" icon="mdi:toggle-switch-outline"></ha-icon>
          <div class="panel-content">${this._renderChipList("controls")}</div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_humidifier_sensors")}>
          <ha-icon slot="leading-icon" icon="mdi:gauge"></ha-icon>
          <div class="panel-content">${this._renderChipList("sensors")}</div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_humidifier_display")}>
          <ha-icon slot="leading-icon" icon="mdi:view-dashboard-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{
                layout: cfg.layout ?? (["slider", "modes", "fan", "chips"] as HumidifierBlock[]),
                mode_style: cfg.mode_style ?? "icon_label",
                humidity_step: cfg.humidity_step ?? HUMIDIFIER_STEP_DEFAULT,
                min_humidity: cfg.min_humidity,
                max_humidity: cfg.max_humidity,
              }}
              .schema=${this._displaySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_humidifier_layout_hint")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_todo_accent_color"), cfg.accent_color, (v) =>
              this._colorChanged("accent_color", v),
            )}
            ${colorRow(this._t("editor_progress_text_color"), cfg.text_color, (v) =>
              this._colorChanged("text_color", v),
            )}
            ${colorRow(this._t("editor_progress_secondary_text_color"), cfg.secondary_text_color, (v) =>
              this._colorChanged("secondary_text_color", v),
            )}
            ${colorRow(this._t("editor_progress_card_background"), cfg.card_background, (v) =>
              this._colorChanged("card_background", v),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_animation")}>
          <ha-icon slot="leading-icon" icon="mdi:wave"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{ animation: cfg.animation ?? "auto" }}
              .schema=${[
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
              ]}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: this._config,
          defaultRadius: DEFAULT_HUMIDIFIER_RADIUS,
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
      .chip-row {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 34px 10px 10px;
        border: 1px dashed rgba(127, 127, 127, 0.4);
        border-radius: 12px;
      }

      .remove-btn {
        position: absolute;
        top: 8px;
        right: 8px;
      }

      .suggestions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 10px;
        padding: 10px;
        border: 1px dashed rgba(127, 127, 127, 0.4);
        border-radius: 12px;
      }

      .hint.dim {
        opacity: 0.6;
      }

      .suggest-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 36px;
        padding: 0 12px;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-family: inherit;
        font-size: 13px;
        text-align: left;
        color: var(--primary-text-color);
        background: rgba(127, 127, 127, 0.12);
      }

      .suggest-btn ha-icon {
        --mdc-icon-size: 18px;
        width: 18px;
        height: 18px;
        opacity: 0.7;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-humidifier-card-editor": M3HumidifierCardEditor;
  }
}
