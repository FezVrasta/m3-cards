import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3OccupancyCardConfig,
  OccupancySensorConfig,
} from "./types";
import { DEFAULT_OCCUPANCY_RADIUS, DEFAULT_OCCUPANCY_NAME_STRIP } from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, colorRow, listRow, editorStyles, type SchemaEntry } from "./shared/editor-helpers";
import { radiusLabelMap } from "./shared/radius-editor";
import { discoverOccupancyRooms } from "./shared/ha-registry";
import {
  notifyServiceSchema,
  notifyTitleSchema,
  notifyMessageSchema,
  renderNotifyControls,
  notifyActions,
  notifyTokenHint,
  saveNotifyAutomation,
  resolveAutomationId,
  setAutomationEnabled,
  triggerStatePrelude,
  notifySampleEntity,
  slugifyForId,
  notifyStyles,
  type NotifyAutomationSpec,
} from "./shared/notify-editor";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

@customElement("m3-occupancy-card-editor")
export class M3OccupancyCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3OccupancyCardConfig;
  @state() private _appearance: AppearanceState = {
    showCustomRadius: false,
    showCorners: false,
    cornerCustom: {},
  };
  @state() private _notifyBusy = false;
  @state() private _notifyStatus: "idle" | "success" | "error" = "idle";
  @state() private _notifyDetail = "";

  public setConfig(config: M3OccupancyCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_OCCUPANCY_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _emit(config: M3OccupancyCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private _sensorsSchema(): SchemaEntry[] {
    const schema: SchemaEntry[] = [{ name: "auto_discover", selector: { boolean: {} } }];
    if (this._config?.auto_discover ?? true) {
      schema.push(
        { name: "include_area", selector: { area: { multiple: true } } },
        {
          name: "exclude_entities",
          selector: { entity: { domain: "binary_sensor", multiple: true } },
        },
      );
    }
    return schema;
  }

  // Manual sensors: one presence/motion binary_sensor per row. Shown only when
  // auto-discovery is off — a manual `sensors:` list overrides discovery
  // entirely in the card, so mixing the two would just hide the discovered set.
  private get _sensors(): OccupancySensorConfig[] {
    return this._config?.sensors ?? [];
  }

  private _sensorSchema(): SchemaEntry[] {
    return [
      {
        name: "entity",
        required: true,
        selector: { entity: { domain: "binary_sensor" } },
      },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
    ];
  }

  private _sensorChanged(index: number, ev: CustomEvent): void {
    if (!this._config) return;
    const sensors = [...this._sensors];
    const value = ev.detail.value as OccupancySensorConfig;
    // Keep the sibling entities the code editor may have set, but drop the
    // basic fields when cleared so the YAML stays free of empty strings.
    sensors[index] = {
      ...sensors[index],
      entity: value.entity,
      ...(value.name ? { name: value.name } : { name: undefined }),
      ...(value.icon ? { icon: value.icon } : { icon: undefined }),
    };
    if (!sensors[index].name) delete sensors[index].name;
    if (!sensors[index].icon) delete sensors[index].icon;
    this._emit({ ...this._config, sensors });
  }

  private _addSensor(): void {
    if (!this._config) return;
    this._emit({ ...this._config, sensors: [...this._sensors, { entity: "" }] });
  }

  private _removeSensor(index: number): void {
    if (!this._config) return;
    this._emit({ ...this._config, sensors: this._sensors.filter((_, i) => i !== index) });
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
              { value: "occupied_first", label: this._t("editor_occupancy_sort_occupied") },
              { value: "name", label: this._t("editor_occupancy_sort_name") },
              { value: "last_active", label: this._t("editor_occupancy_sort_last_active") },
            ],
          },
        },
      },
      { name: "max_visible", selector: { number: { min: 1, max: 30, mode: "box" } } },
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

  private _notifySchema(): SchemaEntry[] {
    return [
      notifyServiceSchema(this.hass),
      notifyTitleSchema("notify_title"),
      notifyMessageSchema("notify_message"),
    ];
  }

  private async _resolveNotifyEntities(): Promise<string[]> {
    const cfg = this._config;
    if (!cfg || !this.hass) return [];
    const manual = (cfg.sensors ?? []).map((s) => s.entity).filter(Boolean);
    if (manual.length) return manual;
    const rooms = await discoverOccupancyRooms(this.hass, {
      includeAreas: cfg.include_area,
      excludeEntities: cfg.exclude_entities,
      nameStrip: cfg.name_strip,
    });
    return rooms.flatMap((r) => r.entities);
  }

  private async _legacyAutomationId(id: string): Promise<string | undefined> {
    try {
      await this.hass!.callApi("GET", `config/automation/config/${id}`);
      return id;
    } catch {
      return undefined;
    }
  }

  private async _toggleNotify(enabled: boolean): Promise<void> {
    if (!this._config || !this.hass) return;
    this._emit({ ...this._config, notify_enabled: enabled });
    if (enabled) {
      await this._setupNotify();
      return;
    }
    const id = this._config.notify_automation_id;
    if (id) await setAutomationEnabled(this.hass, id, false);
  }

  private async _setupNotify(): Promise<void> {
    const cfg = this._config;
    if (!this.hass || !cfg) return;
    const targets = cfg.notify_service ?? [];
    if (targets.length === 0) {
      this._notifyStatus = "error";
      this._notifyDetail = this._t("editor_notify_missing");
      return;
    }
    this._notifyBusy = true;
    this._notifyStatus = "idle";
    this._notifyDetail = "";
    try {
      const ids = await this._resolveNotifyEntities();
      if (ids.length === 0) throw new Error(this._t("editor_occupancy_notify_empty"));
      const cardName = cfg.name || this._t("occupancy_default_name");
      const automationId =
        resolveAutomationId("occupancy", cfg.notify_automation_id) ??
        (await this._legacyAutomationId(`m3_occupancy_${slugifyForId(cardName)}`));
      const message = this._t("editor_occupancy_notify_message").replace("{name}", "{{ s.name }}");
      const prelude = triggerStatePrelude(
        notifySampleEntity(this.hass, ids, (st) => st.state === "on") ?? ids[0],
      );
      await saveNotifyAutomation(this.hass, {
        id: automationId,
        alias: `${cardName}: ${this._t("editor_occupancy_notify_alias")}`,
        description: this._t("editor_occupancy_notify_description"),
        mode: "queued",
        triggers: [{ trigger: "state", entity_id: ids, to: "on" }],
        conditions: [],
        actions: notifyActions(targets, cardName, message, {
          title: cfg.notify_title,
          message: cfg.notify_message,
          prelude,
          tokens: { ort: "{{ s.name }}" },
        }),
      } as NotifyAutomationSpec);
      if (cfg.notify_automation_id !== automationId) {
        this._emit({ ...cfg, notify_automation_id: automationId });
      }
      await setAutomationEnabled(this.hass, automationId, true);
      this._notifyStatus = "success";
      this._notifyDetail = `${ids.length}`;
    } catch (e) {
      this._notifyStatus = "error";
      this._notifyDetail = e instanceof Error ? e.message : String(e);
    } finally {
      this._notifyBusy = false;
    }
  }

  /** The explanation belongs on the field, not in a paragraph under the
   *  form: what people miss is that the rest stays reachable. */
  private _computeHelper = (schema: SchemaEntry): string | undefined =>
    schema.name === "max_visible" ? this._t("editor_max_visible_helper") : undefined;

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      auto_discover: "editor_occupancy_auto_discover",
      include_area: "editor_occupancy_include_area",
      exclude_entities: "editor_occupancy_exclude",
      entity: "editor_entity",
      name: "editor_name",
      icon: "editor_icon",
      notify_service: "editor_notify_service",
      notify_title: "editor_notify_title",
      notify_message: "editor_notify_message",
      sort: "editor_occupancy_sort",
      max_visible: "editor_occupancy_max_visible",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._emit({
      ...this._config,
      ...(ev.detail.value as Record<string, unknown>),
    } as M3OccupancyCardConfig);
  }

  private _colorChanged(
    field: "accent_color" | "text_color" | "secondary_text_color" | "card_background",
    value: string,
  ): void {
    if (!this._config) return;
    if (value) {
      this._emit({ ...this._config, [field]: value });
    } else {
      const { [field]: _removed, ...rest } = this._config;
      this._emit(rest as M3OccupancyCardConfig);
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
      this._emit(rest as M3OccupancyCardConfig);
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

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const sensorsData = {
      auto_discover: this._config.auto_discover ?? true,
      include_area: this._config.include_area ?? [],
      exclude_entities: this._config.exclude_entities ?? [],
    };
    const displayData = {
      name: this._config.name,
      icon: this._config.icon,
      sort: this._config.sort ?? "occupied_first",
      max_visible: this._config.max_visible,
    };
    const animationData = { animation: this._config.animation ?? "auto" };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_occupancy_sensors")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:motion-sensor"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${sensorsData}
              .schema=${this._sensorsSchema()}
              .computeLabel=${this._computeLabel}
              .computeHelper=${this._computeHelper}
              @value-changed=${this._valueChanged}
            ></ha-form>
            ${(this._config.auto_discover ?? true)
              ? nothing
              : html`
                  <div class="hint">${this._t("editor_occupancy_manual_hint")}</div>
                  ${this._sensors.map(
                    (sensor, index) => html`
                      <div class="sensor-row">
                        <ha-form
                          .hass=${this.hass}
                          .data=${{
                            entity: sensor.entity,
                            name: sensor.name ?? "",
                            icon: sensor.icon ?? "",
                          }}
                          .schema=${this._sensorSchema()}
                          .computeLabel=${this._computeLabel}
              .computeHelper=${this._computeHelper}
                          @value-changed=${(ev: CustomEvent) => this._sensorChanged(index, ev)}
                        ></ha-form>
                        <button
                          class="remove-btn"
                          @click=${() => this._removeSensor(index)}
                        >
                          <ha-icon icon="mdi:close"></ha-icon>
                        </button>
                      </div>
                    `,
                  )}
                  <button class="add-btn" @click=${() => this._addSensor()}>
                    <ha-icon icon="mdi:plus"></ha-icon>
                    ${this._t("editor_occupancy_add_sensor")}
                  </button>
                `}
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
              .computeHelper=${this._computeHelper}
              @value-changed=${this._valueChanged}
            ></ha-form>
            ${listRow(
              this._t("editor_occupancy_name_strip"),
              this._config.name_strip ?? DEFAULT_OCCUPANCY_NAME_STRIP,
              (v) => this._emit({ ...this._config!, name_strip: v }),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_occupancy_notify")}>
          <ha-icon slot="leading-icon" icon="mdi:bell-outline"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_occupancy_notify_hint")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${{
                notify_service: this._config.notify_service ?? [],
                notify_title: this._config.notify_title ?? "",
                notify_message: this._config.notify_message ?? "",
              }}
              .schema=${this._notifySchema()}
              .computeLabel=${this._computeLabel}
              .computeHelper=${this._computeHelper}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${notifyTokenHint(this._language, ["ort"])}</div>
            ${renderNotifyControls({
              hass: this.hass,
              language: this._language,
              enabled: this._config.notify_enabled ?? false,
              automationId: this._config.notify_automation_id,
              busy: this._notifyBusy,
              status: this._notifyStatus,
              detail: this._notifyDetail,
              blockedReason: this._config.notify_service?.length ? undefined : this._t("editor_notify_missing"),
              successText: `${this._t("editor_occupancy_notify_success")} (${this._notifyDetail})`,
              onToggle: (on) => this._toggleNotify(on),
              onSetup: () => this._setupNotify(),
            })}
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
              .data=${animationData}
              .schema=${this._animationSchema()}
              .computeLabel=${this._computeLabel}
              .computeHelper=${this._computeHelper}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_progress_animation_reduced_motion_hint")}</div>
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: this._config,
          defaultRadius: DEFAULT_OCCUPANCY_RADIUS,
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
    notifyStyles,
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
    "m3-occupancy-card-editor": M3OccupancyCardEditor;
  }
}
