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

  static styles = editorStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-supply-card-editor": M3SupplyCardEditor;
  }
}
