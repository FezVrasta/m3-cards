import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3StatusCardConfig,
  M3StatusItemConfig,
  StatusRule,
} from "./types";
import { DEFAULT_STATUS_RADIUS, STATUS_TREND_DEFAULT_HOURS } from "./const";
import { localize, type TranslationKey } from "./localize";
import {
  colorRow,
  editorStyles,
  fireEvent,
  type SchemaEntry,
} from "./shared/editor-helpers";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

/** Which single condition a rule carries, derived from the keys it has. */
type ConditionKind = "value" | "regex" | "above" | "below" | "else";

const CONDITION_KEYS: Record<Exclude<ConditionKind, "else">, keyof StatusRule> = {
  value: "value",
  regex: "regex",
  above: "above",
  below: "below",
};

@customElement("m3-status-card-editor")
export class M3StatusCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3StatusCardConfig;
  @state() private _appearance: AppearanceState = {
    showCustomRadius: false,
    showCorners: false,
    cornerCustom: {},
  };

  public setConfig(config: M3StatusCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_STATUS_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private get _items(): M3StatusItemConfig[] {
    return this._config?.items ?? [];
  }

  private _emit(config: M3StatusCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private _patchItem(index: number, patch: Partial<M3StatusItemConfig>): void {
    if (!this._config) return;
    const items = [...this._items];
    const merged: Record<string, unknown> = { ...items[index], ...patch };
    // A field the user cleared is an absent key, not an empty string — the
    // card's own defaults only apply when the key is missing.
    for (const [k, v] of Object.entries(merged)) {
      if (v === "" || v === undefined || v === null) delete merged[k];
    }
    items[index] = merged as M3StatusItemConfig;
    this._emit({ ...this._config, items });
  }

  private _itemLabel(item: M3StatusItemConfig, index: number): string {
    return (
      item.name ??
      (item.entity
        ? ((this.hass?.states[item.entity]?.attributes.friendly_name as string | undefined) ??
          item.entity)
        : `#${index + 1}`)
    );
  }

  // ---- items ---------------------------------------------------------------

  private _itemSchema(): SchemaEntry[] {
    return [
      { name: "entity", selector: { entity: {} } },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "attribute", selector: { text: {} } },
      { name: "unit", selector: { text: {} } },
      { name: "prefix", selector: { text: {} } },
      { name: "suffix", selector: { text: {} } },
      { name: "decimals", selector: { number: { min: 0, max: 4, mode: "box" } } },
      { name: "secondary", selector: { text: {} } },
      { name: "tap_action", selector: { ui_action: {} } },
    ];
  }

  private _addItem(): void {
    if (!this._config) return;
    this._emit({ ...this._config, items: [...this._items, {}] });
  }

  private _removeItem(index: number): void {
    if (!this._config) return;
    this._emit({ ...this._config, items: this._items.filter((_, i) => i !== index) });
  }

  // ---- rules ---------------------------------------------------------------

  private _rules(index: number): StatusRule[] {
    return this._items[index]?.states ?? [];
  }

  private _setRules(index: number, rules: StatusRule[]): void {
    this._patchItem(index, { states: rules.length ? rules : undefined });
  }

  private _conditionKind(rule: StatusRule): ConditionKind {
    for (const kind of ["value", "regex", "above", "below"] as const) {
      if (rule[CONDITION_KEYS[kind]] !== undefined) return kind;
    }
    return "else";
  }

  private _conditionChanged(itemIndex: number, ruleIndex: number, kind: ConditionKind): void {
    const rules = [...this._rules(itemIndex)];
    const rule = { ...rules[ruleIndex] };
    // Exactly one condition key survives a switch. Leaving the old one behind
    // would make the rule match on something the editor no longer shows.
    for (const key of Object.values(CONDITION_KEYS)) delete rule[key];
    if (kind === "value" || kind === "regex") (rule as Record<string, unknown>)[kind] = "";
    else if (kind !== "else") (rule as Record<string, unknown>)[kind] = 0;
    rules[ruleIndex] = rule;
    this._setRules(itemIndex, rules);
  }

  private _ruleChanged(itemIndex: number, ruleIndex: number, ev: CustomEvent): void {
    const rules = [...this._rules(itemIndex)];
    const patch = ev.detail.value as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...rules[ruleIndex], ...patch };
    for (const [k, v] of Object.entries(merged)) {
      // `above: 0` and `below: 0` are meaningful, so only blanks are dropped.
      if (v === "" || v === undefined || v === null) delete merged[k];
    }
    rules[ruleIndex] = merged as StatusRule;
    this._setRules(itemIndex, rules);
  }

  private _ruleColorChanged(itemIndex: number, ruleIndex: number, value: string): void {
    const rules = [...this._rules(itemIndex)];
    const { color: _drop, ...rest } = rules[ruleIndex];
    rules[ruleIndex] = value ? { ...rest, color: value } : (rest as StatusRule);
    this._setRules(itemIndex, rules);
  }

  private _addRule(itemIndex: number): void {
    this._setRules(itemIndex, [...this._rules(itemIndex), { value: "" }]);
  }

  private _removeRule(itemIndex: number, ruleIndex: number): void {
    this._setRules(
      itemIndex,
      this._rules(itemIndex).filter((_, i) => i !== ruleIndex),
    );
  }

  private _ruleSchema(kind: ConditionKind): SchemaEntry[] {
    const condition: SchemaEntry[] =
      kind === "value"
        ? [{ name: "value", selector: { text: {} } }]
        : kind === "regex"
          ? [{ name: "regex", selector: { text: {} } }]
          : kind === "above"
            ? [{ name: "above", selector: { number: { mode: "box", step: "any" } } }]
            : kind === "below"
              ? [{ name: "below", selector: { number: { mode: "box", step: "any" } } }]
              : [];
    return [
      ...condition,
      { name: "label", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
    ];
  }

  private _presetSchema(): SchemaEntry[] {
    return [
      {
        name: "preset",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "", label: this._t("editor_status_preset_none") },
              { value: "yes_no", label: this._t("editor_status_preset_yes_no") },
              { value: "on_off", label: this._t("editor_status_preset_on_off") },
              { value: "ok_problem", label: this._t("editor_status_preset_ok_problem") },
              { value: "open_closed", label: this._t("editor_status_preset_open_closed") },
              { value: "traffic", label: this._t("editor_status_preset_traffic") },
            ],
          },
        },
      },
    ];
  }

  // ---- trend ---------------------------------------------------------------

  private _trendSchema(item: M3StatusItemConfig): SchemaEntry[] {
    const schema: SchemaEntry[] = [{ name: "trend", selector: { boolean: {} } }];
    if (item.trend) {
      schema.push(
        { name: "trend_hours", selector: { number: { min: 1, max: 720, mode: "box" } } },
        { name: "trend_inverted", selector: { boolean: {} } },
      );
    }
    return schema;
  }

  // ---- card-level fields ---------------------------------------------------

  private _displaySchema(): SchemaEntry[] {
    return [
      { name: "title", selector: { text: {} } },
      {
        name: "layout",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: this._t("editor_status_layout_auto") },
              { value: "hero", label: this._t("editor_status_layout_hero") },
              { value: "grid", label: this._t("editor_status_layout_grid") },
              { value: "row", label: this._t("editor_status_layout_row") },
            ],
          },
        },
      },
      { name: "columns", selector: { number: { min: 0, max: 6, mode: "box" } } },
      {
        name: "hero_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "inline", label: this._t("editor_status_hero_inline") },
              { value: "badge", label: this._t("editor_status_hero_badge") },
            ],
          },
        },
      },
      { name: "value_size", selector: { number: { min: 0, max: 72, mode: "box" } } },
      { name: "glass_background", selector: { boolean: {} } },
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

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = ev.detail.value as Record<string, unknown>;
    const next: Record<string, unknown> = { ...this._config, ...patch };
    // 0 is this editor's spelling of "automatic" for both of these, because a
    // number selector cannot offer an empty state.
    if (next.columns === 0) delete next.columns;
    if (next.value_size === 0) next.value_size = "auto";
    if (next.title === "") delete next.title;
    this._emit(next as unknown as M3StatusCardConfig);
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
      this._emit(rest as M3StatusCardConfig);
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
      this._emit(rest as M3StatusCardConfig);
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

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      entity: "editor_entity",
      name: "editor_name",
      icon: "editor_icon",
      attribute: "editor_status_attribute",
      unit: "editor_status_unit",
      prefix: "editor_status_prefix",
      suffix: "editor_status_suffix",
      decimals: "editor_status_decimals",
      secondary: "editor_status_secondary",
      tap_action: "editor_tap_action",
      preset: "editor_status_preset",
      value: "editor_status_rule_value",
      regex: "editor_status_rule_regex",
      above: "editor_status_rule_above",
      below: "editor_status_rule_below",
      label: "editor_status_rule_label",
      title: "editor_status_title",
      layout: "editor_status_layout",
      columns: "editor_status_columns",
      hero_style: "editor_status_hero_style",
      value_size: "editor_status_value_size",
      glass_background: "editor_glass_background",
      animation: "editor_progress_animation",
      trend: "editor_status_trend",
      trend_hours: "editor_status_trend_hours",
      trend_inverted: "editor_status_trend_inverted",
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const displayData = {
      title: this._config.title ?? "",
      layout: this._config.layout ?? "auto",
      columns: this._config.columns ?? 0,
      hero_style: this._config.hero_style ?? "inline",
      value_size:
        typeof this._config.value_size === "number" ? this._config.value_size : 0,
      glass_background: this._config.glass_background ?? true,
    };
    const animationData = { animation: this._config.animation ?? "auto" };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_status_items")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:format-list-numbered"></ha-icon>
          <div class="panel-content">
            ${this._items.map(
              (item, index) => html`
                <div class="item-block">
                  <ha-form
                    .hass=${this.hass}
                    .data=${item}
                    .schema=${this._itemSchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${(ev: CustomEvent) =>
                      this._patchItem(index, ev.detail.value as Partial<M3StatusItemConfig>)}
                  ></ha-form>
                  ${colorRow(this._t("editor_mode_color"), item.color, (v) =>
                    this._patchItem(index, { color: v }),
                  )}
                  <ha-button class="remove" @click=${() => this._removeItem(index)}
                    >${this._t("editor_status_remove_item")}</ha-button
                  >
                </div>
              `,
            )}
            <ha-button raised @click=${this._addItem}
              >${this._t("editor_status_add_item")}</ha-button
            >
          </div>
        </ha-expansion-panel>

        ${this._items.length
          ? html`
              <ha-expansion-panel outlined .header=${this._t("editor_status_states")}>
                <ha-icon slot="leading-icon" icon="mdi:swap-horizontal"></ha-icon>
                <div class="panel-content">
                  <div class="hint">${this._t("editor_status_rules_hint")}</div>
                  ${this._items.map(
                    (item, index) => html`
                      <ha-expansion-panel outlined .header=${this._itemLabel(item, index)}>
                        <div class="panel-content">
                          <ha-form
                            .hass=${this.hass}
                            .data=${{ preset: item.preset ?? "" }}
                            .schema=${this._presetSchema()}
                            .computeLabel=${this._computeLabel}
                            @value-changed=${(ev: CustomEvent) =>
                              this._patchItem(index, {
                                preset: (ev.detail.value as { preset?: string }).preset as
                                  | M3StatusItemConfig["preset"]
                                  | undefined,
                              })}
                          ></ha-form>
                          ${this._rules(index).map((rule, ruleIndex) => {
                            const kind = this._conditionKind(rule);
                            return html`
                              <div class="rule-block">
                                <ha-select
                                  .label=${this._t("editor_status_rule_condition")}
                                  .value=${kind}
                                  naturalMenuWidth
                                  @selected=${(ev: Event) =>
                                    this._conditionChanged(
                                      index,
                                      ruleIndex,
                                      (ev.target as HTMLSelectElement).value as ConditionKind,
                                    )}
                                  @closed=${(ev: Event) => ev.stopPropagation()}
                                >
                                  <mwc-list-item value="value"
                                    >${this._t("editor_status_rule_value")}</mwc-list-item
                                  >
                                  <mwc-list-item value="regex"
                                    >${this._t("editor_status_rule_regex")}</mwc-list-item
                                  >
                                  <mwc-list-item value="above"
                                    >${this._t("editor_status_rule_above")}</mwc-list-item
                                  >
                                  <mwc-list-item value="below"
                                    >${this._t("editor_status_rule_below")}</mwc-list-item
                                  >
                                  <mwc-list-item value="else"
                                    >${this._t("editor_status_preset_none")}</mwc-list-item
                                  >
                                </ha-select>
                                <ha-form
                                  .hass=${this.hass}
                                  .data=${rule}
                                  .schema=${this._ruleSchema(kind)}
                                  .computeLabel=${this._computeLabel}
                                  @value-changed=${(ev: CustomEvent) =>
                                    this._ruleChanged(index, ruleIndex, ev)}
                                ></ha-form>
                                ${colorRow(this._t("editor_mode_color"), rule.color, (v) =>
                                  this._ruleColorChanged(index, ruleIndex, v),
                                )}
                                <ha-button
                                  class="remove"
                                  @click=${() => this._removeRule(index, ruleIndex)}
                                  >${this._t("editor_status_remove_item")}</ha-button
                                >
                              </div>
                            `;
                          })}
                          <ha-button raised @click=${() => this._addRule(index)}
                            >${this._t("editor_status_add_rule")}</ha-button
                          >
                        </div>
                      </ha-expansion-panel>
                    `,
                  )}
                </div>
              </ha-expansion-panel>
            `
          : nothing}

        <ha-expansion-panel outlined .header=${this._t("editor_status_display")}>
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

        ${this._items.some((i) => i.entity)
          ? html`
              <ha-expansion-panel outlined .header=${this._t("editor_status_trend_section")}>
                <ha-icon slot="leading-icon" icon="mdi:trending-up"></ha-icon>
                <div class="panel-content">
                  ${this._items.map((item, index) =>
                    item.entity
                      ? html`
                          <div class="item-block">
                            <div class="hint">${this._itemLabel(item, index)}</div>
                            <ha-form
                              .hass=${this.hass}
                              .data=${{
                                trend: item.trend ?? false,
                                trend_hours: item.trend_hours ?? STATUS_TREND_DEFAULT_HOURS,
                                trend_inverted: item.trend_inverted ?? false,
                              }}
                              .schema=${this._trendSchema(item)}
                              .computeLabel=${this._computeLabel}
                              @value-changed=${(ev: CustomEvent) =>
                                this._patchItem(
                                  index,
                                  ev.detail.value as Partial<M3StatusItemConfig>,
                                )}
                            ></ha-form>
                          </div>
                        `
                      : nothing,
                  )}
                </div>
              </ha-expansion-panel>
            `
          : nothing}

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_clock_accent_color"), this._config.accent_color, (v) =>
              this._colorChanged("accent_color", v),
            )}
            ${colorRow(this._t("editor_progress_text_color"), this._config.text_color, (v) =>
              this._colorChanged("text_color", v),
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
          <ha-icon slot="leading-icon" icon="mdi:wave"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${animationData}
              .schema=${this._animationSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">
              ${this._t("editor_progress_animation_reduced_motion_hint")}
            </div>
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: this._config,
          defaultRadius: DEFAULT_STATUS_RADIUS,
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
      .item-block,
      .rule-block {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        border: 1px solid rgba(127, 127, 127, 0.3);
        border-radius: 12px;
      }

      .rule-block {
        border-style: dashed;
      }

      ha-select {
        width: 100%;
      }

      .remove {
        align-self: flex-end;
        --mdc-theme-primary: var(--error-color, #e57368);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-status-card-editor": M3StatusCardEditor;
  }
}
