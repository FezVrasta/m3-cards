import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3NavCardConfig,
  NavItemConfig,
  NavLayoutConfig,
  NavSheetItem,
  NavSubmenuEntry,
} from "./types";
import {
  NAV_DEFAULT_BREAKPOINT,
  NAV_SIZE_MAX,
  NAV_SIZE_MIN,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import {
  colorRow,
  editorStyles,
  fireEvent,
  type SchemaEntry,
} from "./shared/editor-helpers";

/** One view of the dashboard the card is being edited on. */
interface LovelaceViewLike {
  path?: string;
  title?: string;
  icon?: string;
}

@customElement("m3-nav-card-editor")
export class M3NavCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3NavCardConfig;

  public setConfig(config: M3NavCardConfig): void {
    this._config = config;
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private get _items(): NavItemConfig[] {
    return this._config?.items ?? [];
  }

  private _emit(config: M3NavCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  /** Drops keys the user cleared: the card's defaults only apply when absent. */
  private _clean(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...obj };
    for (const [k, v] of Object.entries(out)) {
      if (v === "" || v === undefined || v === null) delete out[k];
      if (Array.isArray(v) && v.length === 0) delete out[k];
    }
    return out;
  }

  // ---- items ---------------------------------------------------------------

  private _setItems(items: NavItemConfig[]): void {
    if (!this._config) return;
    this._emit({ ...this._config, items });
  }

  private _patchItem(index: number, patch: Partial<NavItemConfig>): void {
    const items = [...this._items];
    items[index] = this._clean({ ...items[index], ...patch }) as NavItemConfig;
    this._setItems(items);
  }

  private _addItem(): void {
    this._setItems([...this._items, {}]);
  }

  private _removeItem(index: number): void {
    this._setItems(this._items.filter((_, i) => i !== index));
  }

  /**
   * Reordering by two buttons rather than by dragging: no editor in this suite
   * has a drag-sortable list, and adding one would be new shared infrastructure
   * for a list that is typically four entries long.
   */
  private _moveItem(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this._items.length) return;
    const items = [...this._items];
    [items[index], items[target]] = [items[target], items[index]];
    this._setItems(items);
  }

  /**
   * The width cap is two controls rather than one text field: a mode, and a
   * number that only matters in one of the modes. A free-text field invited
   * values that look plausible and are not — "fixed" was typed in place of
   * "fit", stored happily, and produced a declaration the browser dropped, so
   * the bar spanned the full width with nothing to show why.
   */
  private _widthMode(value: number | string | undefined): "full" | "fit" | "custom" {
    if (value === undefined || value === "") return "full";
    if (value === "fit" || value === "fit-content") return "fit";
    return "custom";
  }

  private _widthPixels(value: number | string | undefined): number {
    if (typeof value === "number") return value;
    const parsed = Number.parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : 600;
  }

  private _widthSchema(): SchemaEntry[] {
    return [
      {
        name: "width_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "full", label: this._t("editor_nav_width_full") },
              { value: "fit", label: this._t("editor_nav_width_fit") },
              { value: "custom", label: this._t("editor_nav_width_custom") },
            ],
          },
        },
      },
    ];
  }

  private _widthPixelSchema(): SchemaEntry[] {
    return [
      {
        name: "width_px",
        selector: { number: { min: 200, max: 1600, step: 10, mode: "slider" } },
      },
    ];
  }

  /** Renders the mode select plus, in custom mode, the pixel slider. */
  private _renderWidth(
    value: number | string | undefined,
    apply: (next: number | string | undefined) => void,
  ) {
    const mode = this._widthMode(value);
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ width_mode: mode }}
        .schema=${this._widthSchema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${(ev: CustomEvent) => {
          const next = (ev.detail.value as { width_mode: string }).width_mode;
          if (next === "full") apply(undefined);
          else if (next === "fit") apply("fit");
          else apply(this._widthPixels(value));
        }}
      ></ha-form>
      ${mode === "custom"
        ? html`
            <ha-form
              .hass=${this.hass}
              .data=${{ width_px: this._widthPixels(value) }}
              .schema=${this._widthPixelSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${(ev: CustomEvent) =>
                apply((ev.detail.value as { width_px: number }).width_px)}
            ></ha-form>
          `
        : nothing}
    `;
  }

  private _itemLabel(item: NavItemConfig, index: number): string {
    return item.name || item.path || `#${index + 1}`;
  }

  // ---- views of the current dashboard --------------------------------------

  /**
   * Walks up to the Lovelace root and reads the views it is configured with.
   * Wrapped because the shape is Home Assistant's private business: anything
   * unexpected just means the button offers nothing, never a broken editor.
   */
  private _dashboardViews(): LovelaceViewLike[] {
    let node: (Node & { lovelace?: { config?: { views?: LovelaceViewLike[] } } }) | null =
      this;
    for (let depth = 0; depth < 12 && node; depth++) {
      const views = node.lovelace?.config?.views;
      if (Array.isArray(views)) return views;
      const parent: Node | null =
        (node as unknown as { parentNode?: Node }).parentNode ?? null;
      node = (parent && (parent as ShadowRoot).host
        ? (parent as ShadowRoot).host
        : parent) as typeof node;
    }
    return [];
  }

  private _importViews(): void {
    const views = this._dashboardViews();
    if (!views.length) return;
    const known = new Set(this._items.map((i) => i.path).filter(Boolean));
    const added: NavItemConfig[] = [];
    views.forEach((view, index) => {
      const path = `${location.pathname.split("/").slice(0, 2).join("/")}/${
        view.path ?? index
      }`;
      if (known.has(path)) return;
      added.push(
        this._clean({
          name: view.title,
          icon: view.icon,
          path,
        }) as NavItemConfig,
      );
    });
    if (added.length) this._setItems([...this._items, ...added]);
  }

  // ---- schemas -------------------------------------------------------------

  private _layoutSchema(): SchemaEntry[] {
    return [
      {
        name: "style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "header", label: this._t("editor_nav_style_header") },
              { value: "footer", label: this._t("editor_nav_style_footer") },
              { value: "segmented", label: this._t("editor_nav_style_segmented") },
              { value: "floating", label: this._t("editor_nav_style_floating") },
              { value: "sheet", label: this._t("editor_nav_style_sheet") },
            ],
          },
        },
      },
      {
        name: "position",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "top", label: this._t("editor_nav_position_top") },
              { value: "bottom", label: this._t("editor_nav_position_bottom") },
            ],
          },
        },
      },
      {
        name: "breakpoint",
        selector: { number: { min: 320, max: 1600, step: 8, mode: "box" } },
      },
    ];
  }

  private _perWidthSchema(withBreakpoint: boolean): SchemaEntry[] {
    const schema: SchemaEntry[] = [
      {
        name: "style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "header", label: this._t("editor_nav_style_header") },
              { value: "footer", label: this._t("editor_nav_style_footer") },
              { value: "segmented", label: this._t("editor_nav_style_segmented") },
              { value: "floating", label: this._t("editor_nav_style_floating") },
              { value: "sheet", label: this._t("editor_nav_style_sheet") },
            ],
          },
        },
      },
      { name: "show_labels", selector: { boolean: {} } },
      { name: "hidden", selector: { boolean: {} } },
    ];
    if (withBreakpoint) {
      schema.push({
        name: "breakpoint",
        selector: { number: { min: 320, max: 1600, step: 8, mode: "box" } },
      });
    }
    return schema;
  }

  private _itemSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "path", selector: { text: {} } },
      { name: "match", selector: { text: {} } },
      { name: "hidden", selector: { text: {} } },
      { name: "disabled", selector: { text: {} } },
    ];
  }

  private _itemActionSchema(): SchemaEntry[] {
    return [
      { name: "tap_action", selector: { ui_action: {} } },
      { name: "hold_action", selector: { ui_action: {} } },
      { name: "double_tap_action", selector: { ui_action: {} } },
    ];
  }

  private _badgeSchema(): SchemaEntry[] {
    return [
      { name: "template", selector: { text: {} } },
      { name: "entity", selector: { entity: {} } },
      { name: "count_entities", selector: { entity: { multiple: true } } },
      { name: "show_if", selector: { text: {} } },
    ];
  }

  private _badgeStyleSchema(): SchemaEntry[] {
    return [
      {
        name: "badge_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "dot", label: this._t("editor_nav_badge_style_dot") },
              { value: "count", label: this._t("editor_nav_badge_style_count") },
              { value: "text", label: this._t("editor_nav_badge_style_text") },
            ],
          },
        },
      },
    ];
  }

  private _appearanceSchema(): SchemaEntry[] {
    return [
      {
        name: "label_visibility",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "always", label: this._t("editor_nav_label_always") },
              { value: "active_only", label: this._t("editor_nav_label_active") },
              { value: "never", label: this._t("editor_nav_label_never") },
            ],
          },
        },
      },
      {
        name: "size",
        selector: { number: { min: NAV_SIZE_MIN, max: NAV_SIZE_MAX, step: 0.05, mode: "slider" } },
      },
      {
        name: "icon_size",
        selector: { number: { min: 14, max: 40, step: 1, mode: "slider" } },
      },
      {
        name: "container_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "glass", label: this._t("editor_nav_container_glass") },
              { value: "solid", label: this._t("editor_nav_container_solid") },
              { value: "transparent", label: this._t("editor_nav_container_transparent") },
            ],
          },
        },
      },
      {
        name: "container_opacity",
        selector: { number: { min: 10, max: 100, step: 1, mode: "slider" } },
      },
      { name: "blur", selector: { number: { min: 0, max: 40, step: 1, mode: "slider" } } },
      { name: "radius", selector: { number: { min: 0, max: 40, step: 1, mode: "slider" } } },
    ];
  }

  private _behaviorSchema(): SchemaEntry[] {
    return [
      { name: "haptics", selector: { boolean: {} } },
      { name: "auto_hide_on_scroll", selector: { boolean: {} } },
      {
        name: "submenu_trigger",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "tap", label: this._t("editor_nav_submenu_trigger_tap") },
              { value: "hold", label: this._t("editor_nav_submenu_trigger_hold") },
            ],
          },
        },
      },
      { name: "preload_views", selector: { boolean: {} } },
    ];
  }

  private _visibilitySchema(): SchemaEntry[] {
    return [{ name: "hidden", selector: { text: {} } }];
  }

  private _sheetSchema(): SchemaEntry[] {
    return [
      { name: "sheet_title", selector: { text: {} } },
      {
        name: "sheet_max_height",
        selector: { number: { min: 20, max: 90, step: 5, mode: "slider" } },
      },
      {
        name: "sheet_default",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "collapsed", label: this._t("editor_nav_sheet_default_collapsed") },
              { value: "expanded", label: this._t("editor_nav_sheet_default_expanded") },
              { value: "remember", label: this._t("editor_nav_sheet_default_remember") },
            ],
          },
        },
      },
      {
        name: "sheet_state_entity",
        selector: { entity: { domain: "input_boolean" } },
      },
      { name: "collapse_on_navigate", selector: { boolean: {} } },
      {
        name: "sheet_columns",
        selector: { number: { min: 2, max: 8, step: 1, mode: "box" } },
      },
    ];
  }

  private _sheetActionSchema(): SchemaEntry[] {
    return [
      { name: "icon", selector: { icon: {} } },
      { name: "tap_action", selector: { ui_action: {} } },
    ];
  }

  private _sheetActionChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = ev.detail.value as Record<string, unknown>;
    const action = this._clean({ ...this._config.sheet_action, ...patch });
    const next = { ...this._config };
    if (Object.keys(action).length) {
      next.sheet_action = action as M3NavCardConfig["sheet_action"];
    } else {
      delete next.sheet_action;
    }
    this._emit(next);
  }

  /**
   * The half-open stop, as a checkbox rather than as a raw array: `ha-form` has
   * no selector for a list of floats, and "0, 0.5, 1" typed into a text field
   * is a validation problem in exchange for an option almost nobody sets by
   * hand. YAML still accepts any list.
   */
  private _snapHalfChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const on = (ev.detail.value as { snap_half?: boolean }).snap_half === true;
    const next = { ...this._config };
    if (on) {
      next.snap_points = [0, 0.5, 1];
    } else {
      delete next.snap_points;
    }
    this._emit(next);
  }

  // ---- sheet shortcut tiles -------------------------------------------------

  private get _sheetItems(): NavSheetItem[] {
    return this._config?.sheet_items ?? [];
  }

  private _setSheetItems(items: NavSheetItem[]): void {
    if (!this._config) return;
    const next = { ...this._config };
    if (items.length) next.sheet_items = items;
    else delete next.sheet_items;
    this._emit(next);
  }

  private _sheetItemSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "path", selector: { text: {} } },
      { name: "tap_action", selector: { ui_action: {} } },
    ];
  }

  private _sheetItemChanged(index: number, ev: CustomEvent): void {
    const items = [...this._sheetItems];
    items[index] = this._clean({
      ...items[index],
      ...(ev.detail.value as Record<string, unknown>),
    }) as NavSheetItem;
    this._setSheetItems(items);
  }

  /**
   * Copies every submenu entry of every item into the drawer.
   *
   * This is the whole reason the drawer's tiles exist: the entries people want
   * in it are the ones already sitting behind a "more" entry, and retyping
   * seven of them by hand to move them there would be the card's problem, not
   * theirs. Entries already in the drawer are matched by path and left alone,
   * so pressing it twice does not double them.
   */
  private _importSubmenus(): void {
    const known = new Set(this._sheetItems.map((i) => i.path).filter(Boolean));
    const added: NavSheetItem[] = [];
    for (const item of this._items) {
      for (const entry of item.submenu ?? []) {
        if (entry.path && known.has(entry.path)) continue;
        if (entry.path) known.add(entry.path);
        added.push(
          this._clean({
            name: entry.name,
            icon: entry.icon,
            path: entry.path,
            tap_action: entry.tap_action,
          }) as NavSheetItem,
        );
      }
    }
    if (added.length) this._setSheetItems([...this._sheetItems, ...added]);
  }

  /** True when any of the three layout slots asks for the sheet. */
  private get _usesSheet(): boolean {
    const cfg = this._config;
    return (
      cfg?.style === "sheet" ||
      cfg?.desktop?.style === "sheet" ||
      cfg?.mobile?.style === "sheet"
    );
  }

  // ---- change handlers -----------------------------------------------------

  private _rootChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = ev.detail.value as Record<string, unknown>;
    this._emit(this._clean({ ...this._config, ...patch }) as unknown as M3NavCardConfig);
  }

  private _perWidthChanged(which: "desktop" | "mobile", ev: CustomEvent): void {
    if (!this._config) return;
    const patch = ev.detail.value as Record<string, unknown>;
    const block = this._clean({ ...this._config[which], ...patch });
    const next = { ...this._config };
    if (Object.keys(block).length) {
      next[which] = block as NavLayoutConfig;
    } else {
      delete next[which];
    }
    this._emit(next);
  }

  private _perWidthWidth(which: "desktop" | "mobile", value: number | string | undefined): void {
    if (!this._config) return;
    const block: Record<string, unknown> = { ...this._config[which] };
    if (value === undefined) delete block.max_width;
    else block.max_width = value;
    const next = { ...this._config };
    if (Object.keys(block).length) next[which] = block as NavLayoutConfig;
    else delete next[which];
    this._emit(next);
  }

  private _badgeChanged(index: number, ev: CustomEvent): void {
    const patch = ev.detail.value as Record<string, unknown>;
    const badge = this._clean({ ...this._items[index]?.badge, ...patch });
    this._patchItem(index, {
      badge: Object.keys(badge).length ? (badge as NavItemConfig["badge"]) : undefined,
    });
  }

  private _colorChanged(index: number, value: string): void {
    this._patchItem(index, { color: value || undefined });
  }

  // ---- submenu -------------------------------------------------------------

  private _submenuSchema(): SchemaEntry[] {
    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "path", selector: { text: {} } },
      { name: "tap_action", selector: { ui_action: {} } },
    ];
  }

  private _setSubmenu(index: number, entries: NavSubmenuEntry[]): void {
    this._patchItem(index, { submenu: entries.length ? entries : undefined });
  }

  private _addSubmenuEntry(index: number): void {
    this._setSubmenu(index, [...(this._items[index]?.submenu ?? []), {}]);
  }

  private _removeSubmenuEntry(index: number, entryIndex: number): void {
    this._setSubmenu(
      index,
      (this._items[index]?.submenu ?? []).filter((_, i) => i !== entryIndex),
    );
  }

  private _submenuEntryChanged(index: number, entryIndex: number, ev: CustomEvent): void {
    const entries = [...(this._items[index]?.submenu ?? [])];
    const patch = ev.detail.value as Record<string, unknown>;
    entries[entryIndex] = this._clean({
      ...entries[entryIndex],
      ...patch,
    }) as NavSubmenuEntry;
    this._setSubmenu(index, entries);
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      style: "editor_nav_style",
      position: "editor_nav_position",
      breakpoint: "editor_nav_breakpoint",
      show_labels: "editor_nav_show_labels",
      name: "editor_nav_item_name",
      icon: "editor_nav_item_icon",
      path: "editor_nav_item_path",
      match: "editor_nav_item_match",
      disabled: "editor_nav_item_disabled",
      template: "editor_nav_badge_template",
      entity: "editor_nav_badge_entity",
      count_entities: "editor_nav_badge_count",
      show_if: "editor_nav_badge_show_if",
      badge_style: "editor_nav_badge_style",
      tap_action: "editor_tap_action",
      hold_action: "editor_nav_hold_action",
      double_tap_action: "editor_nav_double_tap_action",
      label_visibility: "editor_nav_label_visibility",
      width_mode: "editor_nav_max_width",
      width_px: "editor_nav_max_width_px",
      size: "editor_nav_size",
      icon_size: "editor_nav_icon_size",
      container_style: "editor_nav_container",
      container_opacity: "editor_nav_opacity",
      blur: "editor_nav_blur",
      radius: "editor_radius",
      haptics: "editor_nav_haptics",
      auto_hide_on_scroll: "editor_nav_auto_hide",
      submenu_trigger: "editor_nav_submenu_trigger",
      preload_views: "editor_nav_preload_views",
      sheet_title: "editor_nav_sheet_title",
      sheet_max_height: "editor_nav_sheet_max_height",
      sheet_default: "editor_nav_sheet_default",
      sheet_state_entity: "editor_nav_sheet_state_entity",
      collapse_on_navigate: "editor_nav_collapse_on_navigate",
      sheet_columns: "editor_nav_sheet_columns",
      snap_half: "editor_nav_sheet_snap_half",
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  /** `hidden` means two different things depending on where it is shown. */
  private _hiddenLabel = (schema: SchemaEntry): string =>
    schema.name === "hidden"
      ? this._t("editor_nav_hidden_template")
      : this._computeLabel(schema);

  private _layoutHiddenLabel = (schema: SchemaEntry): string =>
    schema.name === "hidden"
      ? this._t("editor_nav_layout_hidden")
      : this._computeLabel(schema);

  private _itemHiddenLabel = (schema: SchemaEntry): string =>
    schema.name === "hidden"
      ? this._t("editor_nav_item_hidden")
      : this._computeLabel(schema);

  // ---- render --------------------------------------------------------------

  private _renderItem(item: NavItemConfig, index: number) {
    return html`
      <ha-expansion-panel outlined .header=${this._itemLabel(item, index)}>
        <div class="panel-content">
          <ha-form
            .hass=${this.hass}
            .data=${item}
            .schema=${this._itemSchema()}
            .computeLabel=${this._itemHiddenLabel}
            @value-changed=${(ev: CustomEvent) =>
              this._patchItem(index, ev.detail.value as Partial<NavItemConfig>)}
          ></ha-form>
          <div class="hint">${this._t("editor_nav_template_hint")}</div>
          <div class="hint">${this._t("editor_nav_item_match_hint")}</div>
          ${colorRow(this._t("editor_mode_color"), item.color, (v) =>
            this._colorChanged(index, v),
          )}

          <div class="block">
            <div class="hint">${this._t("editor_nav_badge")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${item.badge ?? {}}
              .schema=${this._badgeSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${(ev: CustomEvent) => this._badgeChanged(index, ev)}
            ></ha-form>
            <ha-form
              .hass=${this.hass}
              .data=${{ badge_style: item.badge_style ?? "count" }}
              .schema=${this._badgeStyleSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${(ev: CustomEvent) =>
                this._patchItem(index, ev.detail.value as Partial<NavItemConfig>)}
            ></ha-form>
            <div class="hint">${this._t("editor_nav_badge_hint")}</div>
          </div>

          <div class="block">
            <div class="hint">${this._t("editor_nav_actions")}</div>
            <ha-form
              .hass=${this.hass}
              .data=${item}
              .schema=${this._itemActionSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${(ev: CustomEvent) =>
                this._patchItem(index, ev.detail.value as Partial<NavItemConfig>)}
            ></ha-form>
            <div class="hint">${this._t("editor_nav_action_hint")}</div>
          </div>

          <div class="block">
            <div class="hint">${this._t("editor_nav_submenu")}</div>
            ${(item.submenu ?? []).map(
              (entry, entryIndex) => html`
                <div class="block">
                  <ha-form
                    .hass=${this.hass}
                    .data=${entry}
                    .schema=${this._submenuSchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${(ev: CustomEvent) =>
                      this._submenuEntryChanged(index, entryIndex, ev)}
                  ></ha-form>
                  <ha-button
                    class="remove"
                    @click=${() => this._removeSubmenuEntry(index, entryIndex)}
                    >${this._t("editor_nav_remove_submenu")}</ha-button
                  >
                </div>
              `,
            )}
            <ha-button @click=${() => this._addSubmenuEntry(index)}
              >${this._t("editor_nav_add_submenu")}</ha-button
            >
          </div>

          <div class="row-buttons">
            <ha-icon-button
              .label=${this._t("editor_nav_move_up")}
              .disabled=${index === 0}
              @click=${() => this._moveItem(index, -1)}
            >
              <ha-icon icon="mdi:arrow-up"></ha-icon>
            </ha-icon-button>
            <ha-icon-button
              .label=${this._t("editor_nav_move_down")}
              .disabled=${index === this._items.length - 1}
              @click=${() => this._moveItem(index, 1)}
            >
              <ha-icon icon="mdi:arrow-down"></ha-icon>
            </ha-icon-button>
            <ha-button class="remove" @click=${() => this._removeItem(index)}
              >${this._t("editor_nav_remove_item")}</ha-button
            >
          </div>
        </div>
      </ha-expansion-panel>
    `;
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;
    const cfg = this._config;

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_nav_layout")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:dock-bottom"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{
                style: cfg.style ?? "footer",
                position: cfg.position ?? "",
                breakpoint: cfg.breakpoint ?? NAV_DEFAULT_BREAKPOINT,
              }}
              .schema=${this._layoutSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._rootChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_nav_breakpoint_hint")}</div>

            <div class="block">
              <div class="hint">${this._t("editor_nav_desktop")}</div>
              <ha-form
                .hass=${this.hass}
                .data=${cfg.desktop ?? {}}
                .schema=${this._perWidthSchema(true)}
                .computeLabel=${this._layoutHiddenLabel}
                @value-changed=${(ev: CustomEvent) => this._perWidthChanged("desktop", ev)}
              ></ha-form>
              ${this._renderWidth(cfg.desktop?.max_width, (v) =>
                this._perWidthWidth("desktop", v),
              )}
            </div>

            <div class="block">
              <div class="hint">${this._t("editor_nav_mobile")}</div>
              <ha-form
                .hass=${this.hass}
                .data=${cfg.mobile ?? {}}
                .schema=${this._perWidthSchema(false)}
                .computeLabel=${this._layoutHiddenLabel}
                @value-changed=${(ev: CustomEvent) => this._perWidthChanged("mobile", ev)}
              ></ha-form>
              ${this._renderWidth(cfg.mobile?.max_width, (v) =>
                this._perWidthWidth("mobile", v),
              )}
            </div>
            <div class="hint">${this._t("editor_nav_layout_hint")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_nav_items")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:format-list-bulleted"></ha-icon>
          <div class="panel-content">
            ${this._items.map((item, index) => this._renderItem(item, index))}
            <ha-button raised @click=${this._addItem}
              >${this._t("editor_nav_add_item")}</ha-button
            >
            <ha-button @click=${this._importViews}
              >${this._t("editor_nav_import_views")}</ha-button
            >
            <div class="hint">${this._t("editor_nav_import_hint")}</div>
          </div>
        </ha-expansion-panel>

        ${this._usesSheet
          ? html`
              <ha-expansion-panel outlined .header=${this._t("editor_nav_sheet")}>
                <ha-icon slot="leading-icon" icon="mdi:dock-window"></ha-icon>
                <div class="panel-content">
                  <ha-form
                    .hass=${this.hass}
                    .data=${{
                      sheet_title: cfg.sheet_title ?? "",
                      sheet_max_height:
                        typeof cfg.sheet_max_height === "number" ? cfg.sheet_max_height : 60,
                      sheet_default: cfg.sheet_default ?? "collapsed",
                      sheet_state_entity: cfg.sheet_state_entity ?? "",
                      collapse_on_navigate: cfg.collapse_on_navigate ?? true,
                      sheet_columns: cfg.sheet_columns ?? "",
                    }}
                    .schema=${this._sheetSchema()}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${this._rootChanged}
                  ></ha-form>

                  <ha-form
                    .hass=${this.hass}
                    .data=${{ snap_half: (cfg.snap_points?.length ?? 0) > 2 }}
                    .schema=${[{ name: "snap_half", selector: { boolean: {} } }]}
                    .computeLabel=${this._computeLabel}
                    @value-changed=${this._snapHalfChanged}
                  ></ha-form>

                  <div class="block">
                    <div class="hint">${this._t("editor_nav_sheet_action_icon")}</div>
                    <ha-form
                      .hass=${this.hass}
                      .data=${cfg.sheet_action ?? {}}
                      .schema=${this._sheetActionSchema()}
                      .computeLabel=${this._computeLabel}
                      @value-changed=${this._sheetActionChanged}
                    ></ha-form>
                  </div>

                  <div class="block">
                    <div class="hint">${this._t("editor_nav_sheet_items")}</div>
                    ${this._sheetItems.map(
                      (item, index) => html`
                        <div class="block">
                          <ha-form
                            .hass=${this.hass}
                            .data=${item}
                            .schema=${this._sheetItemSchema()}
                            .computeLabel=${this._computeLabel}
                            @value-changed=${(ev: CustomEvent) =>
                              this._sheetItemChanged(index, ev)}
                          ></ha-form>
                          <ha-button
                            class="remove"
                            @click=${() =>
                              this._setSheetItems(
                                this._sheetItems.filter((_, i) => i !== index),
                              )}
                            >${this._t("editor_nav_remove_item")}</ha-button
                          >
                        </div>
                      `,
                    )}
                    <ha-button
                      @click=${() => this._setSheetItems([...this._sheetItems, {}])}
                      >${this._t("editor_nav_add_sheet_item")}</ha-button
                    >
                    <ha-button @click=${this._importSubmenus}
                      >${this._t("editor_nav_import_submenus")}</ha-button
                    >
                    <div class="hint">${this._t("editor_nav_import_submenus_hint")}</div>
                  </div>

                  <div class="hint">${this._t("editor_nav_sheet_cards_hint")}</div>
                </div>
              </ha-expansion-panel>
            `
          : nothing}

        <ha-expansion-panel outlined .header=${this._t("editor_nav_appearance")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{
                label_visibility: cfg.label_visibility ?? "always",
                size: cfg.size ?? 1,
                icon_size: cfg.icon_size ?? 22,
                container_style: cfg.container_style ?? "glass",
                container_opacity: cfg.container_opacity ?? 100,
                blur: cfg.blur ?? 20,
                radius: cfg.radius ?? 30,
              }}
              .schema=${this._appearanceSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._rootChanged}
            ></ha-form>
            ${this._renderWidth(cfg.max_width, (v) => {
              const next = { ...cfg };
              if (v === undefined) delete next.max_width;
              else next.max_width = v;
              this._emit(next);
            })}
            <div class="hint">${this._t("editor_nav_max_width_hint")}</div>
            ${colorRow(this._t("editor_mode_color"), cfg.accent_color, (v) =>
              this._emit(
                this._clean({ ...cfg, accent_color: v }) as unknown as M3NavCardConfig,
              ),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_nav_behavior")}>
          <ha-icon slot="leading-icon" icon="mdi:gesture-tap"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{
                haptics: cfg.haptics ?? true,
                auto_hide_on_scroll: cfg.auto_hide_on_scroll ?? false,
                submenu_trigger: cfg.submenu_trigger ?? "tap",
                preload_views: cfg.preload_views ?? false,
              }}
              .schema=${this._behaviorSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._rootChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_nav_preload_hint")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_nav_visibility")}>
          <ha-icon slot="leading-icon" icon="mdi:eye-off-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{ hidden: cfg.hidden ?? "" }}
              .schema=${this._visibilitySchema()}
              .computeLabel=${this._hiddenLabel}
              @value-changed=${this._rootChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_nav_visibility_hint")}</div>
          </div>
        </ha-expansion-panel>
      </div>
    `;
  }

  static styles = [
    editorStyles,
    css`
      .block {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        border: 1px dashed rgba(127, 127, 127, 0.4);
        border-radius: 12px;
      }

      .row-buttons {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .row-buttons ha-button.remove {
        margin-left: auto;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-nav-card-editor": M3NavCardEditor;
  }
}
