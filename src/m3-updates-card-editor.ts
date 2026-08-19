import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3UpdatesCardConfig, UpdateGroup } from "./types";
import {
  DEFAULT_UPDATES_RADIUS,
  DEFAULT_UPDATES_MAX_VISIBLE,
  DEFAULT_UPDATES_NO_INSTALL,
  DEFAULT_UPDATES_BACKUP_WARN_DAYS,
  UPDATES_GROUP_ORDER,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import {
  fireEvent,
  colorRow,
  opacityRow,
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
  notifyModeSchema,
  notifyTimeSchema,
  notifyWeekdaySchema,
  notifyTitleSchema,
  notifyMessageSchema,
  notifyTokenHint,
  renderNotifyControls,
  setAutomationEnabled,
  saveNotifyAutomation,
  notifyActions,
  triggerStatePrelude,
  notifySampleEntity,
  resolveAutomationId,
  notifyStyles,
  type NotifyAutomationSpec,
} from "./shared/notify-editor";

const GROUP_LABEL_KEYS: Record<UpdateGroup, TranslationKey> = {
  core: "updates_group_core",
  os: "updates_group_os",
  supervisor: "updates_group_supervisor",
  addon: "updates_group_addon",
  hacs: "updates_group_hacs",
  firmware: "updates_group_firmware",
  remote: "updates_group_remote",
  other: "updates_group_other",
};

@customElement("m3-updates-card-editor")
export class M3UpdatesCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3UpdatesCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };
  @state() private _notifyBusy = false;
  @state() private _notifyStatus: "idle" | "success" | "error" = "idle";
  @state() private _notifyDetail = "";

  public setConfig(config: M3UpdatesCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_UPDATES_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  // ---- group priority -------------------------------------------------

  // The stored group_order may be partial (or empty), so the editor always
  // works on the full effective order the card renders with — otherwise
  // moving a group that was never configured would silently drop the rest.
  private _effectiveOrder(): UpdateGroup[] {
    const custom = (this._config?.group_order ?? []).filter((g) => UPDATES_GROUP_ORDER.includes(g));
    const rest = UPDATES_GROUP_ORDER.filter((g) => !custom.includes(g as UpdateGroup));
    return [...custom, ...rest] as UpdateGroup[];
  }

  private _moveGroup(index: number, delta: number): void {
    if (!this._config) return;
    const order = this._effectiveOrder();
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    this._config = { ...this._config, group_order: order };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _resetOrder(): void {
    if (!this._config) return;
    const { group_order: _dropped, ...rest } = this._config;
    this._config = rest;
    fireEvent(this, "config-changed", { config: this._config });
  }

  // ---- notification ---------------------------------------------------

  // Mirrors what the card lists: either the manual list or every update
  // entity, minus the ones excluded on the card and in the notify section.
  private _notifyEntities(): string[] {
    const cfg = this._config;
    if (!cfg || !this.hass) return [];
    const excluded = new Set([...(cfg.exclude_entities ?? []), ...(cfg.notify_exclude_entities ?? [])]);
    const ids = (cfg.auto_discover ?? true)
      ? Object.keys(this.hass.states).filter((id) => id.startsWith("update."))
      : (cfg.entities ?? []);
    return ids.filter((id) => {
      if (excluded.has(id)) return false;
      const st = this.hass!.states[id];
      // Unreachable entities would only ever contribute noise to a digest.
      return !!st && !st.attributes.restored && st.state !== "unavailable" && st.state !== "unknown";
    });
  }

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
      const ids = this._notifyEntities();
      if (ids.length === 0) throw new Error("no update entities");
      const mode = cfg.notify_mode ?? "on_change";
      const cardName = cfg.name || this._t("editor_updates_notify_default_name");
      const automationId = resolveAutomationId("updates", cfg.notify_automation_id);

      const base = {
        alias: `${cardName}: ${this._t("editor_updates_notify_alias")}`,
        description: this._t("editor_updates_notify_description"),
        mode: "single",
      };

      let automation: Record<string, unknown>;
      if (mode === "on_change") {
        automation = {
          ...base,
          // from/to rather than a bare `to: "on"`: a restart replays the
          // state and would otherwise re-announce every pending update.
          triggers: [{ trigger: "state", entity_id: ids, from: "off", to: "on" }],
          conditions: [],
          actions: notifyActions(
            targets,
            cardName,
            `{{ s.name }}: ` +
              `${this._t("editor_updates_notify_single").replace("{version}", "{{ s.attributes.latest_version }}")}`,
            {
              title: cfg.notify_title,
              message: cfg.notify_message,
              // A pending update makes the better sample for a hand-run test.
              prelude: triggerStatePrelude(
                notifySampleEntity(this.hass, ids, (st) => st.state === "on"),
              ),
              tokens: {
                komponente: "{{ s.name }}",
                version: "{{ s.attributes.latest_version }}",
                aktuell: "{{ s.attributes.installed_version }}",
              },
            },
          ),
        };
      } else {
        // One digest listing everything pending, so an add-on update wave
        // doesn't turn into fifteen separate pushes.
        const listTemplate =
          `{% set ids = ${JSON.stringify(ids)} %}` +
          `{% set ns = namespace(items=[]) %}` +
          `{% for e in ids %}{% set s = states[e] %}` +
          `{% if s is not none and s.state == 'on' %}` +
          `{% set ns.items = ns.items + [(s.attributes.title or s.name) ~ ' ' ~ (s.attributes.latest_version or '')] %}` +
          `{% endif %}{% endfor %}` +
          `{{ ns.items }}`;
        automation = {
          ...base,
          variables: { pending_items: listTemplate },
          triggers: [{ trigger: "time", at: cfg.notify_time || "18:00:00" }],
          conditions: [
            ...(mode === "weekly" ? [{ condition: "time", weekday: [cfg.notify_weekday || "mon"] }] : []),
            { condition: "template", value_template: "{{ pending_items | count > 0 }}" },
          ],
          actions: notifyActions(
            targets,
            cardName,
            `{{ pending_items | count }} ${this._t("editor_updates_notify_digest")}\n• {{ pending_items | join('\n• ') }}`,
            {
              title: cfg.notify_title,
              message: cfg.notify_message,
              tokens: {
                anzahl: "{{ pending_items | count }}",
                liste: "{{ pending_items | join(', ') }}",
              },
            },
          ),
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

  // ---- schemas --------------------------------------------------------

  private _groupOptions(): { value: string; label: string }[] {
    return UPDATES_GROUP_ORDER.map((g) => ({
      value: g,
      label: this._t(GROUP_LABEL_KEYS[g as UpdateGroup]),
    }));
  }

  private _entitiesSchema(): SchemaEntry[] {
    const schema: SchemaEntry[] = [{ name: "auto_discover", selector: { boolean: {} } }];
    if (this._config?.auto_discover ?? true) {
      schema.push({ name: "exclude_entities", selector: { entity: { domain: "update", multiple: true } } });
    } else {
      schema.push({ name: "entities", selector: { entity: { domain: "update", multiple: true } } });
    }
    return schema;
  }

  // Two separate one-field forms rather than one two-field form: HA renders a
  // multi-select's chosen values as chips *above* its button, so side by side
  // the second field's chips look like they belong to the first.
  private _includeTypesSchema(): SchemaEntry[] {
    return [
      {
        name: "include_types",
        selector: { select: { mode: "dropdown", multiple: true, options: this._groupOptions() } },
      },
    ];
  }

  private _noInstallSchema(): SchemaEntry[] {
    return [
      {
        name: "no_install_types",
        selector: { select: { mode: "dropdown", multiple: true, options: this._groupOptions() } },
      },
    ];
  }

  private _notifySchema(): SchemaEntry[] {
    const mode = this._config?.notify_mode ?? "on_change";
    const schema: SchemaEntry[] = [
      notifyServiceSchema(this.hass),
      notifyModeSchema([
        { value: "on_change", label: this._t("editor_updates_notify_mode_on_change") },
        { value: "daily", label: this._t("editor_updates_notify_mode_daily") },
        { value: "weekly", label: this._t("editor_updates_notify_mode_weekly") },
      ]),
    ];
    if (mode !== "on_change") schema.push(notifyTimeSchema());
    if (mode === "weekly") schema.push(notifyWeekdaySchema(this._language));
    schema.push({ name: "notify_exclude_entities", selector: { entity: { domain: "update", multiple: true } } });
    schema.push(notifyTitleSchema(), notifyMessageSchema());
    return schema;
  }

  private _contentSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "max_visible", selector: { number: { min: 0, step: 1, mode: "box" } } },
      { name: "show_uptodate", selector: { boolean: {} } },
      { name: "show_skipped", selector: { boolean: {} } },
      { name: "show_release_notes", selector: { boolean: {} } },
      { name: "require_confirm", selector: { boolean: {} } },
      { name: "inline_install", selector: { boolean: {} } },
    ];
  }

  private _backupSchema(): SchemaEntry[] {
    return [
      { name: "backup_entity", selector: { entity: { domain: "sensor", device_class: "timestamp" } } },
      {
        name: "backup_warn_days",
        selector: { number: { min: 1, max: 90, step: 1, mode: "box" } },
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
      auto_discover: "editor_updates_auto_discover",
      entities: "editor_updates_entities_list",
      exclude_entities: "editor_updates_exclude",
      include_types: "editor_updates_include_types",
      no_install_types: "editor_updates_no_install",
      name: "editor_name",
      icon: "editor_icon",
      max_visible: "editor_updates_max_visible",
      show_uptodate: "editor_updates_show_uptodate",
      show_skipped: "editor_updates_show_skipped",
      show_release_notes: "editor_updates_show_release_notes",
      require_confirm: "editor_updates_require_confirm",
      inline_install: "editor_updates_inline_install",
      backup_entity: "editor_updates_backup_entity",
      backup_warn_days: "editor_updates_backup_warn_days",
      notify_service: "editor_updates_notify_service",
      notify_mode: "editor_updates_notify_mode",
      notify_time: "editor_updates_notify_time",
      notify_weekday: "editor_battery_notify_weekday",
      notify_exclude_entities: "editor_updates_notify_exclude",
      notify_title: "editor_notify_title",
      notify_message: "editor_notify_message",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  // ---- change handlers ------------------------------------------------

  private _colorChanged(
    field:
      | "ok_color"
      | "update_color"
      | "addon_color"
      | "hacs_color"
      | "firmware_color"
      | "remote_color"
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

    const autoDiscover = this._config.auto_discover ?? true;
    const entitiesData = {
      auto_discover: autoDiscover,
      entities: this._config.entities ?? [],
      exclude_entities: this._config.exclude_entities ?? [],
    };
    const groupsData = {
      include_types: this._config.include_types ?? [],
      no_install_types: this._config.no_install_types ?? DEFAULT_UPDATES_NO_INSTALL,
    };
    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      max_visible: this._config.max_visible ?? DEFAULT_UPDATES_MAX_VISIBLE,
      show_uptodate: this._config.show_uptodate ?? true,
      show_skipped: this._config.show_skipped ?? true,
      show_release_notes: this._config.show_release_notes ?? true,
      require_confirm: this._config.require_confirm ?? true,
      inline_install: this._config.inline_install ?? false,
    };
    const backupData = {
      backup_entity: this._config.backup_entity ?? "",
      backup_warn_days: this._config.backup_warn_days ?? DEFAULT_UPDATES_BACKUP_WARN_DAYS,
    };
    const notifyData = {
      notify_service: this._config.notify_service ?? [],
      notify_mode: this._config.notify_mode ?? "on_change",
      notify_time: this._config.notify_time ?? "18:00:00",
      notify_weekday: this._config.notify_weekday ?? "mon",
      notify_exclude_entities: this._config.notify_exclude_entities ?? [],
      notify_title: this._config.notify_title ?? "",
      notify_message: this._config.notify_message ?? "",
    };
    const animationData = { animation: this._config.animation ?? "auto" };
    const order = this._effectiveOrder();

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
            <div class="hint">
              ${autoDiscover
                ? this._t("editor_updates_auto_discover_helper")
                : this._t("editor_updates_manual_helper")}
            </div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_updates_groups")}>
          <ha-icon slot="leading-icon" icon="mdi:sort-variant"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${groupsData}
              .schema=${this._includeTypesSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_updates_include_types_helper")}</div>

            <ha-form
              .hass=${this.hass}
              .data=${groupsData}
              .schema=${this._noInstallSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_updates_no_install_helper")}</div>

            <div class="order-title">${this._t("editor_updates_priority")}</div>
            <div class="hint">${this._t("editor_updates_priority_helper")}</div>
            <div class="order-list">
              ${order.map(
                (g, i) => html`
                  <div class="order-row">
                    <span class="order-index">${i + 1}</span>
                    <span class="order-name">${this._t(GROUP_LABEL_KEYS[g])}</span>
                    <button
                      class="order-btn"
                      ?disabled=${i === 0}
                      title=${this._t("editor_updates_priority_up")}
                      @click=${() => this._moveGroup(i, -1)}
                    >
                      <ha-icon icon="mdi:chevron-up"></ha-icon>
                    </button>
                    <button
                      class="order-btn"
                      ?disabled=${i === order.length - 1}
                      title=${this._t("editor_updates_priority_down")}
                      @click=${() => this._moveGroup(i, 1)}
                    >
                      <ha-icon icon="mdi:chevron-down"></ha-icon>
                    </button>
                  </div>
                `,
              )}
            </div>
            <button class="add-btn" @click=${() => this._resetOrder()}>
              <ha-icon icon="mdi:restore"></ha-icon>
              ${this._t("editor_updates_priority_reset")}
            </button>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_battery_notify")}>
          <ha-icon slot="leading-icon" icon="mdi:bell-outline"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_updates_notify_hint")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${notifyData}
              .schema=${this._notifySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_updates_notify_exclude_hint")}</div>
            <div class="hint">
              ${notifyTokenHint(this._language, ["anzahl", "liste", "komponente", "version", "aktuell"])}
            </div>
            ${renderNotifyControls({
              hass: this.hass,
              language: this._language,
              enabled: this._config.notify_enabled ?? false,
              automationId: this._config.notify_automation_id,
              busy: this._notifyBusy,
              status: this._notifyStatus,
              detail: this._notifyDetail,
              blockedReason: this._config.notify_service?.length ? undefined : this._t("editor_notify_missing"),
              successText: `${this._t("editor_updates_notify_success_prefix")} ${this._notifyDetail} ${this._t("editor_updates_notify_success_suffix")}`,
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
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_updates_max_visible_helper")}</div>
            <div class="hint">${this._t("editor_updates_require_confirm_helper")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_updates_backup")}>
          <ha-icon slot="leading-icon" icon="mdi:backup-restore"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${backupData}
              .schema=${this._backupSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_updates_backup_helper")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_updates_ok_color"), this._config.ok_color, (v) => this._colorChanged("ok_color", v))}
            ${colorRow(this._t("editor_updates_update_color"), this._config.update_color, (v) => this._colorChanged("update_color", v))}
            ${colorRow(this._t("editor_updates_addon_color"), this._config.addon_color, (v) => this._colorChanged("addon_color", v))}
            ${colorRow(this._t("editor_updates_hacs_color"), this._config.hacs_color, (v) => this._colorChanged("hacs_color", v))}
            ${colorRow(this._t("editor_updates_firmware_color"), this._config.firmware_color, (v) => this._colorChanged("firmware_color", v))}
            ${colorRow(this._t("editor_updates_remote_color"), this._config.remote_color, (v) => this._colorChanged("remote_color", v))}
            ${opacityRow(this._t("editor_updates_accent_opacity"), this._config.accent_opacity, 14, (v) => this._opacityChanged(v))}
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
            <div class="hint">${this._t("editor_progress_animation_reduced_motion_hint")}</div>
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: this._config,
          defaultRadius: DEFAULT_UPDATES_RADIUS,
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
      .order-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--primary-text-color);
        margin-top: 4px;
      }

      .order-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .order-row {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 40px;
        padding: 0 10px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
      }

      .order-index {
        flex-shrink: 0;
        width: 20px;
        font-size: 12px;
        opacity: 0.5;
        color: var(--primary-text-color);
      }

      .order-name {
        flex: 1;
        min-width: 0;
        font-size: 13px;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .order-btn {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 8px;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--primary-text-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .order-btn[disabled] {
        opacity: 0.3;
        cursor: default;
      }

      .order-btn ha-icon {
        --mdc-icon-size: 18px;
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
    "m3-updates-card-editor": M3UpdatesCardEditor;
  }
}
