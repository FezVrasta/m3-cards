import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3WasteCardConfig,
  WasteEntityConfig,
} from "./types";
import { DEFAULT_WASTE_RADIUS } from "./const";
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

@customElement("m3-waste-card-editor")
export class M3WasteCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3WasteCardConfig;
  @state() private _appearance: AppearanceState = {
    showCustomRadius: false,
    showCorners: false,
    cornerCustom: {},
  };

  public setConfig(config: M3WasteCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_WASTE_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }
  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }
  private _emit(config: M3WasteCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private get _entities(): WasteEntityConfig[] {
    return (this._config?.entities ?? []).map((e) => (typeof e === "string" ? { entity: e } : e));
  }

  private _modeSchema(): SchemaEntry[] {
    const schema: SchemaEntry[] = [
      {
        name: "mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "info", label: this._t("editor_waste_mode_info") },
              { value: "reminder", label: this._t("editor_waste_mode_reminder") },
            ],
          },
        },
      },
    ];
    if (this._config?.mode === "reminder") {
      schema.push(
        { name: "reminder_offset", selector: { number: { min: 0, max: 7, mode: "box", unit_of_measurement: "d" } } },
        { name: "reminder_time", selector: { time: {} } },
        { name: "ack_entity", selector: { entity: { domain: ["input_boolean", "input_datetime"] } } },
      );
    }
    return schema;
  }

  private _entityRowSchema(): SchemaEntry[] {
    return [
      { name: "entity", required: true, selector: { entity: { domain: "sensor" } } },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
    ];
  }

  private _discoverSchema(): SchemaEntry[] {
    return [{ name: "auto_discover", selector: { boolean: {} } }];
  }

  private _displaySchema(): SchemaEntry[] {
    return [
      {
        name: "hero_primary",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "days", label: this._t("editor_waste_hero_days") },
              { value: "weekday", label: this._t("editor_waste_hero_weekday") },
            ],
          },
        },
      },
      {
        name: "hero_icon",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "first", label: this._t("editor_waste_icon_first") },
              { value: "multi", label: this._t("editor_waste_icon_multi") },
            ],
          },
        },
      },
      { name: "show_timeline", selector: { boolean: {} } },
      { name: "timeline_days", selector: { number: { min: 7, max: 28, mode: "box", unit_of_measurement: "d" } } },
      { name: "max_rows", selector: { number: { min: 0, max: 20, mode: "box" } } },
    ];
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const map: Record<string, TranslationKey> = {
      mode: "editor_waste_mode",
      reminder_offset: "editor_waste_reminder_offset",
      reminder_time: "editor_waste_reminder_time",
      ack_entity: "editor_waste_ack_entity",
      auto_discover: "editor_waste_auto_discover",
      entity: "editor_entity",
      name: "editor_name",
      icon: "editor_icon",
      hero_primary: "editor_waste_hero_primary",
      hero_icon: "editor_waste_hero_icon",
      show_timeline: "editor_waste_show_timeline",
      timeline_days: "editor_waste_timeline_days",
      max_rows: "editor_waste_max_rows",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = map[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._emit({ ...this._config, ...(ev.detail.value as Record<string, unknown>) } as M3WasteCardConfig);
  }

  private _entityChanged(index: number, ev: CustomEvent): void {
    if (!this._config) return;
    const entities = [...this._entities];
    const value = ev.detail.value as WasteEntityConfig;
    entities[index] = {
      entity: value.entity,
      ...(value.name ? { name: value.name } : {}),
      ...(value.icon ? { icon: value.icon } : {}),
      ...(entities[index]?.color ? { color: entities[index].color } : {}),
    };
    this._emit({ ...this._config, entities });
  }
  private _entityColorChanged(index: number, value: string): void {
    if (!this._config) return;
    const entities = [...this._entities];
    const { color: _c, ...rest } = entities[index];
    entities[index] = value ? { ...rest, color: value } : (rest as WasteEntityConfig);
    this._emit({ ...this._config, entities });
  }
  private _addEntity(): void {
    if (!this._config) return;
    this._emit({ ...this._config, entities: [...this._entities, { entity: "" }] });
  }
  private _removeEntity(index: number): void {
    if (!this._config) return;
    this._emit({ ...this._config, entities: this._entities.filter((_, i) => i !== index) });
  }

  private _colorChanged(field: "accent_color" | "text_color" | "secondary_text_color" | "card_background", value: string): void {
    if (!this._config) return;
    if (value) this._emit({ ...this._config, [field]: value });
    else {
      const { [field]: _removed, ...rest } = this._config;
      this._emit(rest as M3WasteCardConfig);
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
      this._emit(rest as M3WasteCardConfig);
    }
  }
  private _cornerPresetChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const patch = cornerPresetPatch(ev.detail.value[key] as string);
    this._appearance = { ...this._appearance, cornerCustom: { ...this._appearance.cornerCustom, [key]: patch.custom } };
    if (patch.px !== undefined) this._emit({ ...this._config, corners: { ...(this._config.corners ?? {}), [key]: patch.px } });
  }
  private _cornerValueChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const px = ev.detail.value[key] as number;
    this._emit({ ...this._config, corners: { ...(this._config.corners ?? {}), [key]: px } });
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;
    const modeData = {
      mode: this._config.mode ?? "info",
      reminder_offset: this._config.reminder_offset ?? 1,
      reminder_time: this._config.reminder_time ?? "18:00",
      ack_entity: this._config.ack_entity,
    };
    const displayData = {
      hero_primary: this._config.hero_primary ?? "days",
      hero_icon: this._config.hero_icon ?? "first",
      show_timeline: this._config.show_timeline ?? true,
      timeline_days: this._config.timeline_days ?? 14,
      max_rows: this._config.max_rows ?? 0,
    };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_waste_mode")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:trash-can-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${modeData}
              .schema=${this._modeSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_waste_mode_hint")}</div>
            ${this._config.mode === "reminder" && !this._config.ack_entity
              ? html`<div class="hint">${this._t("editor_waste_ack_hint")}</div>`
              : nothing}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_waste_bins")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:delete-variant"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{ auto_discover: this._config.auto_discover ?? true }}
              .schema=${this._discoverSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            ${this._entities.map(
              (e, index) => html`
                <div class="sensor-row">
                  <ha-form
                    .hass=${this.hass}
                    .data=${{ entity: e.entity, name: e.name ?? "", icon: e.icon ?? "" }}
                    .schema=${this._entityRowSchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${(ev: CustomEvent) => this._entityChanged(index, ev)}
                  ></ha-form>
                  <button class="remove-btn" @click=${() => this._removeEntity(index)}>
                    <ha-icon icon="mdi:close"></ha-icon>
                  </button>
                </div>
                ${colorRow(this._t("editor_waste_color"), e.color, (v) => this._entityColorChanged(index, v))}
              `,
            )}
            <button class="add-btn" @click=${() => this._addEntity()}>
              <ha-icon icon="mdi:plus"></ha-icon>
              ${this._t("editor_waste_add_bin")}
            </button>
            ${listRow(
              this._t("editor_occupancy_name_strip"),
              this._config.name_strip ?? [],
              (v) => this._emit({ ...this._config!, name_strip: v }),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_supply_display")}>
          <ha-icon slot="leading-icon" icon="mdi:view-dashboard-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${displayData}
              .schema=${this._displaySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_todo_accent_color"), this._config.accent_color, (v) => this._colorChanged("accent_color", v))}
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
              .data=${{ animation: this._config.animation ?? "auto" }}
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
            <div class="hint">${this._t("editor_progress_animation_reduced_motion_hint")}</div>
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: this._config,
          defaultRadius: DEFAULT_WASTE_RADIUS,
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
      .sensor-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .sensor-row ha-form {
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
    "m3-waste-card-editor": M3WasteCardEditor;
  }
}
