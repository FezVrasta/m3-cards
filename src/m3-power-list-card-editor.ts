import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3PowerListCardConfig } from "./types";
import {
  DEFAULT_POWER_LIST_RADIUS,
  DEFAULT_POWER_LIST_THRESHOLD,
  DEFAULT_POWER_LIST_NOTIFY_THRESHOLD,
  DEFAULT_POWER_LIST_NOTIFY_DURATION_HOURS,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { discoverPowerEntities } from "./shared/ha-registry";
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
import {
  notifyServiceSchema,
  notifyActions,
  renderNotifyControls,
  setAutomationEnabled,
  notifyStyles,
  saveNotifyAutomation,
  resolveAutomationId,
  type NotifyAutomationSpec,
} from "./shared/notify-editor";

@customElement("m3-power-list-card-editor")
export class M3PowerListCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3PowerListCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };
  @state() private _notifyBusy = false;
  @state() private _notifyStatus: "idle" | "success" | "error" = "idle";
  @state() private _notifyDetail = "";

  public setConfig(config: M3PowerListCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_POWER_LIST_RADIUS);
  }

  // The warning has to cover exactly the devices the card lists, so the set is
  // resolved the same way the card does it (manual list vs. auto-discovery
  // with area/label filters) and baked into the trigger. Pressing the button
  // again re-resolves after new sockets have been added.
  //
  // Two groups never belong in a "left running" warning: producers (a solar
  // string above 10 W for three hours is the good case, not the bad one) and
  // devices the user muted because they are supposed to run 24/7.
  private async _resolveNotifyEntities(): Promise<string[]> {
    const cfg = this._config;
    if (!cfg || !this.hass) return [];
    const ids = cfg.auto_discover
      ? await discoverPowerEntities(this.hass, {
          excludeEntities: cfg.exclude_entities,
          includeAreas: cfg.include_area,
          includeLabels: cfg.include_label,
        })
      : (cfg.entities ?? []).map((e) => e.entity);
    // Producers are only ever declared in the manual list — discovery has no
    // notion of type — but filtering by id covers both paths.
    const producers = new Set(
      (cfg.entities ?? []).filter((e) => e.type === "producer").map((e) => e.entity),
    );
    const muted = new Set(cfg.notify_exclude_entities ?? []);
    return ids.filter((id) => id && !producers.has(id) && !muted.has(id));
  }

  // On switches the automation on (creating it first if needed); off pauses
  // it rather than deleting, so the configuration survives a toggle.
  private async _toggleNotify(enabled: boolean): Promise<void> {
    if (!this._config || !this.hass) return;
    this._config = { ...this._config, notify_enabled: enabled };
    fireEvent(this, "config-changed", { config: this._config });
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
      if (ids.length === 0) throw new Error(this._t("editor_power_list_notify_empty"));
      const threshold = cfg.notify_power_threshold ?? DEFAULT_POWER_LIST_NOTIFY_THRESHOLD;
      const hours = cfg.notify_duration_hours ?? DEFAULT_POWER_LIST_NOTIFY_DURATION_HOURS;
      const cardName = cfg.name || this._t("power_list_default_name");
      const automationId = resolveAutomationId("power_left_running", cfg.notify_automation_id);

      const message = this._t("editor_power_list_notify_message")
        .replace("{name}", "{{ trigger.to_state.name }}")
        .replace("{h}", String(hours))
        .replace("{w}", "{{ trigger.to_state.state | float(0) | round(0) }}");

      await saveNotifyAutomation(this.hass, {
        id: automationId,
        alias: `${cardName}: ${this._t("editor_power_list_notify_alias")}`,
        description: this._t("editor_power_list_notify_description"),
        // A numeric_state trigger tracks its `for` window per entity, so two
        // devices can come due at the same moment — "single" would silently
        // drop the second one.
        mode: "queued",
        triggers: [
          {
            trigger: "numeric_state",
            entity_id: ids,
            above: threshold,
            for: { hours },
          },
        ],
        conditions: [],
        actions: notifyActions(targets, cardName, message),
      } as NotifyAutomationSpec);

      if (cfg.notify_automation_id !== automationId) {
        this._config = { ...cfg, notify_automation_id: automationId };
        fireEvent(this, "config-changed", { config: this._config });
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

  private _notifySchema(): SchemaEntry[] {
    return [
      notifyServiceSchema(this.hass),
      {
        name: "notify_power_threshold",
        selector: { number: { min: 0, step: 1, mode: "box", unit_of_measurement: "W" } },
      },
      {
        name: "notify_duration_hours",
        selector: { number: { min: 1, max: 24, step: 1, mode: "box", unit_of_measurement: "h" } },
      },
      {
        name: "notify_exclude_entities",
        selector: { entity: { domain: "sensor", device_class: "power", multiple: true } },
      },
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
      notify_service: "editor_notify_service",
      notify_power_threshold: "editor_power_list_notify_threshold",
      notify_duration_hours: "editor_power_list_notify_duration",
      notify_exclude_entities: "editor_power_list_notify_exclude",
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
    const notifyData = {
      notify_service: this._config.notify_service ?? [],
      notify_power_threshold:
        this._config.notify_power_threshold ?? DEFAULT_POWER_LIST_NOTIFY_THRESHOLD,
      notify_duration_hours:
        this._config.notify_duration_hours ?? DEFAULT_POWER_LIST_NOTIFY_DURATION_HOURS,
      notify_exclude_entities: this._config.notify_exclude_entities ?? [],
    };

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

        <ha-expansion-panel outlined .header=${this._t("editor_notify")}>
          <ha-icon slot="leading-icon" icon="mdi:bell-outline"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_power_list_notify_hint")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${notifyData}
              .schema=${this._notifySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_power_list_notify_exclude_hint")}</div>
            ${renderNotifyControls({
              hass: this.hass,
              enabled: this._config.notify_enabled ?? false,
              automationId: this._config.notify_automation_id,
              blockedReason: this._config.notify_service?.length ? undefined : this._t("editor_notify_missing"),
              language: this._language,
              busy: this._notifyBusy,
              status: this._notifyStatus,
              detail: this._notifyDetail,
              successText: `${this._t("editor_power_list_notify_success_prefix")} ${this._notifyDetail} ${this._t("editor_power_list_notify_success_suffix")}`,
              onToggle: (on) => this._toggleNotify(on),
              onSetup: () => this._setupNotify(),
            })}
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

  static styles = [editorStyles, notifyStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-power-list-card-editor": M3PowerListCardEditor;
  }
}
