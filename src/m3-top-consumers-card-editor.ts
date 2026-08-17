import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3TopConsumersCardConfig } from "./types";
import { DEFAULT_TOP_CONSUMERS_RADIUS, DEFAULT_TOP_CONSUMERS_COUNT, TOP_CONSUMERS_MIN_COUNT, TOP_CONSUMERS_MAX_COUNT } from "./const";
import { localize, type TranslationKey } from "./localize";
import {
  fireEvent,
  colorRow,
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
import { getEntityPlatform } from "./shared/ha-registry";
import {
  notifyServiceSchema,
  notifyModeSchema,
  notifyTimeSchema,
  notifyWeekdaySchema,
  notifyTokenHint,
  renderNotifyControls,
  setAutomationEnabled,
  notifyStyles,
  notifyTitleSchema,
  notifyMessageSchema,
  saveNotifyAutomation,
  resolveAutomationId,
  notifyActions,
  type NotifyAutomationSpec,
  meterCycle,
} from "./shared/notify-editor";

// Why the weekly digest is gated so tightly:
//
// The card ranks devices from Home Assistant's *long-term statistics*
// (`recorder/statistics_during_period`, see shared/ha-statistics.ts) — a
// websocket call it makes at render time. An automation template has no
// equivalent: Jinja can read entity states and attributes, but it cannot sum
// statistics over a period. So for the general case (Energy-dashboard devices,
// or arbitrary total_increasing kWh sensors) a truthful "top consumers this
// week" ranking simply is not expressible in an automation, and faking it from
// live states would report a lifetime total or an instantaneous value as if it
// were a weekly one.
//
// The one case that *is* expressible: a `utility_meter` helper on a weekly
// cycle already holds exactly the value we want — its state is this cycle's
// consumption, and `last_period` is the previous completed week. Ranking those
// states in Jinja is honest. Everything else is refused with an explanation.
const WEEKLY_DIGEST_UNITS = new Set(["Wh", "kWh", "MWh"]);

type DigestEligibility = "checking" | "ok" | "source" | "empty" | "unsupported";

@customElement("m3-top-consumers-card-editor")
export class M3TopConsumersCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3TopConsumersCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };
  @state() private _eligibility: DigestEligibility = "checking";
  @state() private _unsupportedNames: string[] = [];
  @state() private _notifyBusy = false;
  @state() private _notifyStatus: "idle" | "success" | "error" = "idle";
  @state() private _notifyDetail = "";

  private _lastEligibilityKey?: string;

  public setConfig(config: M3TopConsumersCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_TOP_CONSUMERS_RADIUS);
    this._maybeCheckEligibility();
  }

  protected updated(): void {
    this._maybeCheckEligibility();
  }

  private _digestEntities(): string[] {
    if (!this._config || (this._config.source ?? "energy") !== "entities") return [];
    return (this._config.entities ?? []).map((e) => e.entity).filter(Boolean);
  }

  // Re-resolves whether the configured sensors can carry a weekly digest,
  // keyed on source + entity list so switching a colour doesn't re-hit the
  // entity registry.
  private _maybeCheckEligibility(): void {
    if (!this.hass || !this._config) return;
    const source = this._config.source ?? "energy";
    const ids = this._digestEntities();
    const key = JSON.stringify([source, ids]);
    if (key === this._lastEligibilityKey) return;
    this._lastEligibilityKey = key;
    this._unsupportedNames = [];
    if (source !== "entities") {
      this._eligibility = "source";
      return;
    }
    if (ids.length === 0) {
      this._eligibility = "empty";
      return;
    }
    this._eligibility = "checking";
    void this._checkEntities(ids, key);
  }

  private async _checkEntities(ids: string[], key: string): Promise<void> {
    const platforms = await Promise.all(ids.map((id) => getEntityPlatform(this.hass!, id)));
    if (key !== this._lastEligibilityKey) return; // config moved on while we waited
    const unsupported: string[] = [];
    ids.forEach((id, i) => {
      const state = this.hass!.states[id];
      const ok =
        platforms[i] === "utility_meter" &&
        meterCycle(this.hass, id) === "weekly" &&
        WEEKLY_DIGEST_UNITS.has(state?.attributes.unit_of_measurement);
      if (!ok) unsupported.push(state?.attributes.friendly_name ?? id);
    });
    this._unsupportedNames = unsupported;
    this._eligibility = unsupported.length ? "unsupported" : "ok";
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
    if (!this.hass || !cfg || this._eligibility !== "ok") return;
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
      const ids = this._digestEntities();
      const lastWeek = cfg.notify_mode === "last_week";
      const count = cfg.top_count ?? DEFAULT_TOP_CONSUMERS_COUNT;
      const cardName = cfg.name || this._t("top_consumers_default_name");
      const automationId = resolveAutomationId("top_consumers_digest", cfg.notify_automation_id);

      // Ranks the meters by their own cycle value (state = this week so far,
      // last_period = the previous completed week) and renders the numbered
      // lines the message joins. Mixed Wh/kWh/MWh meters are normalised to kWh
      // first so the ranking compares like with like.
      const valueExpr = lastWeek ? "s.attributes.last_period" : "s.state";
      const rankTemplate =
        `{% set ids = ${JSON.stringify(ids)} %}` +
        `{% set ns = namespace(items=[]) %}` +
        `{% for e in ids %}{% set s = states[e] %}` +
        `{% if s is not none %}` +
        `{% set u = s.attributes.unit_of_measurement | default('kWh', true) %}` +
        `{% set f = 0.001 if u == 'Wh' else (1000 if u == 'MWh' else 1) %}` +
        `{% set v = (${valueExpr} | float(0)) * f %}` +
        `{% if v > 0 %}{% set ns.items = ns.items + [{'n': s.name, 'v': v}] %}{% endif %}` +
        `{% endif %}{% endfor %}` +
        `{% set ranked = ns.items | sort(attribute='v', reverse=true) %}` +
        `{% set out = namespace(lines=[]) %}` +
        `{% for it in ranked[:${count}] %}` +
        `{% set out.lines = out.lines + [loop.index ~ '. ' ~ it.n ~ ' ' ~ (it.v | round(1)) ~ ' kWh'] %}` +
        `{% endfor %}{{ out.lines }}`;

      const intro = this._t(
        lastWeek
          ? "editor_top_consumers_notify_digest_last"
          : "editor_top_consumers_notify_digest_current",
      );

      const spec: NotifyAutomationSpec = {
        id: automationId,
        alias: `${cardName}: ${this._t("editor_top_consumers_notify_alias")}`,
        description: this._t("editor_top_consumers_notify_description"),
        mode: "single",
        variables: { top_items: rankTemplate },
        triggers: [{ trigger: "time", at: cfg.notify_time || "20:00:00" }],
        conditions: [
          { condition: "time", weekday: [cfg.notify_weekday || "sun"] },
          { condition: "template", value_template: "{{ top_items | count > 0 }}" },
        ],
        actions: notifyActions(targets, cardName, `${intro}\n{{ top_items | join('\n') }}`,
        { title: cfg.notify_title, message: cfg.notify_message, tokens: {
          anzahl: "{{ top_items | count }}",
          liste: "{{ top_items | join(', ') }}",
        } }),
      };

      await saveNotifyAutomation(this.hass, spec);
      if (cfg.notify_automation_id !== automationId) {
        this._config = { ...cfg, notify_automation_id: automationId };
        fireEvent(this, "config-changed", { config: this._config });
      }
      await setAutomationEnabled(this.hass, automationId, true);
      this._notifyStatus = "success";
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

  private _sourceSchema(): SchemaEntry[] {
    const schema: SchemaEntry[] = [
      {
        name: "source",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "energy", label: this._t("editor_top_consumers_source_energy") },
              { value: "entities", label: this._t("editor_top_consumers_source_entities") },
            ],
          },
        },
      },
    ];
    if (this._config?.source === "entities") {
      schema.push({
        name: "entities_flat",
        selector: { entity: { domain: "sensor", device_class: "energy", multiple: true } },
      });
    }
    schema.push({
      name: "period",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "today", label: this._t("editor_top_consumers_period_today") },
            { value: "yesterday", label: this._t("editor_top_consumers_period_yesterday") },
            { value: "week", label: this._t("editor_top_consumers_period_week") },
            { value: "month", label: this._t("editor_top_consumers_period_month") },
          ],
        },
      },
    });
    return schema;
  }

  private _contentSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "subtitle", selector: { text: {} } },
      {
        name: "unit_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "energy", label: this._t("editor_top_consumers_unit_mode_energy") },
              { value: "cost", label: this._t("editor_top_consumers_unit_mode_cost") },
            ],
          },
        },
      },
      { name: "top_count", selector: { number: { min: TOP_CONSUMERS_MIN_COUNT, max: TOP_CONSUMERS_MAX_COUNT, mode: "slider", step: 1 } } },
      {
        name: "rest_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "collapse", label: this._t("editor_top_consumers_rest_collapse") },
              { value: "hide", label: this._t("editor_top_consumers_rest_hide") },
              { value: "show_all", label: this._t("editor_top_consumers_rest_show_all") },
            ],
          },
        },
      },
    ];
  }

  private _priceSchema(): SchemaEntry[] {
    const schema: SchemaEntry[] = [
      {
        name: "price_source",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "energy_dashboard", label: this._t("editor_cost_price_source_energy_dashboard") },
              { value: "input_number", label: this._t("editor_cost_price_source_input_number") },
              { value: "fixed", label: this._t("editor_cost_price_source_fixed") },
            ],
          },
        },
      },
    ];
    const source = this._config?.price_source ?? "energy_dashboard";
    if (source === "input_number") {
      schema.push({ name: "price_entity", selector: { entity: { domain: "input_number" } } });
    }
    if (source === "fixed") {
      schema.push({ name: "price", selector: { number: { min: 0, step: 0.001, mode: "box" } } });
      schema.push({
        name: "price_unit",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "eur_per_kwh", label: this._t("editor_cost_price_unit_eur") },
              { value: "ct_per_kwh", label: this._t("editor_cost_price_unit_ct") },
            ],
          },
        },
      });
    }
    schema.push({ name: "currency", selector: { text: {} } });
    return schema;
  }

  private _notifySchema(): SchemaEntry[] {
    return [
      notifyServiceSchema(this.hass),
      notifyModeSchema([
        { value: "current", label: this._t("editor_top_consumers_notify_mode_current") },
        { value: "last_week", label: this._t("editor_top_consumers_notify_mode_last") },
      ]),
      notifyTimeSchema(),
      notifyWeekdaySchema(this._language),
      notifyTitleSchema("notify_title"),
      notifyMessageSchema("notify_message"),
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
      source: "editor_top_consumers_source",
      entities_flat: "editor_top_consumers_entities",
      period: "editor_top_consumers_period",
      name: "editor_name",
      icon: "editor_icon",
      subtitle: "editor_energy_subtitle",
      top_count: "editor_top_consumers_top_count",
      rest_mode: "editor_top_consumers_rest_mode",
      unit_mode: "editor_top_consumers_unit_mode",
      price_source: "editor_cost_price_source",
      price_entity: "editor_cost_price_entity",
      price: "editor_cost_price",
      price_unit: "editor_cost_price_unit",
      currency: "editor_cost_currency",
      notify_service: "editor_notify_service",
      notify_title: "editor_notify_title",
      notify_message: "editor_notify_message",
      notify_mode: "editor_notify_mode",
      notify_time: "editor_notify_time",
      notify_weekday: "editor_notify_weekday",
      animation: "editor_progress_animation",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _colorChanged(
    field: "accent_color" | "text_color" | "secondary_text_color" | "card_background",
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

  private _opacityChanged(field: "accent_opacity", value: number): void {
    if (!this._config) return;
    this._config = { ...this._config, [field]: value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _nameStripChanged(values: string[]): void {
    if (!this._config) return;
    this._config = { ...this._config, name_strip: values };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _paletteChanged(values: string[]): void {
    if (!this._config) return;
    this._config = { ...this._config, palette: values };
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

  // Names the exact reason the digest can't be built, so the user isn't left
  // guessing at a disabled button.
  private _blockedText(): string {
    switch (this._eligibility) {
      case "checking":
        return this._t("editor_top_consumers_notify_checking");
      case "source":
        return this._t("editor_top_consumers_notify_blocked_source");
      case "empty":
        return this._t("editor_top_consumers_notify_blocked_empty");
      default: {
        const shown = this._unsupportedNames.slice(0, 3).join(", ");
        const list = this._unsupportedNames.length > 3 ? `${shown} …` : shown;
        return this._t("editor_top_consumers_notify_blocked_unsupported").replace("{list}", list);
      }
    }
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const sourceData = {
      source: this._config.source ?? "energy",
      entities_flat: (this._config.entities ?? []).map((e) => e.entity),
      period: this._config.period ?? "today",
    };
    const contentData = {
      name: this._config.name,
      icon: this._config.icon,
      subtitle: this._config.subtitle,
      unit_mode: this._config.unit_mode ?? "energy",
      top_count: this._config.top_count ?? DEFAULT_TOP_CONSUMERS_COUNT,
      rest_mode: this._config.rest_mode ?? "collapse",
    };
    const priceData = {
      price_source: this._config.price_source ?? "energy_dashboard",
      price_entity: this._config.price_entity,
      price: this._config.price,
      price_unit: this._config.price_unit ?? "eur_per_kwh",
      currency: this._config.currency ?? "EUR",
    };
    const animationData = { animation: this._config.animation ?? "auto" };
    const notifyData = {
      notify_service: this._config.notify_service ?? [],
      notify_mode: this._config.notify_mode ?? "current",
      notify_time: this._config.notify_time ?? "20:00:00",
      notify_weekday: this._config.notify_weekday ?? "sun",
    };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_top_consumers_source_header")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:database"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${sourceData}
              .schema=${this._sourceSchema()}
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

        ${this._config.unit_mode === "cost"
          ? html`
              <ha-expansion-panel outlined .header=${this._t("editor_cost_price_section")}>
                <ha-icon slot="leading-icon" icon="mdi:cash-multiple"></ha-icon>
                <div class="panel-content">
                  <ha-form
                    .hass=${this.hass}
                    .data=${priceData}
                    .schema=${this._priceSchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${this._valueChanged}
                  ></ha-form>
                </div>
              </ha-expansion-panel>
            `
          : nothing}

        <ha-expansion-panel outlined .header=${this._t("editor_notify")}>
          <ha-icon slot="leading-icon" icon="mdi:bell-outline"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_top_consumers_notify_hint")}</div>
            ${this._eligibility === "ok"
              ? html`
                  <ha-form
                    .hass=${this.hass}
                    .data=${notifyData}
                    .schema=${this._notifySchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${this._valueChanged}
                  ></ha-form>
                  <div class="hint">${this._t("editor_top_consumers_notify_cycle_hint")}</div>
                `
              : nothing}
            <div class="hint">${notifyTokenHint(this._language, ["anzahl", "liste"])}</div>
            ${renderNotifyControls({
              hass: this.hass,
              enabled: this._config.notify_enabled ?? false,
              automationId: this._config.notify_automation_id,
              blockedReason: this._eligibility !== "ok"
                ? this._blockedText()
                : this._config.notify_service?.length
                  ? undefined
                  : this._t("editor_notify_missing"),
              language: this._language,
              busy: this._notifyBusy,
              status: this._notifyStatus,
              detail: this._notifyDetail,
              onToggle: (on) => this._toggleNotify(on),
              onSetup: () => this._setupNotify(),
            })}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_top_consumers_name_strip_header")}>
          <ha-icon slot="leading-icon" icon="mdi:format-letter-case"></ha-icon>
          <div class="panel-content">
            <div class="hint">${this._t("editor_top_consumers_name_strip_helper")}</div>
            ${listRow(
              this._t("editor_top_consumers_name_strip"),
              this._config.name_strip ?? [],
              (v) => this._nameStripChanged(v),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(
              this._t("editor_top_consumers_accent_color"),
              this._config.accent_color,
              (v) => this._colorChanged("accent_color", v),
              {
                label: this._t("editor_opacity"),
                value: this._config.accent_opacity,
                defaultValue: 18,
                onChange: (v) => this._opacityChanged("accent_opacity", v),
              },
            )}
            ${listRow(this._t("editor_top_consumers_palette"), this._config.palette ?? [], (v) => this._paletteChanged(v))}
            ${colorRow(this._t("editor_progress_text_color"), this._config.text_color, (v) => this._colorChanged("text_color", v))}
            ${colorRow(this._t("editor_progress_secondary_text_color"), this._config.secondary_text_color, (v) => this._colorChanged("secondary_text_color", v))}
            ${colorRow(this._t("editor_progress_card_background"), this._config.card_background, (v) => this._colorChanged("card_background", v))}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_animation")}>
          <ha-icon slot="leading-icon" icon="mdi:trophy-outline"></ha-icon>
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
          defaultRadius: DEFAULT_TOP_CONSUMERS_RADIUS,
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
      .hint.blocked {
        color: var(--warning-color, #ff9800);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-top-consumers-card-editor": M3TopConsumersCardEditor;
  }
}
