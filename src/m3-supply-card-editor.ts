import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3SupplyCardConfig,
  SupplyItemConfig,
} from "./types";
import {
  DEFAULT_SUPPLY_RADIUS,
  SUPPLY_DEFAULT_RATE_WINDOW_DAYS,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, colorRow, editorStyles, type SchemaEntry } from "./shared/editor-helpers";
import { supplyPackSize, supplyLimits, supplyNotifyLimit } from "./shared/supply-thresholds";
import {
  notifyServiceSchema,
  notifyModeSchema,
  notifyTimeSchema,
  notifyTitleSchema,
  notifyMessageSchema,
  notifyWeekdaySchema,
  notifyTokenHint,
  notifyActions,
  notifyStyles,
  renderNotifyControls,
  saveNotifyAutomation,
  setAutomationEnabled,
  resolveAutomationId,
  triggerStatePrelude,
  notifySampleEntity,
  type NotifyStatus,
  type NotifyAutomationSpec,
} from "./shared/notify-editor";
import { radiusLabelMap } from "./shared/radius-editor";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

@customElement("m3-supply-card-editor")
export class M3SupplyCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3SupplyCardConfig;
  @state() private _appearance: AppearanceState = {
    showCustomRadius: false,
    showCorners: false,
    cornerCustom: {},
  };
  @state() private _notifyBusy = false;
  @state() private _notifyStatus: NotifyStatus = "idle";
  @state() private _notifyDetail = "";

  public setConfig(config: M3SupplyCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_SUPPLY_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private get _items(): SupplyItemConfig[] {
    return this._config?.items ?? [];
  }

  private _emit(config: M3SupplyCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  // ---- items ------------------------------------------------------------

  private _itemSchema(): SchemaEntry[] {
    return [
      {
        name: "entity",
        required: true,
        selector: { entity: { domain: ["counter", "input_number"] } },
      },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "pack_size", selector: { number: { min: 1, max: 999, mode: "box" } } },
      { name: "unit", selector: { text: {} } },
      { name: "low_threshold", selector: { number: { min: 0, max: 999, mode: "box" } } },
      { name: "critical_threshold", selector: { number: { min: 0, max: 999, mode: "box" } } },
      { name: "shopping_item", selector: { text: {} } },
    ];
  }

  private _itemChanged(index: number, ev: CustomEvent): void {
    if (!this._config) return;
    const items = [...this._items];
    // ha-form hands back every field, including the ones the user cleared —
    // dropping the empty ones keeps the YAML free of `name: ""` noise.
    const patch = ev.detail.value as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...items[index], ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v === "" || v === undefined || v === null) delete merged[k];
    }
    items[index] = merged as unknown as SupplyItemConfig;
    this._emit({ ...this._config, items });
  }

  private _itemColorChanged(index: number, value: string): void {
    if (!this._config) return;
    const items = [...this._items];
    const { color: _removed, ...rest } = items[index];
    items[index] = value ? { ...rest, color: value } : (rest as SupplyItemConfig);
    this._emit({ ...this._config, items });
  }

  private _addItem(): void {
    if (!this._config) return;
    this._emit({ ...this._config, items: [...this._items, { entity: "" }] });
  }

  private _removeItem(index: number): void {
    if (!this._config) return;
    this._emit({ ...this._config, items: this._items.filter((_, i) => i !== index) });
  }

  // ---- plain fields -----------------------------------------------------

  private _displaySchema(): SchemaEntry[] {
    const heroOptions = [
      { value: "", label: this._t("editor_supply_hero_auto") },
      ...this._items
        .filter((i) => i.entity)
        .map((i) => ({
          value: i.entity,
          label: i.name ?? this.hass?.states[i.entity]?.attributes.friendly_name ?? i.entity,
        })),
    ];
    return [
      {
        name: "layout",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "hero_and_list", label: this._t("editor_supply_layout_hero_and_list") },
              { value: "list_only", label: this._t("editor_supply_layout_list_only") },
              { value: "hero_only", label: this._t("editor_supply_layout_hero_only") },
            ],
          },
        },
      },
      { name: "hero", selector: { select: { mode: "dropdown", options: heroOptions } } },
      {
        name: "list_tap_action",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "hero", label: this._t("editor_supply_list_tap_hero") },
              { value: "more-info", label: this._t("editor_supply_list_tap_more_info") },
            ],
          },
        },
      },
      {
        name: "refill_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "set", label: this._t("editor_supply_refill_set") },
              { value: "add", label: this._t("editor_supply_refill_add") },
            ],
          },
        },
      },
    ];
  }

  private _rangeSchema(): SchemaEntry[] {
    return [
      { name: "rate_window", selector: { number: { min: 1, max: 365, mode: "box" } } },
      { name: "usage_per_week", selector: { number: { min: 0, max: 999, step: 0.5, mode: "box" } } },
    ];
  }

  private _shoppingSchema(): SchemaEntry[] {
    return [
      { name: "todo_entity", selector: { entity: { domain: "todo" } } },
      { name: "auto_add_to_list", selector: { boolean: {} } },
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
    const mode = this._config?.notify_mode ?? "daily";
    const schema: SchemaEntry[] = [
      notifyServiceSchema(this.hass),
      {
        name: "notify_level",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "empty", label: this._t("editor_supply_notify_level_empty") },
              { value: "critical", label: this._t("editor_supply_notify_level_critical") },
              { value: "low", label: this._t("editor_supply_notify_level_low") },
            ],
          },
        },
      },
      {
        name: "notify_items",
        selector: {
          select: {
            mode: "dropdown",
            multiple: true,
            options: this._items
              .filter((i) => i.entity)
              .map((i) => ({
                value: i.entity,
                label:
                  i.name ??
                  (this.hass?.states[i.entity]?.attributes.friendly_name as string | undefined) ??
                  i.entity,
              })),
          },
        },
      },
      notifyModeSchema([
        { value: "daily", label: this._t("editor_supply_notify_mode_daily") },
        { value: "weekly", label: this._t("editor_supply_notify_mode_weekly") },
        { value: "on_change", label: this._t("editor_supply_notify_mode_on_change") },
      ]),
    ];
    if (mode !== "on_change") schema.push(notifyTimeSchema());
    if (mode === "weekly") schema.push(notifyWeekdaySchema(this._language));
    schema.push(notifyTitleSchema(), notifyMessageSchema());
    return schema;
  }

  // Turning it on runs the full setup; turning it off pauses the automation
  // rather than deleting it, so the wording survives a toggle round-trip.
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

  /** entity id, display name, shopping text and the count it must fall to. */
  private _notifyTargets(): { e: string; n: string; s: string; l: number }[] {
    const level = this._config?.notify_level ?? "empty";
    // An empty selection means "every supply" rather than "none": that is the
    // useful default, and it keeps configs written before this option existed
    // behaving exactly as they did.
    const only = this._config?.notify_items ?? [];
    return this._items
      .filter((item) => item.entity && this.hass?.states[item.entity])
      .filter((item) => only.length === 0 || only.includes(item.entity))
      .map((item) => {
        const st = this.hass!.states[item.entity];
        const packSize = supplyPackSize(item, st);
        const name = item.name ?? (st.attributes.friendly_name as string | undefined) ?? item.entity;
        return {
          e: item.entity,
          n: name,
          s: item.shopping_item?.trim() || name,
          l: supplyNotifyLimit(level, supplyLimits(packSize, item)),
        };
      });
  }

  // Appends the item(s) to the configured todo list. Reads the list first and
  // only adds what is missing: todo.add_item happily creates duplicates, and a
  // daily reminder would otherwise pile up one copy per day. `if/then` rather
  // than a bare condition — a failing condition inside `repeat` aborts the
  // whole loop instead of skipping one entry.
  private _todoActions(itemsExpr: string): Record<string, unknown>[] {
    const todo = this._config?.todo_entity;
    if (!todo || !this._config?.auto_add_to_list) return [];
    return [
      {
        action: "todo.get_items",
        target: { entity_id: todo },
        data: { status: "needs_action" },
        response_variable: "vorhandene",
      },
      {
        repeat: {
          for_each: itemsExpr,
          sequence: [
            {
              if: [
                {
                  condition: "template",
                  value_template:
                    `{{ repeat.item not in (vorhandene['${todo}']['items']` +
                    ` | map(attribute='summary') | list) }}`,
                },
              ],
              then: [
                {
                  action: "todo.add_item",
                  target: { entity_id: todo },
                  data: { item: "{{ repeat.item }}" },
                },
              ],
            },
          ],
        },
      },
    ];
  }

  private async _setupNotify(): Promise<void> {
    const cfg = this._config;
    if (!this.hass || !cfg) return;
    const targets = cfg.notify_service ?? [];
    if (targets.length === 0) {
      this._notifyStatus = "error";
      this._notifyDetail = this._t("editor_supply_notify_missing");
      return;
    }
    this._notifyBusy = true;
    this._notifyStatus = "idle";
    this._notifyDetail = "";
    try {
      const items = this._notifyTargets();
      if (items.length === 0) throw new Error("no supply entities");
      const mode = cfg.notify_mode ?? "daily";
      const cardName = cfg.name || this._t("supply_notify_default_title");
      const automationId = resolveAutomationId("supply_low", cfg.notify_automation_id);

      const base = {
        alias: `${cardName}: ${this._t("editor_supply_notify_alias")}`,
        description: this._t("editor_supply_notify_description"),
        mode: "single",
      };

      let automation: Record<string, unknown>;
      if (mode === "on_change") {
        // numeric_state fires on `value < below`, so the limit is nudged by
        // half a unit to mean "at or below" for countable supplies. Items are
        // grouped by limit so each distinct threshold needs only one trigger.
        const byLimit = new Map<number, string[]>();
        for (const it of items) byLimit.set(it.l, [...(byLimit.get(it.l) ?? []), it.e]);
        const triggers = [...byLimit.entries()].map(([limit, ids]) => ({
          trigger: "numeric_state",
          entity_id: ids,
          below: limit + 0.5,
        }));
        const names = Object.fromEntries(items.map((it) => [it.e, it.n]));
        const shopping = Object.fromEntries(items.map((it) => [it.e, it.s]));
        automation = {
          ...base,
          // Wrapped in a template on purpose: Home Assistant renders
          // `variables` and parses the result, so `{{ {...} }}` arrives as a
          // real dict. A bare JSON string stays a string and `.get(...)` then
          // fails on every run.
          variables: {
            supply_names: `{{ ${JSON.stringify(names)} }}`,
            shopping_names: `{{ ${JSON.stringify(shopping)} }}`,
          },
          triggers,
          conditions: [],
          actions: notifyActions(
            targets,
            cardName,
            `{{ supply_names.get(s.entity_id, s.name) }} ${this._t("editor_supply_notify_single")}`,
            {
              title: cfg.notify_title,
              message: cfg.notify_message,
              // A supply that already meets the limit makes the better sample
              // for a hand-run than one that is perfectly well stocked.
              prelude: triggerStatePrelude(
                notifySampleEntity(
                  this.hass,
                  items.map((it) => it.e),
                  (st) => {
                    const hit = items.find((it) => it.e === st.entity_id);
                    return !!hit && Number(st.state) <= hit.l;
                  },
                ),
              ),
              tokens: {
                vorrat: "{{ supply_names.get(s.entity_id, s.name) }}",
                rest: "{{ s.state }}",
              },
            },
          ).concat(
            this._todoActions("{{ [shopping_names.get(s.entity_id, s.name)] }}"),
          ),
        };
      } else {
        // One evening digest listing everything that ran out, so five empty
        // supplies do not turn into five separate pushes.
        // `field` picks which text each entry contributes: `n` is the display
        // name used in the message, `s` the shopping text used for the list, so
        // the notification can stay readable while the list entry says whatever
        // the user wants to see in the shop.
        const collect = (field: "n" | "s") =>
          `{% set items = ${JSON.stringify(items)} %}` +
          `{% set ns = namespace(items=[]) %}` +
          `{% for it in items %}{% set s = states[it.e] %}` +
          `{% if s is not none and s.state not in ['unknown', 'unavailable'] %}` +
          `{% if s.state | float(1e9) <= it.l %}` +
          `{% set ns.items = ns.items + [it.${field}] %}` +
          `{% endif %}{% endif %}{% endfor %}` +
          `{{ ns.items }}`;
        const listTemplate = collect("n");
        const shoppingTemplate = collect("s");
        automation = {
          ...base,
          variables: { leere_vorraete: listTemplate, einkauf_items: shoppingTemplate },
          triggers: [{ trigger: "time", at: cfg.notify_time || "18:00:00" }],
          conditions: [
            ...(mode === "weekly"
              ? [{ condition: "time", weekday: [cfg.notify_weekday || "mon"] }]
              : []),
            { condition: "template", value_template: "{{ leere_vorraete | count > 0 }}" },
          ],
          actions: notifyActions(
            targets,
            cardName,
            `{{ leere_vorraete | count }} ${this._t("editor_supply_notify_digest")}\n• {{ leere_vorraete | join('\n• ') }}`,
            {
              title: cfg.notify_title,
              message: cfg.notify_message,
              tokens: {
                anzahl: "{{ leere_vorraete | count }}",
                liste: "{{ leere_vorraete | join(', ') }}",
              },
            },
          ).concat(this._todoActions("{{ einkauf_items }}")),
        };
      }

      await saveNotifyAutomation(this.hass, { id: automationId, ...automation } as NotifyAutomationSpec);
      if (cfg.notify_automation_id !== automationId) {
        this._emit({ ...this._config!, notify_automation_id: automationId });
      }
      await setAutomationEnabled(this.hass, automationId, true);
      this._notifyStatus = "success";
      this._notifyDetail = `${items.length}`;
    } catch (e) {
      this._notifyStatus = "error";
      this._notifyDetail = e instanceof Error ? e.message : String(e);
    } finally {
      this._notifyBusy = false;
    }
  }

  // A counter's `maximum` is a hard ceiling, not a label: Home Assistant
  // refuses to store a higher value. Configuring a pack larger than that
  // would make "pack refilled" silently stop at the helper's own limit, so
  // the mismatch is called out where it is created instead of showing up as
  // a refill that quietly does the wrong thing.
  private _packSizeWarning(item: SupplyItemConfig) {
    const st = item.entity ? this.hass?.states[item.entity] : undefined;
    if (!st || !item.pack_size) return nothing;
    const max = (st.attributes.maximum ?? st.attributes.max) as number | undefined;
    if (typeof max !== "number" || item.pack_size <= max) return nothing;
    return html`<div class="notify-blocked">
      ${this._t("editor_supply_pack_size_warning")
        .replaceAll("{pack}", String(item.pack_size))
        .replaceAll("{max}", String(max))}
    </div>`;
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      entity: "editor_supply_item_entity",
      name: "editor_name",
      icon: "editor_icon",
      pack_size: "editor_supply_pack_size",
      unit: "editor_supply_unit",
      low_threshold: "editor_supply_low_threshold",
      critical_threshold: "editor_supply_critical_threshold",
      shopping_item: "editor_supply_shopping_item",
      layout: "editor_supply_layout",
      hero: "editor_supply_hero",
      list_tap_action: "editor_supply_list_tap",
      refill_mode: "editor_supply_refill_mode",
      rate_window: "editor_supply_rate_window",
      usage_per_week: "editor_supply_usage_per_week",
      todo_entity: "editor_supply_todo_entity",
      auto_add_to_list: "editor_supply_auto_add",
      notify_service: "editor_notify_service",
      notify_level: "editor_supply_notify_level",
      notify_items: "editor_supply_notify_items",
      notify_mode: "editor_supply_notify_mode",
      notify_time: "editor_notify_time",
      notify_weekday: "editor_notify_weekday",
      notify_title: "editor_notify_title",
      notify_message: "editor_notify_message",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = ev.detail.value as Record<string, unknown>;
    const next: Record<string, unknown> = { ...this._config, ...patch };
    // An empty hero selection means "automatic", which is the absence of the
    // key rather than an empty string.
    if (next.hero === "") delete next.hero;
    this._emit(next as unknown as M3SupplyCardConfig);
  }

  private _colorChanged(
    field:
      | "ok_color"
      | "low_color"
      | "critical_color"
      | "unavailable_color"
      | "text_color"
      | "secondary_text_color"
      | "card_background",
    value: string,
  ): void {
    if (!this._config) return;
    if (value) {
      this._emit({ ...this._config, [field]: value });
    } else {
      const { [field]: _removed, ...rest } = this._config;
      this._emit(rest as M3SupplyCardConfig);
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
      this._emit(rest as M3SupplyCardConfig);
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

    const displayData = {
      layout: this._config.layout ?? "hero_and_list",
      hero: typeof this._config.hero === "string" ? this._config.hero : "",
      list_tap_action: this._config.list_tap_action ?? "hero",
      refill_mode: this._config.refill_mode ?? "set",
    };
    const rangeData = {
      rate_window: this._config.rate_window ?? SUPPLY_DEFAULT_RATE_WINDOW_DAYS,
      usage_per_week: this._config.usage_per_week,
    };
    const shoppingData = {
      todo_entity: this._config.todo_entity,
      auto_add_to_list: this._config.auto_add_to_list ?? false,
    };
    const animationData = { animation: this._config.animation ?? "auto" };
    const notifyData = {
      notify_service: this._config.notify_service ?? [],
      notify_level: this._config.notify_level ?? "empty",
      notify_items: this._config.notify_items ?? [],
      notify_mode: this._config.notify_mode ?? "daily",
      notify_time: this._config.notify_time ?? "18:00:00",
      notify_weekday: this._config.notify_weekday ?? "mon",
      notify_title: this._config.notify_title,
      notify_message: this._config.notify_message,
    };
    const digest = (this._config.notify_mode ?? "daily") !== "on_change";

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_supply_items")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:package-variant-closed"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_supply_item_entity_helper")}</div>
            ${this._items.map(
              (item, index) => html`
                <div class="item-block">
                  <ha-form
                    .hass=${this.hass}
                    .data=${item}
                    .schema=${this._itemSchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${(ev: CustomEvent) => this._itemChanged(index, ev)}
                  ></ha-form>
                  ${this._packSizeWarning(item)}
                  ${colorRow(this._t("editor_supply_item_color"), item.color, (v) =>
                    this._itemColorChanged(index, v),
                  )}
                  <ha-button
                    class="remove"
                    @click=${() => this._removeItem(index)}
                    >${this._t("editor_supply_remove_item")}</ha-button
                  >
                </div>
              `,
            )}
            <ha-button raised @click=${this._addItem}
              >${this._t("editor_supply_add_item")}</ha-button
            >
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

        <ha-expansion-panel outlined .header=${this._t("editor_supply_range")}>
          <ha-icon slot="leading-icon" icon="mdi:calendar-clock"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${rangeData}
              .schema=${this._rangeSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_supply_rate_window_helper")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_supply_notify")}>
          <ha-icon slot="leading-icon" icon="mdi:bell-outline"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_supply_notify_hint")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${notifyData}
              .schema=${this._notifySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">
              ${notifyTokenHint(
                this._language,
                digest ? ["anzahl", "liste"] : ["vorrat", "rest"],
              )}
            </div>
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
                : this._t("editor_supply_notify_missing"),
              successText: `${this._t("editor_supply_notify_success_prefix")} ${this._notifyDetail} ${this._t("editor_supply_notify_success_suffix")}`,
              onToggle: (on) => this._toggleNotify(on),
              onSetup: () => this._setupNotify(),
            })}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_supply_shopping")}>
          <ha-icon slot="leading-icon" icon="mdi:cart-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${shoppingData}
              .schema=${this._shoppingSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_supply_ok_color"), this._config.ok_color, (v) => this._colorChanged("ok_color", v))}
            ${colorRow(this._t("editor_supply_low_color"), this._config.low_color, (v) => this._colorChanged("low_color", v))}
            ${colorRow(this._t("editor_supply_critical_color"), this._config.critical_color, (v) => this._colorChanged("critical_color", v))}
            ${colorRow(this._t("editor_supply_unavailable_color"), this._config.unavailable_color, (v) => this._colorChanged("unavailable_color", v))}
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
          defaultRadius: DEFAULT_SUPPLY_RADIUS,
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
    "m3-supply-card-editor": M3SupplyCardEditor;
  }
}
