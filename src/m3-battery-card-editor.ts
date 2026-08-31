import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3BatteryCardConfig, BatteryEntityConfig } from "./types";
import {
  DEFAULT_BATTERY_RADIUS,
  DEFAULT_BATTERY_THRESHOLD_CRITICAL,
  DEFAULT_BATTERY_THRESHOLD_LOW,
  DEFAULT_BATTERY_THRESHOLD_MEDIUM,
  DEFAULT_BATTERY_NAME_STRIP,
  DEFAULT_BATTERY_NOTIFY_THRESHOLD,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { discoverBatteryEntities } from "./shared/ha-registry";
import {
  fireEvent,
  colorRow,
  opacityRow,
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
import {
  notifyServiceSchema,
  notifyTimeSchema,
  notifyWeekdaySchema,
  notifyTokenHint,
  renderNotifyControls,
  setAutomationEnabled,
  notifyStyles,
  notifyTitleSchema,
  notifyMessageSchema,
  saveNotifyAutomation,
  notifyActions,
  triggerStatePrelude,
  notifySampleEntity,
  resolveAutomationId,
  slugifyForId,
  type NotifyAutomationSpec,
} from "./shared/notify-editor";

@customElement("m3-battery-card-editor")
export class M3BatteryCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3BatteryCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };
  @state() private _discoveredCount?: number;
  @state() private _notifyBusy = false;
  @state() private _notifyStatus: "idle" | "success" | "error" = "idle";
  @state() private _notifyDetail = "";

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

  // The notification has to cover exactly the devices the card lists, and that
  // set differs per card (manual list vs. auto-discovery with area/label
  // filters). Resolving it here and baking the result into the automation
  // keeps the two in sync; pressing the button again re-resolves after new
  // devices are added.
  private async _resolveNotifyEntities(): Promise<string[]> {
    const cfg = this._config;
    if (!cfg || !this.hass) return [];
    const ids = (cfg.auto_discover ?? true)
      ? await discoverBatteryEntities(this.hass, {
          excludeEntities: cfg.exclude_entities,
          includeAreas: cfg.include_area,
          includeLabels: cfg.include_label,
        })
      : (cfg.entities ?? []).map((e) => e.entity);
    const muted = new Set(cfg.notify_exclude_entities ?? []);
    return ids.filter((id) => !muted.has(id));
  }

  private async _legacyAutomationId(id: string): Promise<string | undefined> {
    try {
      await this.hass!.callApi("GET", `config/automation/config/${id}`);
      return id;
    } catch {
      return undefined; // 404 — nothing to adopt
    }
  }

  // Turning it on runs the full setup (creating the automation if needed);
  // turning it off pauses the automation rather than deleting it, so the
  // configuration survives a toggle round-trip.
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
      this._notifyDetail = this._t("editor_battery_notify_missing");
      return;
    }
    this._notifyBusy = true;
    this._notifyStatus = "idle";
    this._notifyDetail = "";
    try {
      const ids = await this._resolveNotifyEntities();
      if (ids.length === 0) throw new Error("no battery entities");
      const numeric = ids.filter((id) => !id.startsWith("binary_sensor."));
      const binary = ids.filter((id) => id.startsWith("binary_sensor."));
      const threshold = cfg.notify_threshold ?? DEFAULT_BATTERY_NOTIFY_THRESHOLD;
      const mode = cfg.notify_mode ?? "daily";
      const cardName = cfg.name || this._t("battery_default_name");
      const automationId = resolveAutomationId(
        "battery_low",
        cfg.notify_automation_id ??
          // Adopt an automation created before ids were stored, so pressing
          // the button again updates it instead of orphaning it.
          (await this._legacyAutomationId(`m3_battery_low_${slugifyForId(cardName)}`)),
      );
      const jsonIds = JSON.stringify(ids);

      const base = {
        alias: `${cardName}: ${this._t("editor_battery_notify_alias")}`,
        description: this._t("editor_battery_notify_description"),
        mode: "single",
      };

      let automation: Record<string, unknown>;
      if (mode === "on_change") {
        const triggers: Record<string, unknown>[] = [];
        if (numeric.length) triggers.push({ trigger: "numeric_state", entity_id: numeric, below: threshold });
        if (binary.length) triggers.push({ trigger: "state", entity_id: binary, to: "on" });
        automation = {
          ...base,
          triggers,
          conditions: [],
          actions: notifyActions(targets, cardName,
            `{{ s.name }}: ` +
                `{% if s.entity_id.startswith('binary_sensor.') %}` +
                `${this._t("editor_battery_notify_single_empty")}` +
                `{% else %}` +
                `${this._t("editor_battery_notify_single_pct").replace("{x}", "{{ s.state }}")}` +
                `{% endif %}`,
            { title: cfg.notify_title, message: cfg.notify_message,
              // An already weak battery makes the better sample for a hand-run.
              prelude: triggerStatePrelude(
                notifySampleEntity(this.hass, ids, (st) =>
                  st.entity_id.startsWith("binary_sensor.")
                    ? st.state === "on"
                    : Number(st.state) <= threshold),
              ),
              tokens: {
                geraet: "{{ s.name }}",
                wert: "{{ s.state }}",
              } }),
        };
      } else {
        // One digest listing every weak battery, so a dozen low devices don't
        // turn into a dozen separate pushes.
        const listTemplate =
          `{% set ids = ${jsonIds} %}` +
          `{% set ns = namespace(items=[]) %}` +
          `{% for e in ids %}{% set s = states[e] %}` +
          `{% if s is not none and s.state not in ['unknown', 'unavailable'] %}` +
          `{% if e.startswith('binary_sensor.') %}` +
          `{% if s.state == 'on' %}{% set ns.items = ns.items + [s.name] %}{% endif %}` +
          `{% elif s.state | float(101) <= ${threshold} %}` +
          `{% set ns.items = ns.items + [s.name ~ ' (' ~ s.state ~ ' %)'] %}` +
          `{% endif %}{% endif %}{% endfor %}` +
          `{{ ns.items }}`;
        automation = {
          ...base,
          variables: { low_items: listTemplate },
          triggers: [{ trigger: "time", at: cfg.notify_time || "18:00:00" }],
          conditions: [
            ...(mode === "weekly"
              ? [{ condition: "time", weekday: [cfg.notify_weekday || "mon"] }]
              : []),
            { condition: "template", value_template: "{{ low_items | count > 0 }}" },
          ],
          actions: notifyActions(targets, cardName,
            `{{ low_items | count }} ${this._t("editor_battery_notify_digest")}\n• {{ low_items | join('\n• ') }}`,
            { title: cfg.notify_title, message: cfg.notify_message, tokens: {
              anzahl: "{{ low_items | count }}",
              liste: "{{ low_items | join(', ') }}",
            } }),
        };
      }

      await saveNotifyAutomation(this.hass, { id: automationId, ...automation } as NotifyAutomationSpec);
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

  private _notifySchema(): SchemaEntry[] {
    const mode = this._config?.notify_mode ?? "daily";
    const schema: SchemaEntry[] = [
      notifyServiceSchema(this.hass),
      {
        name: "notify_threshold",
        selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } },
      },
      {
        name: "notify_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "daily", label: this._t("editor_battery_notify_mode_daily") },
              { value: "weekly", label: this._t("editor_battery_notify_mode_weekly") },
              { value: "on_change", label: this._t("editor_battery_notify_mode_on_change") },
            ],
          },
        },
      },
    ];
    // Time only matters for the scheduled digests; on_change fires the moment
    // a battery crosses the threshold, so a check time would be misleading.
    if (mode !== "on_change") {
      schema.push(notifyTimeSchema());
    }
    if (mode === "weekly") {
      schema.push(notifyWeekdaySchema(this._language));
    }
    schema.push({
      name: "notify_exclude_entities",
      selector: { entity: { domain: ["sensor", "binary_sensor"], device_class: "battery", multiple: true } },
    });
    schema.push(notifyTitleSchema("notify_title"), notifyMessageSchema("notify_message"));
    return schema;
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

  /** The explanation belongs on the field, not in a paragraph under the
   *  form: what people miss is that the rest stays reachable. */
  private _computeHelper = (schema: SchemaEntry): string | undefined =>
    schema.name === "max_visible" ? this._t("editor_max_visible_helper") : undefined;

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
      notify_service: "editor_battery_notify_service",
      notify_title: "editor_notify_title",
      notify_message: "editor_notify_message",
      notify_threshold: "editor_battery_notify_threshold",
      notify_mode: "editor_battery_notify_mode",
      notify_time: "editor_battery_notify_time",
      notify_weekday: "editor_battery_notify_weekday",
      notify_exclude_entities: "editor_battery_notify_exclude",
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

  private _opacityChanged(field: "stage_tint_opacity", value: number): void {
    if (!this._config) return;
    this._config = { ...this._config, [field]: value };
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
    const notifyData = {
      notify_service: this._config.notify_service ?? [],
      notify_threshold: this._config.notify_threshold ?? DEFAULT_BATTERY_NOTIFY_THRESHOLD,
      notify_mode: this._config.notify_mode ?? "daily",
      notify_time: this._config.notify_time ?? "18:00:00",
      notify_weekday: this._config.notify_weekday ?? "mon",
      notify_exclude_entities: this._config.notify_exclude_entities ?? [],
    };
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
              .computeHelper=${this._computeHelper}
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
              .computeHelper=${this._computeHelper}
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
              .computeHelper=${this._computeHelper}
              @value-changed=${this._thresholdsChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_battery_notify")}>
          <ha-icon slot="leading-icon" icon="mdi:bell-outline"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_battery_notify_hint")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${notifyData}
              .schema=${this._notifySchema()}
              .computeLabel=${this._computeLabel}
              .computeHelper=${this._computeHelper}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_battery_notify_exclude_hint")}</div>
            <div class="hint">${notifyTokenHint(this._language, ["anzahl", "liste", "geraet", "wert"])}</div>
            ${renderNotifyControls({
              hass: this.hass,
              language: this._language,
              enabled: this._config.notify_enabled ?? false,
              automationId: this._config.notify_automation_id,
              busy: this._notifyBusy,
              status: this._notifyStatus,
              detail: this._notifyDetail,
              blockedReason: this._config.notify_service?.length
                ? undefined
                : this._t("editor_notify_missing"),
              successText: `${this._t("editor_battery_notify_success_prefix")} ${this._notifyDetail} ${this._t("editor_battery_notify_success_suffix")}`,
              onToggle: (on) => this._toggleNotify(on),
              onSetup: () => this._setupNotify(),
            })}
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
              .computeHelper=${this._computeHelper}
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
            ${opacityRow(this._t("editor_battery_stage_tint_opacity"), this._config.stage_tint_opacity, 18, (v) => this._opacityChanged("stage_tint_opacity", v))}
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
    notifyStyles,
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
