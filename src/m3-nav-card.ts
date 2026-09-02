import { LitElement, html, css, nothing, unsafeCSS } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HaActionConfig,
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  M3NavCardConfig,
  NavBadgeStyle,
  NavItemConfig,
  NavLabelVisibility,
  NavLayoutConfig,
  NavPosition,
  NavVariant,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_NAV_COLOR,
  DEFAULT_NAV_ICON,
  NAV_AUTOHIDE_MS,
  NAV_AUTOHIDE_THRESHOLD_PX,
  NAV_BADGE_DOT,
  NAV_BADGE_FONT,
  NAV_BADGE_HEIGHT,
  NAV_BADGE_PADDING,
  NAV_BADGE_RADIUS,
  NAV_BAR_GAP,
  NAV_BAR_HEIGHT,
  NAV_BAR_PADDING,
  NAV_DEFAULT_BREAKPOINT,
  NAV_FLOAT_INSET,
  NAV_FLOAT_RADIUS,
  NAV_ITEM_GLYPH,
  NAV_ITEM_HEIGHT,
  NAV_ITEM_INACTIVE_OPACITY,
  NAV_ITEM_LABEL_SIZE,
  NAV_ITEM_MIN_WIDTH,
  NAV_INDICATOR_HEIGHT,
  NAV_INDICATOR_RADIUS,
  NAV_INDICATOR_RADIUS_ACTIVE,
  NAV_INDICATOR_WIDTH,
  NAV_ITEM_RADIUS,
  NAV_ITEM_RADIUS_ACTIVE,
  NAV_ITEM_TINT,
  NAV_PRESS_MS,
  NAV_SEGMENT_HEIGHT,
  NAV_SEGMENT_ITEM_RADIUS,
  NAV_SEGMENT_PADDING,
  NAV_SEGMENT_RADIUS,
  NAV_SHEET_ACTION_RADIUS,
  NAV_SHEET_ACTION_SIZE,
  NAV_SHEET_DEFAULT_MAX_VH,
  NAV_SHEET_HANDLE_HEIGHT,
  NAV_SHEET_HANDLE_OPACITY,
  NAV_SHEET_HANDLE_PADDING,
  NAV_SHEET_HANDLE_RADIUS,
  NAV_SHEET_HANDLE_WIDTH,
  NAV_SHEET_SETTLE_MS,
  NAV_SHEET_TITLE_SIZE,
  NAV_SHORT_VIEWPORT_MAX_VH,
  NAV_SHORT_VIEWPORT_PX,
  NAV_SIZE_MAX,
  NAV_SIZE_MIN,
  NAV_SUBMENU_MIN_WIDTH,
  NAV_SUBMENU_MS,
  NAV_SUBMENU_PADDING,
  NAV_SUBMENU_RADIUS,
  NAV_SUBMENU_ROW_HEIGHT,
  NAV_SUBMENU_ROW_RADIUS,
  NAV_SUBMENU_TINT,
  NAV_Z_INDEX,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { STANDARD_EASING, shouldAnimate } from "./shared/animation";
import { activateOnKey } from "./shared/a11y";
import { handleAction, isActionable } from "./shared/actions";
import {
  buildCssVars,
  fillColor,
  foregroundOn,
  inkOn,
  resolveCommonColors,
  resolveThemeColor,
  tintOn,
} from "./shared/color-config";
import { hassChangeMatters } from "./shared/should-update";
import { readCollapsed, writeCollapsed, type CollapseTarget } from "./shared/collapse-state";
import { createCards, updateCardsHass } from "./shared/card-helpers";
import { SheetGesture } from "./shared/sheet-gesture";
import {
  TemplateSubManager,
  isTemplate,
  templateTruthy,
  type TemplateSubscription,
} from "./shared/template-sub";
import { TapHold, fireHaptic } from "./shared/tap-hold";
import { stopSwipe } from "./shared/swipe";

const EASING = unsafeCSS(STANDARD_EASING);

const SHEET_STORAGE_PREFIX = "m3-nav-sheet";

console.info(
  `%c M3-NAV-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #85b7eb; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #85b7eb; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

/**
 * Every connected sheet-variant card on the page, in the order they connected.
 *
 * Only the first one docks to the screen. Two fixed sheets would sit on top of
 * each other with no way to tell which handle belongs to which, so the later
 * ones render inline in the card flow instead — and the editor says so, since
 * that is where someone can see and fix it.
 */
// Touch and mouse both, because the swipe plugins listen for both: a mouse
// drag on a desktop dashboard scrolls the bar just as a finger does.
const SWIPE_EVENTS = [
  "touchstart",
  "touchmove",
  "mousedown",
  "mousemove",
] as const;

const connectedSheets = new Set<M3NavCard>();

/** The editor frame names the variant, using the editor's own wording for it. */
const VARIANT_LABEL_KEYS: Record<NavVariant, TranslationKey> = {
  header: "editor_nav_style_header",
  footer: "editor_nav_style_footer",
  segmented: "editor_nav_style_segmented",
  floating: "editor_nav_style_floating",
  sheet: "editor_nav_style_sheet",
};

/** An entry after its templates have been rendered and its state resolved. */
interface ResolvedItem {
  index: number;
  config: NavItemConfig;
  name: string;
  icon: string;
  color: string;
  disabled: boolean;
  active: boolean;
  badge?: { text: string; dot: boolean; color: string };
}

@customElement("m3-nav-card")
export class M3NavCard extends LitElement implements LovelaceCard {
  private _hass?: HomeAssistant;

  /**
   * Written as an accessor rather than a plain property because two things
   * have to happen on every assignment, not on every render.
   *
   * `shouldUpdate` filters most ticks away — that is the whole point of it —
   * and everything downstream of a filtered tick never runs. The cards inside
   * the drawer take their data from a `hass` set on them from outside, so
   * pushing it from the render path starved them: they rendered once, empty,
   * and stayed that way. Same for the template manager's connection.
   */
  @property({ attribute: false })
  public get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  public set hass(value: HomeAssistant | undefined) {
    const previous = this._hass;
    this._hass = value;
    this._templates?.updateHass(value);
    updateCardsHass(this._sheetCards, value);
    this.requestUpdate("hass", previous);
  }

  @state() private _config?: M3NavCardConfig;
  /** True while the card's own box is narrower than the breakpoint. */
  @state() private _narrow = false;
  /** Current URL path, kept as state so a navigation repaints the active entry. */
  @state() private _path = location.pathname;
  /** Path the bar last scrolled its active entry into view for. */
  private _scrolledFor?: string;
  @state() private _pressed?: number;
  /** Set by auto_hide_on_scroll while the page is being scrolled down. */
  @state() private _autoHidden = false;
  /** Index of the entry whose submenu is open, if any. */
  @state() private _submenuFor?: number;
  /** Sheet variant: whether the drawer is open. */
  @state() private _sheetOpen = false;
  /**
   * Where the drawer sits, 0 collapsed to 1 open. Normally one of the snap
   * points; anything between the two only exists while a finger is down.
   */
  @state() private _sheetFraction = 0;
  @state() private _sheetDragging = false;

  /** Where the open submenu grows from — the entry that was tapped. */
  private _submenuAnchor?: DOMRect;
  /** The cards configured in `sheet_cards`, built once per config change. */
  private _sheetCards: HTMLElement[] = [];
  private _sheetCardsKey = "";
  private _gesture?: SheetGesture;
  private _gestureCleanups: Array<() => void> = [];
  /** Measured pixels between collapsed and open; 0 until the panel has laid out. */
  private _sheetTravel = 0;
  private _panelObserver?: ResizeObserver;

  private _resizeObserver?: ResizeObserver;
  private _templates?: TemplateSubManager;
  /** Template string → live subscription, rebuilt only when the config changes. */
  private _subs = new Map<string, TemplateSubscription>();
  private _tapHolds = new Map<number, TapHold>();
  private _pressTimer?: number;
  private _scrollTarget?: HTMLElement | Window;
  private _lastScrollY = 0;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-nav-card-editor");
    return document.createElement(
      "m3-nav-card-editor",
    ) as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): M3NavCardConfig {
    return {
      type: "custom:m3-nav-card",
      style: "footer",
      items: [
        { name: "Home", icon: "mdi:home", path: "/lovelace/0" },
        { name: "Energie", icon: "mdi:flash", path: "/lovelace/energie" },
      ],
    };
  }

  public setConfig(config: M3NavCardConfig): void {
    this._config = { style: "footer", animation: "auto", ...config };
    this._syncSubscriptions();
    this._sheetOpen = this._readSheetOpen();
    this._sheetFraction = this._sheetOpen ? 1 : 0;
    void this._syncSheetCards();
  }

  public getCardSize(): number {
    return 1;
  }

  public getGridOptions(): LovelaceGridOptions {
    // A navigation bar spans whatever it is put in; a section grid that placed
    // one beside a card would cut the entries in half.
    return { columns: "full", rows: "auto" };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    // Templated fields arrive as a pushed value and call requestUpdate
    // themselves, so only the entity-backed reads have to be declared here.
    // `themes` is covered by hassChangeMatters — a hand-written filter that
    // forgets it keeps the old theme's colours when the card is off screen.
    return hassChangeMatters(changed, this.hass, this._watchedEntities());
  }

  public connectedCallback(): void {
    super.connectedCallback();
    // Read where we are now, not where we were when this card was last on
    // screen. A cached view comes back with whatever path it was put away
    // with, so the entry it highlighted stayed one navigation behind until
    // something else forced a re-read.
    this._path = location.pathname;
    window.addEventListener("location-changed", this._onLocationChanged);
    window.addEventListener("popstate", this._onLocationChanged);

    // Dashboard-wide swipe plugins read drags off an ancestor of the card, so
    // a sideways drag on a bar that scrolls — the entries do not all fit, that
    // is why it scrolls — was read as "next view" and navigated away mid-
    // scroll. The whole card is shielded rather than just the bar: nothing
    // drawn here is ever a request to change the view by swiping, and the
    // sheet has scrollable content of its own. Listeners on the host see the
    // events bubble past before any ancestor does; the sheet handle keeps its
    // own shield for the gestures it attaches outside this element.
    for (const type of SWIPE_EVENTS) {
      this.addEventListener(type, stopSwipe);
    }
    this._templates = new TemplateSubManager(this.hass, () => this.requestUpdate());
    this._syncSubscriptions();
    this._attachScroll();
    connectedSheets.add(this);
    void this._syncSheetCards();

    // Everything torn down on disconnect has to be built again here, not in
    // updated(). Home Assistant keeps view elements in a cache and re-inserts
    // the same card when you navigate back to a view, and a reconnect on its
    // own changes no property — so updated() may never run again, and the
    // card would sit there with no observers and no gesture handlers. That is
    // the "it works the first time I open the view and never again" bug.
    void this.updateComplete.then(() => {
      if (!this.isConnected) return;
      this._startObserving();
      this._measureDock();
      if (this._variant === "sheet" && !this._editing) this._attachGesture();
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("location-changed", this._onLocationChanged);
    window.removeEventListener("popstate", this._onLocationChanged);
    for (const type of SWIPE_EVENTS) {
      this.removeEventListener(type, stopSwipe);
    }
    window.removeEventListener("resize", this._measureDock);
    this._resizeObserver?.disconnect();
    // Cleared, not just disconnected: a disconnected observer that is still
    // held would make _startObserving think the work was already done when the
    // card comes back.
    this._resizeObserver = undefined;
    this._detachScroll();
    this._closeSubmenu();
    this._detachGesture();
    connectedSheets.delete(this);
    window.clearTimeout(this._pressTimer);
    for (const h of this._tapHolds.values()) h.destroy();
    this._tapHolds.clear();
    // Every subscription this card opened, closed in one go — a nav bar that
    // leaks one per templated entry per navigation would pile them up fast.
    this._subs.clear();
    this._templates?.disconnect();
    this._templates = undefined;
  }

  /**
   * Lines a docked bar up with the content area rather than with the window.
   *
   * The host is `position: fixed`, which is measured against the viewport and
   * therefore runs underneath the sidebar. Its parent is still in normal flow —
   * only the host left it — so the parent's box is exactly the slot the card
   * was given, sidebar and column width already accounted for. Falling back to
   * the full width if anything is unexpected keeps the bar visible either way.
   */
  /**
   * Scrolls the active entry into view on a bar that is wider than the screen.
   *
   * Every view carries its own card, so navigating to a page builds a fresh
   * bar that starts scrolled to the far left — and if the entry for that page
   * sits past the right edge, the bar looks like it jumped back to the first
   * entry and lost its highlight. The highlight was always right; it was just
   * out of sight.
   *
   * Only ever runs when the active path changed, never on an unrelated
   * re-render: a badge template ticking over must not yank the bar back while
   * the reader is scrolling through it by hand.
   *
   * Deliberately instant, and by the smallest amount that makes the entry
   * fully visible. Animating this looked like the bar swiping the whole way
   * from the first entry to the last one, because that is literally what it
   * was doing: a cached view comes back holding the scroll position it had,
   * and the correction then travels the full width in plain sight. Landing
   * already correct while the page itself is changing reads as the bar having
   * been there all along.
   */
  private _keepActiveInView(): void {
    if (this._scrolledFor === this._path) return;
    const bar = this.renderRoot.querySelector<HTMLElement>(".bar");
    const active = bar?.querySelector<HTMLElement>(".item.active");
    if (!bar || !active) return;
    // Nothing to scroll, so nothing to correct — and claiming this path as
    // done would be wrong if the bar is still being laid out.
    if (bar.scrollWidth - bar.clientWidth <= 1) return;
    this._scrolledFor = this._path;

    const barBox = bar.getBoundingClientRect();
    const itemBox = active.getBoundingClientRect();
    // A little air, so the entry does not end up flush against the edge
    // looking like it was cut off.
    const margin = NAV_BAR_GAP * 2;
    const overLeft = barBox.left - itemBox.left + margin;
    const overRight = itemBox.right - barBox.right + margin;

    let delta = 0;
    if (overLeft > 0) delta = -overLeft;
    else if (overRight > 0) delta = overRight;
    else return; // already fully in view: leave the bar exactly where it is

    const max = bar.scrollWidth - bar.clientWidth;
    const left = Math.max(0, Math.min(max, bar.scrollLeft + delta));
    if (Math.abs(left - bar.scrollLeft) < 1) return;
    bar.scrollLeft = left;
  }

  private _measureDock = (): void => {
    const rect = this._contentRect();
    if (!rect) return;
    const left = Math.max(0, Math.round(rect.left));
    const right = Math.max(0, Math.round(window.innerWidth - rect.right));
    this.style.setProperty("--nav-dock-left", `${left}px`);
    this.style.setProperty("--nav-dock-right", `${right}px`);
  };

  /**
   * The view's content area — everything Home Assistant leaves to the
   * dashboard, which is the window minus the sidebar.
   *
   * Not the card's own slot: the slot is one column of one section, and a bar
   * docked to a 500px column in the middle of a wide screen is not a bar. Not
   * the window either, which is what `position: fixed` would give and which
   * runs underneath the sidebar.
   *
   * Found by walking up until the ancestors stop getting narrower than the
   * window: the content area is the widest thing that is still inset, and the
   * next one up spans the whole window. The walk crosses shadow boundaries,
   * gives up after a fixed depth, and falls back to the full width — a bar too
   * wide is a cosmetic problem, a bar that fails to render is not.
   */
  private _contentRect(): DOMRect | undefined {
    let node: Element | null = this;
    let best: DOMRect | undefined;
    for (let depth = 0; depth < 12 && node; depth++) {
      const parent: Element | null =
        node.parentElement ??
        ((node.parentNode as ShadowRoot | null)?.host as Element | undefined) ??
        null;
      if (!parent) break;
      const rect = parent.getBoundingClientRect();
      if (rect.width > 0 && rect.width < window.innerWidth) {
        if (!best || rect.width > best.width) best = rect;
      }
      node = parent;
    }
    return best;
  }

  protected firstUpdated(changed: PropertyValues): void {
    super.firstUpdated(changed);
    this._measureDock();
    this._startObserving();
  }

  /**
   * (Re)builds the size observers. Idempotent, because it runs on the first
   * render and again on every reconnect — see connectedCallback for why the
   * second one is not optional.
   */
  private _startObserving(): void {
    if (this._resizeObserver) return;
    window.addEventListener("resize", this._measureDock);
    // Deliberately not matchMedia: the card can sit in a narrow column on a
    // wide screen, and "does the bar fit" is a question about the box it is in,
    // not about the window.
    this._resizeObserver = new ResizeObserver(() => {
      // A docked host is as wide as the slot it was measured into, so the
      // parent is the honest answer to "how much room does this card have"
      // for both the breakpoint and the docking offsets.
      this._measureDock();
      const width =
        (this.parentElement ?? this).getBoundingClientRect().width ||
        this.getBoundingClientRect().width;
      if (width <= 0) return;
      const narrow = width < this._breakpoint;
      if (narrow !== this._narrow) this._narrow = narrow;
    });
    this._resizeObserver.observe(this);
    if (this.parentElement) this._resizeObserver.observe(this.parentElement);
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config")) {
      this._syncSubscriptions();
      void this._syncSheetCards();
      // Toggling the option in the editor has to take effect without a reload,
      // and the listener is only wanted while the option is on.
      this._detachScroll();
      this._attachScroll();
    }
    // The variant drives the host's own positioning, which static CSS reaches
    // through an attribute selector rather than an inline style.
    this.setAttribute("variant", this._layout.style ?? "footer");
    this.setAttribute("edge", this._position);
    // Docking is what makes the bar cost no row of the view, and it is exactly
    // what makes it unreachable in the editor: a fixed card leaves the flow, so
    // its slot in the grid collapses to nothing and there is no longer anything
    // to click. The card therefore renders in the flow whenever it is being
    // edited or previewed — and a second sheet on the same view does the same,
    // since only the first one gets to dock.
    const inline =
      this._editing || (this._variant === "sheet" && !this._isPrimarySheet);
    if (inline) {
      this.setAttribute("inline", "");
    } else {
      this.removeAttribute("inline");
    }
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    // Cheap belt and braces: a navigation that reaches the card by a route
    // this does not listen on still corrects itself on the next render, and a
    // string comparison per update costs nothing.
    if (this._path !== location.pathname) this._path = location.pathname;
    this._keepActiveInView();
    // The first measurement can land before the view has laid itself out, and
    // the observer only fires on a later change — which for a slot that never
    // resizes again never comes. Re-reading it per render is two rect reads.
    this._measureDock();
    // An entity-backed sheet state can change from anywhere — another device,
    // an automation — so it is re-read on every tick rather than only on a tap.
    if (this._config?.sheet_state_entity) {
      const wanted = this._readSheetOpen();
      if (wanted !== this._sheetOpen) {
        this._sheetOpen = wanted;
        this._sheetFraction = wanted ? 1 : 0;
      }
    }
    // The drawer's elements only exist once the sheet variant has rendered, so
    // the handlers are wired here rather than in firstUpdated.
    if (this._variant === "sheet" && !this._editing) {
      this._attachGesture();
      // Re-measured on every render as well as from the observer. The cards in
      // the drawer mount asynchronously and Lit may hand the panel a new body
      // node, either of which leaves an observer watching the wrong thing or
      // watching nothing — and a stale travel means the drawer opens to the
      // wrong height. An offsetHeight read behind a one-pixel guard is cheap
      // enough to do unconditionally.
      this._measurePanel();
    } else if (this._gesture) {
      this._detachGesture();
    }
  }

  // ---- language ------------------------------------------------------------

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  // ---- layout resolution ---------------------------------------------------

  private get _breakpoint(): number {
    return (
      this._config?.desktop?.breakpoint ??
      this._config?.breakpoint ??
      NAV_DEFAULT_BREAKPOINT
    );
  }

  /**
   * The layout in force at this width: the matching block's values, falling
   * back to the card's own. Configuring neither block leaves one layout at
   * every width, which is the common case.
   */
  private get _layout(): NavLayoutConfig {
    const cfg = this._config;
    if (!cfg) return {};
    const block = (this._narrow ? cfg.mobile : cfg.desktop) ?? {};
    return {
      style: block.style ?? cfg.style ?? "footer",
      position: block.position ?? cfg.position,
      // Left out of this object once, which meant a per-width width cap was
      // accepted by the editor, stored in the config, and then silently never
      // applied to anything.
      max_width: block.max_width,
      show_labels: block.show_labels,
      hidden: block.hidden,
    };
  }

  private get _variant(): NavVariant {
    return this._layout.style ?? "footer";
  }

  private get _position(): NavPosition {
    // A header means the top and a footer means the bottom; `position` only has
    // something to decide for the detached variants.
    const explicit = this._layout.position;
    if (explicit) return explicit;
    return this._variant === "header" ? "top" : "bottom";
  }

  /**
   * Whether entries stack their label under the icon (and share the row width
   * evenly) or sit as icon-and-label pills sized to their own content.
   */
  private get _iconVisibility(): NavLabelVisibility {
    const cfg = this._config;
    if (cfg?.icon_visibility) return cfg.icon_visibility;
    // `show_icons` came first and stays as the coarse version of the same
    // question.
    return cfg?.show_icons === false ? "never" : "always";
  }

  /** Whether any entry at all draws an icon, which decides the layout. */
  private get _showIcons(): boolean {
    return this._iconVisibility !== "never";
  }

  private get _stacked(): boolean {
    // With no icon there is no glyph box to put the active pill on, so the
    // entry itself carries it — the same arrangement the horizontal variants
    // already use.
    if (!this._showIcons) return false;
    const variant = this._variant;
    return variant === "footer" || variant === "floating" || variant === "sheet";
  }

  /**
   * The configured width cap as a CSS length, plus whether the bar should hug
   * its entries. `fit` is its own case because it also changes how the entries
   * are sized, not just how much room the bar is allowed.
   */
  /**
   * What an unconfigured bar should do, which is not the same answer for every
   * variant.
   *
   * `header` and `footer` dock to an edge and reading edge-to-edge is what they
   * are for. `floating` is a detached pill — stretched across a desktop it puts
   * its entries a screen apart from each other, and hugging them is both what
   * the reference designs show and the only sensible default. `sheet` keeps the
   * full width because the drawer holds cards, and a drawer as narrow as five
   * icons has nowhere to put them.
   */
  private get _defaultMaxWidth(): number | string | undefined {
    return this._variant === "floating" ? "fit" : undefined;
  }

  private get _maxWidth(): { css?: string; fit: boolean } {
    const value =
      this._layout.max_width ?? this._config?.max_width ?? this._defaultMaxWidth;
    if (value === undefined || value === "") return { fit: false };
    if (value === "fit" || value === "fit-content") return { css: "fit-content", fit: true };
    if (typeof value === "number") return { css: `${value}px`, fit: false };
    // A bare number as a string is what a text field hands back.
    if (/^\d+(\.\d+)?$/.test(value)) return { css: `${value}px`, fit: false };
    // Anything else has to look like a CSS length, or the browser drops the
    // declaration and the bar silently spans the full width — which is what
    // "fixed" did, typed in place of "fit".
    if (/^-?[\d.]+(px|rem|em|%|vw|vh|ch)$|^(min|max|clamp|calc)\(/.test(value)) {
      return { css: value, fit: false };
    }
    return { fit: false };
  }

  private get _labelVisibility(): NavLabelVisibility {
    const cfg = this._config;
    // The per-width `show_labels` is a coarse on/off; an explicit
    // `label_visibility` is the finer control and wins.
    if (cfg?.label_visibility) return cfg.label_visibility;
    if (this._layout.show_labels === false) return "never";
    if (this._layout.show_labels === true) return "always";
    return "always";
  }

  private get _size(): number {
    return Math.max(
      NAV_SIZE_MIN,
      Math.min(NAV_SIZE_MAX, this._config?.size ?? 1),
    );
  }

  // ---- templates -----------------------------------------------------------

  /**
   * Opens a subscription for every templated field in the config and drops the
   * ones no longer referenced. Runs on a config change, not on a render: a nav
   * bar re-renders on every state tick in the system, and re-subscribing there
   * would tear down and rebuild every subscription several times a second.
   */
  private _syncSubscriptions(): void {
    const manager = this._templates;
    if (!manager) return;

    const wanted = new Set<string>();
    const add = (value: string | undefined): void => {
      if (isTemplate(value)) wanted.add(value!);
    };

    add(this._config?.hidden);
    for (const item of this._config?.items ?? []) {
      add(item.name);
      add(item.icon);
      add(item.color);
      add(item.hidden);
      add(item.disabled);
      add(item.badge?.template);
      add(item.badge?.show_if);
    }

    for (const [template, sub] of this._subs) {
      if (wanted.has(template)) continue;
      sub.unsubscribe();
      this._subs.delete(template);
    }
    for (const template of wanted) {
      if (this._subs.has(template)) continue;
      this._subs.set(template, manager.subscribe(template));
    }
  }

  /** A field that may be Jinja: rendered value if it is, the literal if not. */
  private _resolve(value: string | undefined): string | undefined {
    if (!isTemplate(value)) return value;
    return this._subs.get(value!)?.value ?? "";
  }

  private _resolveBool(value: string | undefined): boolean {
    if (value === undefined) return false;
    if (!isTemplate(value)) {
      // A plain "true"/"on" is accepted so the field behaves the same whether
      // or not someone wrapped it in braces.
      return templateTruthy(value);
    }
    return templateTruthy(this._subs.get(value)?.value);
  }

  // ---- entities the card reads directly ------------------------------------

  private _watchedEntities(): (string | undefined)[] {
    const out: (string | undefined)[] = [];
    for (const item of this._config?.items ?? []) {
      out.push(item.badge?.entity);
      for (const id of item.badge?.count_entities ?? []) out.push(id);
    }
    out.push(this._config?.sheet_state_entity);
    return out;
  }

  // ---- routing -------------------------------------------------------------

  private _onLocationChanged = (): void => {
    if (this._path === location.pathname) return;
    this._path = location.pathname;
    // A menu left standing over the page someone just navigated to is in the
    // way of the thing they navigated for.
    this._closeSubmenu();
    if (this._config?.collapse_on_navigate !== false && this._sheetOpen) {
      this._setSheetOpen(false);
    }
  };

  /**
   * Whether an entry points at the page currently open.
   *
   * An exact match wins outright. Failing that a prefix counts, so
   * `/lovelace/garten` stays lit on `/lovelace/garten/detail` — but only on a
   * path boundary, or `/lovelace/gart` would match `/lovelace/garten` too. The
   * dashboard root is excluded from prefix matching for the same reason: it is
   * a prefix of every page on that dashboard.
   */
  private _isActive(item: NavItemConfig): boolean {
    const path = item.path;
    if (item.match) {
      try {
        return new RegExp(item.match).test(this._path);
      } catch {
        // A broken pattern is a config typo, not a reason to throw inside a
        // render. It simply never matches.
        return false;
      }
    }
    if (!path) return false;
    const current = this._path.replace(/\/+$/, "");
    const target = path.replace(/\/+$/, "");
    if (!target) return false;
    if (current === target) return true;
    return current.startsWith(`${target}/`);
  }

  // ---- items ---------------------------------------------------------------

  private _badgeFor(item: NavItemConfig, color: string): ResolvedItem["badge"] {
    const badge = item.badge;
    if (!badge) return undefined;
    if (badge.show_if !== undefined && !this._resolveBool(badge.show_if)) {
      return undefined;
    }

    let text = "";
    if (badge.template) {
      text = this._resolve(badge.template) ?? "";
    } else if (badge.entity) {
      text = this.hass?.states[badge.entity]?.state ?? "";
    } else if (badge.count_entities?.length) {
      let on = 0;
      for (const id of badge.count_entities) {
        if (this.hass?.states[id]?.state === "on") on++;
      }
      text = String(on);
    }

    const trimmed = text.trim();
    // "Nothing to report" has several spellings and none of them are worth a
    // badge: a bar of grey zeroes reads as broken rather than as quiet.
    if (
      trimmed === "" ||
      trimmed === "0" ||
      trimmed.toLowerCase() === "off" ||
      trimmed.toLowerCase() === "false" ||
      trimmed.toLowerCase() === "unavailable" ||
      trimmed.toLowerCase() === "unknown" ||
      trimmed.toLowerCase() === "none"
    ) {
      return undefined;
    }

    const style: NavBadgeStyle = item.badge_style ?? "count";
    return {
      text: trimmed,
      dot: style === "dot",
      color: resolveThemeColor(badge.color ?? color),
    };
  }

  private get _resolvedItems(): ResolvedItem[] {
    const cfg = this._config;
    if (!cfg?.items?.length) return [];
    const accent = resolveThemeColor(cfg.accent_color ?? DEFAULT_NAV_COLOR);

    const out: ResolvedItem[] = [];
    cfg.items.forEach((item, index) => {
      if (this._resolveBool(item.hidden)) return;
      const color = resolveThemeColor(this._resolve(item.color) || accent);
      out.push({
        index,
        config: item,
        name: this._resolve(item.name) ?? "",
        icon: this._resolve(item.icon) || DEFAULT_NAV_ICON,
        color,
        disabled: this._resolveBool(item.disabled),
        active: this._isActive(item),
        badge: this._badgeFor(item, color),
      });
    });
    return out;
  }

  // ---- actions -------------------------------------------------------------

  /** Whether this entry's submenu opens on a tap rather than on a hold. */
  private _submenuOnTap(index: number): boolean {
    const item = this._config?.items?.[index];
    if (!item?.submenu?.length) return false;
    return (this._config?.submenu_trigger ?? "tap") === "tap";
  }

  private _submenuOnHold(index: number): boolean {
    const item = this._config?.items?.[index];
    if (!item?.submenu?.length) return false;
    return (this._config?.submenu_trigger ?? "tap") === "hold";
  }

  private _tapHoldFor(item: ResolvedItem): TapHold {
    let handler = this._tapHolds.get(item.index);
    if (!handler) {
      handler = new TapHold({
        hasHold: () => {
          if (this._submenuOnHold(item.index)) return true;
          const cfg = this._config?.items?.[item.index];
          return isActionable(cfg?.hold_action) && !!cfg?.hold_action;
        },
        hasDoubleTap: () => {
          const cfg = this._config?.items?.[item.index];
          return isActionable(cfg?.double_tap_action) && !!cfg?.double_tap_action;
        },
        onTap: () => {
          if (this._submenuOnTap(item.index)) {
            this._toggleSubmenu(item.index);
            return;
          }
          this._runItemAction(item.index, "tap");
        },
        onHold: () => {
          if (this._submenuOnHold(item.index)) {
            this._toggleSubmenu(item.index);
            return;
          }
          this._runItemAction(item.index, "hold");
        },
        onDoubleTap: () => this._runItemAction(item.index, "double_tap"),
      });
      this._tapHolds.set(item.index, handler);
    }
    return handler;
  }

  // ---- submenu -------------------------------------------------------------

  private _toggleSubmenu(index: number): void {
    if (this._submenuFor === index) {
      this._closeSubmenu();
      return;
    }
    const anchor = this.renderRoot?.querySelector<HTMLElement>(
      `.item[data-index="${index}"]`,
    );
    this._submenuAnchor = anchor?.getBoundingClientRect();
    this._submenuFor = index;
    if (this._config?.haptics !== false) fireHaptic(this, "selection");
    // Scoped to the time the menu is open: a permanent document listener per
    // nav card would fire on every click on the dashboard for nothing.
    document.addEventListener("click", this._onDocumentClick, true);
    document.addEventListener("keydown", this._onDocumentKey);
  }

  private _closeSubmenu(): void {
    if (this._submenuFor === undefined) return;
    this._submenuFor = undefined;
    this._submenuAnchor = undefined;
    document.removeEventListener("click", this._onDocumentClick, true);
    document.removeEventListener("keydown", this._onDocumentKey);
  }

  private _onDocumentClick = (e: Event): void => {
    // composedPath crosses the shadow boundary, which a plain `contains` check
    // does not — without it every click inside the menu would close it.
    if (e.composedPath().includes(this)) return;
    this._closeSubmenu();
  };

  private _onDocumentKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      this._closeSubmenu();
    }
  };

  private _runSubmenuEntry(itemIndex: number, entryIndex: number): void {
    const entry = this._config?.items?.[itemIndex]?.submenu?.[entryIndex];
    if (!entry) return;
    this._closeSubmenu();
    const action =
      entry.tap_action ??
      (entry.path
        ? ({ action: "navigate", navigation_path: entry.path } as HaActionConfig)
        : undefined);
    if (!action || !isActionable(action)) return;
    if (this._config?.haptics !== false) fireHaptic(this, "light");
    handleAction(this, this.hass, action);
  }

  /** The action an entry runs when nothing is configured: go where it points. */
  private _defaultTap(item: NavItemConfig): HaActionConfig | undefined {
    if (!item.path) return { action: "none" };
    return { action: "navigate", navigation_path: item.path };
  }

  private _runItemAction(index: number, kind: "tap" | "hold" | "double_tap"): void {
    const item = this._config?.items?.[index];
    if (!item) return;
    if (this._resolveBool(item.disabled)) return;

    const action =
      kind === "tap"
        ? (item.tap_action ?? this._defaultTap(item))
        : kind === "hold"
          ? item.hold_action
          : item.double_tap_action;
    if (!action || !isActionable(action)) return;

    if (this._config?.haptics !== false) {
      fireHaptic(this, kind === "hold" ? "medium" : "light");
    }
    this._flashPress(index);
    handleAction(this, this.hass, action);
  }

  /**
   * The bar carries no state of its own between a tap and the new page drawing,
   * so the press morph is the only confirmation that the tap landed.
   */
  private _flashPress(index: number): void {
    if (!shouldAnimate(this._config?.animation)) return;
    this._pressed = index;
    window.clearTimeout(this._pressTimer);
    this._pressTimer = window.setTimeout(() => {
      this._pressed = undefined;
    }, NAV_PRESS_MS);
  }

  // ---- sheet ---------------------------------------------------------------

  /**
   * True while the dashboard is being edited. A sheet that docks itself to the
   * screen there covers the very card the editor is trying to show, so it
   * renders inline and open instead — the same reasoning the heading card uses
   * for not hiding its siblings in edit mode.
   */
  private get _editing(): boolean {
    const self = this as unknown as { editMode?: boolean; preview?: boolean };
    if (self.editMode || self.preview) return true;
    const wrapper = this.parentElement as unknown as
      | { editMode?: boolean; preview?: boolean }
      | null;
    if (wrapper?.editMode || wrapper?.preview) return true;
    return this._dashboardEditMode();
  }

  /**
   * Whether the dashboard as a whole is being edited, read from the element
   * that actually owns that state.
   *
   * The flags on the card and its immediate wrapper are the documented way and
   * they cover the card picker's preview, but they are not set in every edit
   * context — a card that trusted only those stayed docked to the screen while
   * the view around it was in edit mode, so its slot in the grid was empty and
   * there was nothing to click. Walking up to the Lovelace root and asking it
   * is the authoritative answer; anything unexpected on the way just means the
   * card falls back to the flags above.
   */
  private _dashboardEditMode(): boolean {
    let node: Node | null = this;
    for (let depth = 0; depth < 14 && node; depth++) {
      const lovelace = (node as { lovelace?: { editMode?: boolean } }).lovelace;
      if (lovelace && typeof lovelace.editMode === "boolean") return lovelace.editMode;
      const parent: Node | null =
        (node as Element).parentElement ??
        ((node as unknown as { parentNode?: Node }).parentNode ?? null);
      node =
        parent && (parent as ShadowRoot).host ? (parent as ShadowRoot).host : parent;
    }
    return false;
  }

  /** Whether this instance is the one that gets to dock to the screen. */
  private get _isPrimarySheet(): boolean {
    for (const card of connectedSheets) {
      if (card._variant !== "sheet" || card._editing) continue;
      return card === this;
    }
    return true;
  }

  /**
   * Whether the drawer has anything in it.
   *
   * A sheet with nothing configured draws a grip that opens an empty box, and
   * from the outside that is indistinguishable from a broken one — reported as
   * "I pull it and nothing happens". Without content the card renders as the
   * floating bar it otherwise is, and the editor says why.
   */
  private get _sheetHasContent(): boolean {
    const cfg = this._config;
    return !!(
      cfg?.sheet_items?.length ||
      cfg?.sheet_cards?.length ||
      cfg?.sheet_title ||
      cfg?.sheet_action?.icon
    );
  }

  /**
   * Width classes that have a drawer configured but use a variant without one.
   *
   * The root `style` only applies where no per-width block overrides it, so a
   * card set to `sheet` with `mobile: { style: floating }` has a drawer full of
   * shortcuts that the phone — the one device it was meant for — never shows a
   * grip for. Nothing is broken and nothing errors; the drawer simply is not
   * reachable there, which is worth saying out loud in the editor.
   */
  private get _drawerlessWidths(): TranslationKey[] {
    const cfg = this._config;
    if (!cfg || !this._sheetHasContent) return [];
    const out: TranslationKey[] = [];
    const rootIsSheet = (cfg.style ?? "footer") === "sheet";
    const check = (block: NavLayoutConfig | undefined, key: TranslationKey): void => {
      const effective = block?.style ?? cfg.style ?? "footer";
      if (effective !== "sheet" && (rootIsSheet || block?.style)) out.push(key);
    };
    check(cfg.desktop, "editor_nav_desktop");
    check(cfg.mobile, "editor_nav_mobile");
    return out;
  }

  private get _sheetTarget(): CollapseTarget {
    // Cards carry no id, so the key is what identifies this sheet to a reader:
    // the page it is on and its own title.
    const label = this._config?.sheet_title ?? this._config?.name ?? "";
    return {
      entity: this._config?.sheet_state_entity,
      storageKey: `${SHEET_STORAGE_PREFIX}:${location.pathname}:${label}`,
      defaultCollapsed: (this._config?.sheet_default ?? "collapsed") !== "expanded",
    };
  }

  private _readSheetOpen(): boolean {
    const cfg = this._config;
    if (!cfg) return false;
    const mode = cfg.sheet_default ?? "collapsed";
    // An entity is an explicit request to share the state — with another
    // device, or with an automation — so it wins over a fixed initial state.
    if (cfg.sheet_state_entity || mode === "remember") {
      return !readCollapsed(this.hass, this._sheetTarget);
    }
    return mode === "expanded";
  }

  private _setSheetOpen(open: boolean): void {
    this._sheetFraction = open ? 1 : 0;
    if (this._sheetOpen === open) return;
    this._sheetOpen = open;
    const mode = this._config?.sheet_default ?? "collapsed";
    if (this._config?.sheet_state_entity || mode === "remember") {
      writeCollapsed(this.hass, this._sheetTarget, !open);
    }
    if (this._config?.haptics !== false) fireHaptic(this, "light");
  }

  /**
   * Keyboard only. Pointer taps on the grip come through the gesture handler's
   * own tap branch — wiring a click listener here as well meant one tap
   * toggled twice, so the drawer opened and shut again in the same gesture and
   * looked like it was refusing to stay open.
   */
  private _toggleSheet = (e: Event): void => {
    e.stopPropagation();
    this._setSheetOpen(!this._sheetOpen);
  };

  /** The stops the drawer can rest at, always including shut and fully open. */
  private get _snapPoints(): number[] {
    const configured = this._config?.snap_points;
    if (!configured?.length) return [0, 1];
    const points = configured
      .filter((p) => typeof p === "number" && p >= 0 && p <= 1)
      .sort((a, b) => a - b);
    if (!points.includes(0)) points.unshift(0);
    if (!points.includes(1)) points.push(1);
    return points;
  }

  private _attachGesture(): void {
    if (this._gesture || this._variant !== "sheet") return;
    // Nothing to drag in the editor: the drawer is pinned open there so the
    // cards inside it can be configured.
    if (this._editing) return;

    const body = this.renderRoot?.querySelector<HTMLElement>(".sheet-body");
    const handle = this.renderRoot?.querySelector<HTMLElement>(".handle-zone");
    const content = this.renderRoot?.querySelector<HTMLElement>(".sheet-content");
    const bar = this.renderRoot?.querySelector<HTMLElement>(".bar");
    if (!body || !handle) return;

    this._gesture = new SheetGesture({
      geometry: () => ({ travel: this._sheetTravel, snapPoints: this._snapPoints }),
      current: () => this._sheetFraction,
      onDrag: (fraction) => {
        this._sheetDragging = true;
        this._sheetFraction = fraction;
      },
      onSettle: (fraction) => {
        this._sheetDragging = false;
        // A mid stop is neither open nor shut for the purposes of remembering
        // the state; anything off the floor counts as open.
        this._setSheetOpen(fraction > 0);
        this._sheetFraction = fraction;
      },
      onTap: () => {
        this._sheetDragging = false;
        this._setSheetOpen(!this._sheetOpen);
      },
      reducedMotion: () => !shouldAnimate(this._config?.animation),
    });

    this._gestureCleanups.push(this._gesture.attachHandle(handle));
    if (content) this._gestureCleanups.push(this._gesture.attachContent(content));
    if (bar) this._gestureCleanups.push(this._gesture.attachBar(bar));

    // The drawer's height is whatever its cards add up to, and that changes
    // when one of them does. Measuring it is what turns a percentage transform
    // into a draggable pixel range.
    this._panelObserver = new ResizeObserver(() => this._measurePanel());
    this._panelObserver.observe(body);
    this._measurePanel();
  }

  private _detachGesture(): void {
    for (const cleanup of this._gestureCleanups) cleanup();
    this._gestureCleanups = [];
    this._gesture?.destroy();
    this._gesture = undefined;
    this._panelObserver?.disconnect();
    this._panelObserver = undefined;
  }

  /** Height of the grip strip, which is what stays visible when shut. */
  private get _handleHeight(): number {
    return (
      this.renderRoot?.querySelector<HTMLElement>(".handle-zone")?.offsetHeight ??
      NAV_SHEET_HANDLE_HEIGHT + 2 * NAV_SHEET_HANDLE_PADDING
    );
  }

  /**
   * The drawer's natural height, which is how far it travels.
   *
   * Measured on the body rather than on the panel: the panel's height is what
   * this drives, so measuring it would be circular. The body keeps its natural
   * height at every position and is clipped by the panel instead.
   */
  private _measurePanel(): void {
    const body = this.renderRoot?.querySelector<HTMLElement>(".sheet-body");
    if (!body) return;
    const travel = Math.max(0, body.offsetHeight);
    if (Math.abs(travel - this._sheetTravel) < 1) return;
    this._sheetTravel = travel;
    this.requestUpdate();
  }

  /** The drawer's height cap, as a CSS length. */
  private get _sheetMaxHeight(): string {
    const configured = this._config?.sheet_max_height;
    const short = window.innerHeight > 0 && window.innerHeight < NAV_SHORT_VIEWPORT_PX;
    if (typeof configured === "number") {
      // A phone in landscape: 60vh of drawer would leave nothing of the page it
      // is a drawer for, so the cap applies whatever was configured.
      return `${short ? Math.min(configured, NAV_SHORT_VIEWPORT_MAX_VH) : configured}vh`;
    }
    if (typeof configured === "string" && configured) {
      return short ? `min(${configured}, ${NAV_SHORT_VIEWPORT_MAX_VH}vh)` : configured;
    }
    return `${short ? NAV_SHORT_VIEWPORT_MAX_VH : NAV_SHEET_DEFAULT_MAX_VH}vh`;
  }

  /**
   * Builds the drawer's cards when their config changes, and only then — a nav
   * bar re-renders on every state tick, and rebuilding a nested card there
   * would throw away whatever state it was holding several times a second.
   */
  private async _syncSheetCards(): Promise<void> {
    const configs = this._config?.sheet_cards ?? [];
    const key = JSON.stringify(configs);
    if (key === this._sheetCardsKey) return;
    this._sheetCardsKey = key;
    this._sheetCards = await createCards(configs, this.hass);
    // The build is async, so `hass` may well have arrived while it ran.
    updateCardsHass(this._sheetCards, this.hass);
    this.requestUpdate();
  }

  private _renderSheetHead(): TemplateResult | typeof nothing {
    const cfg = this._config;
    const title = cfg?.sheet_title;
    const action = cfg?.sheet_action;
    if (!title && !action?.icon) return nothing;
    const accent = resolveThemeColor(cfg?.accent_color ?? DEFAULT_NAV_COLOR);
    const tint = tintOn(this, accent, cfg?.accent_opacity, NAV_ITEM_TINT);
    return html`
      <div class="sheet-head">
        <span class="sheet-title">${title ?? ""}</span>
        ${action?.icon
          ? html`
              <div
                class="sheet-action"
                style=${`background: ${tint}; color: ${foregroundOn(accent, tint, 3, this)};`}
                role="button"
                tabindex="0"
                @click=${this._runSheetAction}
                @keydown=${activateOnKey(this._runSheetAction)}
              >
                <ha-icon icon=${action.icon}></ha-icon>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _runActionButton = (e: Event): void => {
    e.stopPropagation();
    const action = this._config?.action_button?.tap_action;
    if (!action || !isActionable(action)) return;
    if (this._config?.haptics !== false) fireHaptic(this, "light");
    handleAction(this, this.hass, action);
  };

  private _runSheetAction = (e: Event): void => {
    e.stopPropagation();
    const action = this._config?.sheet_action?.tap_action;
    if (!action || !isActionable(action)) return;
    if (this._config?.haptics !== false) fireHaptic(this, "light");
    handleAction(this, this.hass, action);
  };

  private _runSheetItem(index: number): void {
    const item = this._config?.sheet_items?.[index];
    if (!item) return;
    const action =
      item.tap_action ??
      (item.path
        ? ({ action: "navigate", navigation_path: item.path } as HaActionConfig)
        : undefined);
    if (!action || !isActionable(action)) return;
    if (this._config?.haptics !== false) fireHaptic(this, "light");
    handleAction(this, this.hass, action);
    if (this._config?.collapse_on_navigate !== false) this._setSheetOpen(false);
  }

  /**
   * The shortcut grid in the drawer.
   *
   * This is what a "more" submenu turns into once there is somewhere to put it:
   * the same entries, laid out as tiles you can actually see at a glance rather
   * than a list you have to open first.
   */
  /**
   * The second line of a list row: an entity's state if it names one, a
   * template's value if it is one, and otherwise the text as written.
   */
  private _secondaryText(value: string | undefined): string {
    const resolved = this._resolve(value);
    if (!resolved) return "";
    const stateObj = this.hass?.states[resolved];
    if (!stateObj) return resolved;
    return this.hass?.formatEntityState?.(stateObj) ?? stateObj.state;
  }

  /**
   * The shortcuts in the drawer.
   *
   * This is what a "more" submenu turns into once there is somewhere to put it:
   * the same entries, laid out where you can see them at a glance rather than
   * a list you have to open first. Two layouts, because they answer different
   * questions — a grid of icons fits the most destinations in the least space,
   * a list gives each one a line to say something about itself.
   */
  private _renderSheetItems(): TemplateResult | typeof nothing {
    const items = this._config?.sheet_items ?? [];
    if (!items.length) return nothing;
    const accent = resolveThemeColor(this._config?.accent_color ?? DEFAULT_NAV_COLOR);
    const list = (this._config?.sheet_item_style ?? "grid") === "list";
    const columns = this._config?.sheet_columns;
    const style =
      !list && columns
        ? `grid-template-columns: repeat(${columns}, minmax(0, 1fr));`
        : "";

    return html`
      <div class="${list ? "sheet-list" : "sheet-grid"}" style=${style}>
        ${items.map((item, index) => {
          const color = resolveThemeColor(this._resolve(item.color) || accent);
          const tint = tintOn(this, color, this._config?.accent_opacity, NAV_ITEM_TINT);
          const glyph = html`
            <span
              class="sheet-tile-glyph"
              style=${`background: ${tint}; color: ${foregroundOn(color, tint, 3, this)};`}
            >
              <ha-icon icon=${this._resolve(item.icon) || DEFAULT_NAV_ICON}></ha-icon>
            </span>
          `;
          const name = this._resolve(item.name);
          const secondary = list ? this._secondaryText(item.secondary) : "";

          return html`
            <div
              class=${list ? "sheet-row" : "sheet-tile"}
              role="button"
              tabindex="0"
              aria-label=${name || item.path || ""}
              @click=${() => this._runSheetItem(index)}
              @keydown=${activateOnKey(() => this._runSheetItem(index))}
            >
              ${glyph}
              ${list
                ? html`
                    <span class="sheet-row-text">
                      <span class="sheet-row-name">${name ?? ""}</span>
                      ${secondary
                        ? html`<span class="sheet-row-secondary">${secondary}</span>`
                        : nothing}
                    </span>
                    <ha-icon class="sheet-row-chevron" icon="mdi:chevron-right"></ha-icon>
                  `
                : name
                  ? html`<span class="sheet-tile-label">${name}</span>`
                  : nothing}
            </div>
          `;
        })}
      </div>
    `;
  }

  private _renderSheetPanel(): TemplateResult {
    // Edit mode always shows the drawer: a collapsed sheet in the editor is a
    // card with nothing in it to configure.
    const open = this._sheetOpen || this._editing;
    const fraction = this._editing ? 1 : this._sheetFraction;
    // Until the panel has been measured, the CSS percentage fallback does the
    // positioning — the drawer is usable from the first frame either way, it
    // just cannot be dragged to a fraction yet.
    // Driven by height rather than by a transform. A transform moves the
    // drawer without moving its layout box, so the sheet's own frame stayed
    // full height and the bar ended up floating at the bottom of an empty
    // container — visible immediately on the first real render.
    const measured = this._sheetTravel > 0;
    // Always a definite pixel value, never `auto`: a height transition with an
    // `auto` on either end does not run, it just stays where it was. The one
    // exception is the editor, where the drawer is pinned open and there is
    // nothing to animate — and where a measurement may not have happened yet,
    // which would otherwise pin it open at zero height.
    const positioned = this._editing
      ? "height: auto;"
      : `height: ${this._handleHeight + fraction * this._sheetTravel}px;`;
    return html`
      <div
        class="sheet-panel ${open ? "open" : ""} ${measured ? "measured" : ""} ${this
          ._sheetDragging
          ? "dragging"
          : ""}"
        style=${positioned}
      >
        <div
          class="handle-zone"
          role="button"
          tabindex="0"
          aria-expanded=${open ? "true" : "false"}
          aria-label=${this._t(open ? "nav_sheet_collapse" : "nav_sheet_expand")}
          @keydown=${activateOnKey(this._toggleSheet)}
        >
          <span class="handle"></span>
        </div>
        <div class="sheet-body">
          ${this._renderSheetHead()}
          <div class="sheet-content" style=${`max-height: ${this._sheetMaxHeight};`}>
            ${this._renderSheetItems()} ${this._sheetCards}
          </div>
        </div>
      </div>
    `;
  }

  // ---- hide on scroll ------------------------------------------------------

  private _attachScroll(): void {
    if (!this._config?.auto_hide_on_scroll) return;
    // HA scrolls an inner element, not the window, and which one depends on the
    // view type — so the listener goes on both and whichever fires wins.
    this._scrollTarget = window;
    this._lastScrollY = window.scrollY;
    window.addEventListener("scroll", this._onScroll, { passive: true, capture: true });
  }

  private _detachScroll(): void {
    if (!this._scrollTarget) return;
    window.removeEventListener("scroll", this._onScroll, { capture: true });
    this._scrollTarget = undefined;
  }

  private _onScroll = (e: Event): void => {
    const target = e.target as HTMLElement | Document;
    const y =
      target instanceof HTMLElement ? target.scrollTop : window.scrollY;
    const delta = y - this._lastScrollY;
    if (Math.abs(delta) < NAV_AUTOHIDE_THRESHOLD_PX) return;
    this._lastScrollY = y;
    // Down hides, up brings it back — the bar gets out of the way of reading
    // and returns the moment someone looks for it.
    const hidden = delta > 0 && y > NAV_BAR_HEIGHT;
    if (hidden !== this._autoHidden) this._autoHidden = hidden;
  };

  // ---- rendering -----------------------------------------------------------

  private _renderBadge(item: ResolvedItem): TemplateResult | typeof nothing {
    const badge = item.badge;
    if (!badge) return nothing;
    if (badge.dot) {
      return html`<span
        class="badge dot"
        style=${`background: ${badge.color};`}
        aria-hidden="true"
      ></span>`;
    }
    const background = badge.color;
    return html`<span
      class="badge"
      style=${`background: ${background}; color: ${foregroundOn("#ffffff", background, 4.5, this)};`}
      >${badge.text}</span
    >`;
  }

  /**
   * The open submenu, positioned against the entry that opened it.
   *
   * Rendered as a sibling of the bar rather than inside it: the glass bar sets
   * `transform: translateZ(0)` for its own compositor layer, and a transform
   * makes an element the containing block for any fixed-position descendant —
   * a menu inside it would be positioned against the bar instead of against
   * the viewport, and clipped by it.
   */
  private _renderSubmenu(): TemplateResult | typeof nothing {
    const index = this._submenuFor;
    if (index === undefined) return nothing;
    const entries = this._config?.items?.[index]?.submenu ?? [];
    if (!entries.length) return nothing;

    const anchor = this._submenuAnchor;
    const width = Math.max(
      NAV_SUBMENU_MIN_WIDTH,
      anchor?.width ?? NAV_SUBMENU_MIN_WIDTH,
    );
    const viewport = window.innerWidth;
    // Centred on the entry, then pulled back inside the screen: an entry at the
    // far edge would otherwise open a menu half off it.
    const rawLeft = (anchor?.left ?? 0) + (anchor?.width ?? 0) / 2 - width / 2;
    const left = Math.max(
      NAV_FLOAT_INSET,
      Math.min(rawLeft, viewport - width - NAV_FLOAT_INSET),
    );
    const fromTop = this._position === "top";
    const vertical = fromTop
      ? `top: ${(anchor?.bottom ?? 0) + NAV_SUBMENU_PADDING}px;`
      : `bottom: ${window.innerHeight - (anchor?.top ?? 0) + NAV_SUBMENU_PADDING}px;`;
    // The menu grows out of the button that opened it, so the origin follows
    // the anchor rather than sitting in the middle of the menu.
    const originX = (anchor?.left ?? 0) + (anchor?.width ?? 0) / 2 - left;
    const accent = resolveThemeColor(
      this._resolve(this._config?.items?.[index]?.color) ||
        this._config?.accent_color ||
        DEFAULT_NAV_COLOR,
    );

    return html`
      <div
        class="submenu ${shouldAnimate(this._config?.animation) ? "" : "no-animations"}"
        role="menu"
        style=${`left: ${left}px; width: ${width}px; ${vertical} transform-origin: ${originX}px ${
          fromTop ? "0" : "100%"
        };`}
      >
        ${entries.map((entry, entryIndex) => {
          const tint = tintOn(this, accent, undefined, NAV_SUBMENU_TINT);
          return html`
            <div
              class="submenu-row"
              role="menuitem"
              tabindex="0"
              @click=${() => this._runSubmenuEntry(index, entryIndex)}
              @keydown=${activateOnKey(() => this._runSubmenuEntry(index, entryIndex))}
            >
              ${entry.icon
                ? html`<span class="submenu-glyph" style=${`background: ${tint};`}>
                    <ha-icon icon=${entry.icon}></ha-icon>
                  </span>`
                : nothing}
              <span class="submenu-label">${entry.name ?? entry.path ?? ""}</span>
            </div>
          `;
        })}
      </div>
    `;
  }

  private _renderItem(item: ResolvedItem): TemplateResult {
    const labels = this._labelVisibility;
    const showLabel =
      !!item.name && (labels === "always" || (labels === "active_only" && item.active));
    const icons = this._iconVisibility;
    const showIcon =
      icons === "always" || (icons === "active_only" && item.active);
    const handler = this._tapHoldFor(item);
    const pressed = this._pressed === item.index;
    // A solid fill is the reference look; the ink on it is chosen between the
    // house dark and white rather than nudged, because shifting a colour the
    // author picked is the wrong move on a fill they can see.
    const solid = (this._config?.active_style ?? "tint") === "solid";
    const fill = solid
      ? fillColor(this, item.color)
      : tintOn(this, item.color, this._config?.accent_opacity, NAV_ITEM_TINT);
    const ink = item.active
      ? solid
        ? inkOn(fill, this)
        : foregroundOn(item.color, fill, 4.5, this)
      : "var(--nav-ink)";
    // The pill goes round the glyph in the stacked variants and round the whole
    // entry in the horizontal ones, so the inline colours are set on whichever
    // element is carrying it.
    const indicator = item.active ? `background: ${fill}; color: ${ink};` : "";

    return html`
      <div
        class="item ${item.active ? "active" : ""} ${pressed ? "pressed" : ""} ${item.disabled
          ? "disabled"
          : ""} ${showIcon ? "" : "labels-only"} ${
          this._config?.item_background ? "plated" : ""
        }"
        data-index=${item.index}
        style=${this._stacked ? nothing : indicator}
        role="button"
        aria-haspopup=${item.config.submenu?.length ? "menu" : nothing}
        aria-expanded=${item.config.submenu?.length
          ? this._submenuFor === item.index
            ? "true"
            : "false"
          : nothing}
        tabindex=${item.disabled ? nothing : "0"}
        aria-current=${item.active ? "page" : nothing}
        aria-disabled=${item.disabled ? "true" : nothing}
        aria-label=${item.name || item.config.path || ""}
        title=${item.name || ""}
        @pointerdown=${item.disabled ? nothing : handler.down}
        @pointermove=${item.disabled ? nothing : handler.move}
        @pointerup=${item.disabled ? nothing : handler.up}
        @pointercancel=${item.disabled ? nothing : handler.up}
        @click=${item.disabled ? nothing : handler.click}
        @keydown=${item.disabled ? nothing : activateOnKey(handler.click)}
      >
        ${showIcon
          ? html`
              <span class="glyph" style=${this._stacked ? indicator : nothing}>
                <ha-icon icon=${item.icon}></ha-icon>
                ${this._renderBadge(item)}
              </span>
            `
          : nothing}
        ${showLabel
          ? html`<span class="label">${item.name}</span>`
          : nothing}
        ${showIcon ? nothing : this._renderBadge(item)}
      </div>
    `;
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg) return nothing;
    // A card that hides itself still occupies its grid slot; that is the
    // dashboard's business, not the card's, and matches every other
    // conditionally-empty card in the suite.
    if (this._resolveBool(cfg.hidden)) return nothing;
    if (this._layout.hidden) return nothing;

    const items = this._resolvedItems;
    if (!items.length) {
      return html`<div class="empty">${this._t("nav_no_items")}</div>`;
    }

    const common = resolveCommonColors(cfg);
    const scale = this._size;
    const width = this._maxWidth;
    const container = cfg.container_style ?? (cfg.glass_background === false ? "solid" : "glass");
    const cssVars = buildCssVars({
      "nav-ink": common.textColorCss,
      "nav-muted": common.secondaryTextColorCss,
      "nav-bg": cfg.card_background ? resolveThemeColor(cfg.card_background) : undefined,
      "nav-scale": String(scale),
      "nav-radius": `${cfg.radius ?? NAV_FLOAT_RADIUS}px`,
      "nav-max-width": width.css,
      "nav-glyph": cfg.icon_size !== undefined ? `${cfg.icon_size}px` : undefined,
      "nav-blur": cfg.blur !== undefined ? `${cfg.blur}px` : undefined,
      "nav-opacity": cfg.container_opacity !== undefined ? String(cfg.container_opacity / 100) : undefined,
      "nav-z": String(NAV_Z_INDEX),
      // How far the bar keeps from the screen edge. Each variant has its own
      // sensible default in the stylesheet, so this is only set when it was
      // actually configured — a floating bar and a docked one do not want the
      // same number.
      "nav-edge": cfg.edge_distance !== undefined ? `${cfg.edge_distance}px` : undefined,
    });
    // The documented advanced escape hatch, applied last so it can override
    // anything the card computed. Deliberately not sanitised beyond being a
    // property/value map — it is the card_mod-shaped door, and it is the user's
    // own stylesheet.
    const freeStyles = Object.entries(cfg.styles ?? {})
      .map(([k, v]) => `${k}: ${v};`)
      .join(" ");

    const animated = shouldAnimate(cfg.animation);
    const bubble = cfg.action_button?.icon
      ? (() => {
          const color = resolveThemeColor(
            cfg.action_button?.color ?? cfg.accent_color ?? DEFAULT_NAV_COLOR,
          );
          const tint = tintOn(this, color, cfg.accent_opacity, NAV_ITEM_TINT);
          return html`
            <div
              class="bubble ${container}"
              role="button"
              tabindex="0"
              aria-label=${this._t("editor_nav_action_button")}
              style=${`color: ${foregroundOn(color, tint, 3, this)};`}
              @click=${this._runActionButton}
              @keydown=${activateOnKey(this._runActionButton)}
            >
              <ha-icon icon=${cfg.action_button!.icon}></ha-icon>
            </div>
          `;
        })()
      : nothing;
    const widthClass = `${width.css ? "capped" : ""} ${width.fit ? "fit" : ""}`;
    const bar = html`
      <nav
        class="bar ${container} ${widthClass} ${this._autoHidden
          ? "auto-hidden"
          : ""} ${animated ? "" : "no-animations"}"
        style=${`${cssVars} ${freeStyles}`}
        aria-label=${cfg.name || this._t("nav_label")}
      >
        ${items.map((item) => this._renderItem(item))}
      </nav>
    `;

    const barRow =
      bubble === nothing
        ? bar
        : html`<div class="bar-row">${bar}${bubble}</div>`;

    const body =
      this._variant === "sheet" && this._sheetHasContent
        ? html`
            <div
              class="sheet ${container} ${widthClass} ${animated ? "" : "no-animations"}"
              style=${`${cssVars} ${freeStyles}`}
            >
              ${this._renderSheetPanel()} ${bar}
            </div>
          `
        : barRow;

    if (!this._editing) return html`${body}${this._renderSubmenu()}`;

    // In the editor the bar is drawn in the flow, and a bar in the flow is a
    // thin strip with a lot of empty space in it — which reads as an empty
    // card, not as a navigation bar someone can click to configure. The frame
    // says what it is and gives the slot a shape worth aiming at.
    return html`
      <div class="edit-frame">
        <div class="edit-label">
          <ha-icon icon="mdi:dock-bottom"></ha-icon>
          <span>${this._t("nav_edit_label")}</span>
          <span class="edit-meta">
            ${this._t(VARIANT_LABEL_KEYS[this._variant])} ·
            ${this._t("nav_edit_entries").replace("{n}", String(items.length))}
          </span>
        </div>
        ${this._variant === "sheet" && !this._sheetHasContent
          ? html`<div class="edit-warn">${this._t("nav_sheet_empty")}</div>`
          : nothing}
        ${this._drawerlessWidths.length
          ? html`<div class="edit-warn">
              ${this._t("nav_sheet_wrong_variant").replace(
                "{where}",
                this._drawerlessWidths.map((k) => this._t(k)).join(" / "),
              )}
            </div>`
          : nothing}
        ${body}
      </div>
      ${this._renderSubmenu()}
    `;
  }

  static styles = css`
    :host {
      display: block;
      -webkit-tap-highlight-color: transparent;
    }

    /* The docked variants leave the card flow entirely. Their grid slot then
       collapses, which is the point: the bar sits over the view rather than
       taking a row of it. Only "segmented" stays in flow. */
    :host([variant="footer"]),
    :host([variant="header"]),
    :host([variant="floating"]),
    :host([variant="sheet"]) {
      position: fixed;
      /* Measured from the slot the card was given, so the bar lines up with the
         content instead of running underneath Home Assistant's sidebar. Fixed
         positioning is against the viewport, which knows nothing about either. */
      left: var(--nav-dock-left, 0px);
      right: var(--nav-dock-right, 0px);
      z-index: var(--nav-z, ${NAV_Z_INDEX});
      pointer-events: none;
    }

    :host([variant="footer"][edge="bottom"]),
    :host([variant="floating"][edge="bottom"]),
    :host([variant="sheet"][edge="bottom"]) {
      bottom: 0;
    }

    :host([variant="header"][edge="top"]),
    :host([variant="footer"][edge="top"]),
    :host([variant="floating"][edge="top"]),
    :host([variant="sheet"][edge="top"]) {
      top: 0;
    }

    /* Everything inside the bar takes pointer events back; the host itself
       stays transparent to them so the view behind it stays usable where the
       bar does not actually cover it. */
    .bar {
      pointer-events: auto;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-around;
      gap: calc(${NAV_BAR_GAP}px * var(--nav-scale, 1));
      padding: calc(${NAV_BAR_PADDING}px * var(--nav-scale, 1));
      min-height: calc(${NAV_BAR_HEIGHT}px * var(--nav-scale, 1));
      color: var(--nav-ink, var(--primary-text-color));
      transition: transform ${unsafeCSS(NAV_AUTOHIDE_MS)}ms ${EASING};
    }

    /* The surface sits on whichever element is the outer frame: the bar on its
       own for four of the variants, the sheet for the fifth — where the bar is
       one part of a larger box and draws nothing itself. */
    .bar.glass,
    .sheet.glass,
    .bubble.glass {
      background: var(
        --nav-bg,
        color-mix(
          in srgb,
          var(--ha-card-background, var(--card-background-color)) 55%,
          transparent
        )
      );
      backdrop-filter: blur(var(--nav-blur, 20px));
      -webkit-backdrop-filter: blur(var(--nav-blur, 20px));
      /* Its own compositor layer: two adjacent backdrop-filter elements
         otherwise show a seam where their GPU tiles meet. */
      transform: translateZ(0);
      isolation: isolate;
      border: 1px solid rgba(100, 100, 100, 0.25);
    }

    .bar.solid,
    .sheet.solid,
    .bubble.solid {
      background: var(--nav-bg, var(--ha-card-background, var(--card-background-color)));
      border: 1px solid rgba(100, 100, 100, 0.25);
    }

    .bar.transparent,
    .sheet.transparent,
    .bubble.transparent {
      background: none;
      border: none;
    }

    /* A capped bar is centred in whatever it docks to. Full width is right on a
       phone and usually far too much on a desktop, where a bar stretched across
       2000px puts its entries nowhere near each other. */
    .bar.capped,
    .sheet.capped {
      max-width: var(--nav-max-width, none);
    }

    /* Written with the host selector rather than as two bare classes so it
       outranks the per-variant margin above it. Two bare classes lose to the
       floating variant's own rule, and the bar then sits hard against the left
       edge at its capped width instead of centred — which is precisely what it
       did. */
    :host([variant]) .bar.capped,
    :host([variant]) .sheet.capped {
      margin-left: auto;
      margin-right: auto;
    }

    /* Exactly as wide as the entries need: they stop sharing the row out
       between them and take only their own content. */
    :host([variant]) .bar.fit .item,
    :host([variant]) .sheet.fit .item {
      /* Content-sized and never shrinking: the whole point of hugging the
         entries is that each one keeps its own width. A per-variant rule used
         to outrank this, so the entries went on shrinking and their labels
         were ellipsised down to a single letter. */
      flex: 0 0 auto;
      /* Hugging the entries makes them touch, so they get their own padding
         back — a row of labels with no gap between them reads as one word. */
      padding: 0 10px;
    }

    /* Entries that keep their width can add up to more than the screen, so the
       bar scrolls rather than clipping the last one off the edge. */
    :host([variant]) .bar.fit {
      overflow-x: auto;
      scrollbar-width: none;
      max-width: min(var(--nav-max-width, 100%), 100%);
    }

    :host([variant]) .bar.fit::-webkit-scrollbar {
      display: none;
    }

    .bar.fit,
    .sheet.fit {
      gap: calc(${NAV_BAR_GAP}px * var(--nav-scale, 1) + 4px);
    }

    :host([variant="footer"]) .bar,
    :host([variant="header"]) .bar {
      border-radius: 0;
      border-left: none;
      border-right: none;
      opacity: var(--nav-opacity, 1);
      padding-bottom: calc(
        var(--nav-edge, calc(${NAV_BAR_PADDING}px * var(--nav-scale, 1))) +
        var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
      );
    }

    :host([variant="header"]) .bar {
      padding-bottom: calc(${NAV_BAR_PADDING}px * var(--nav-scale, 1));
      padding-top: calc(
        var(--nav-edge, calc(${NAV_BAR_PADDING}px * var(--nav-scale, 1))) +
        var(--safe-area-inset-top, env(safe-area-inset-top, 0px))
      );
    }

    :host([variant="floating"]) .bar,
    :host([variant="sheet"]) .bar {
      margin: var(--nav-edge, ${NAV_FLOAT_INSET}px);
      /* The home bar on an iPhone sits exactly where a bottom-docked bar wants
         to be, so the inset is added to the margin rather than to the padding —
         the bar moves up instead of growing a dead strip. */
      margin-bottom: calc(
        var(--nav-edge, ${NAV_FLOAT_INSET}px) +
        var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
      );
      border-radius: var(--nav-radius, ${NAV_FLOAT_RADIUS}px);
      opacity: var(--nav-opacity, 1);
    }

    :host([variant="segmented"]) .bar {
      border-radius: calc(${NAV_SEGMENT_RADIUS}px * var(--nav-scale, 1));
      min-height: calc(${NAV_SEGMENT_HEIGHT}px * var(--nav-scale, 1));
      padding: calc(${NAV_SEGMENT_PADDING}px * var(--nav-scale, 1));
      gap: calc(${NAV_SEGMENT_PADDING}px * var(--nav-scale, 1));
    }

    .bar.auto-hidden {
      transform: translateY(calc(100% + ${NAV_FLOAT_INSET}px));
    }

    :host([edge="top"]) .bar.auto-hidden {
      transform: translateY(calc(-100% - ${NAV_FLOAT_INSET}px));
    }

    .item {
      position: relative;
      flex: 1 1 0;
      min-width: calc(${NAV_ITEM_MIN_WIDTH}px * var(--nav-scale, 1));
      min-height: calc(${NAV_ITEM_HEIGHT}px * var(--nav-scale, 1));
      border-radius: calc(${NAV_ITEM_RADIUS}px * var(--nav-scale, 1));
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      cursor: pointer;
      color: inherit;
      opacity: ${NAV_ITEM_INACTIVE_OPACITY};
      transition:
        border-radius ${unsafeCSS(NAV_PRESS_MS)}ms ${EASING},
        background ${unsafeCSS(NAV_PRESS_MS)}ms ${EASING},
        opacity ${unsafeCSS(NAV_PRESS_MS)}ms ${EASING};
    }

    /* The horizontal variants read as tabs: each entry is as wide as its own
       label, and the pill goes round the whole thing. Stretching them across a
       wide screen would light up a third of it for one page. */
    :host([variant="segmented"]) .item,
    :host([variant="header"]) .item {
      flex: 0 1 auto;
      flex-direction: row;
      gap: 8px;
      padding: 0 14px;
      min-width: 0;
      min-height: calc(
        (${NAV_SEGMENT_HEIGHT}px - 2 * ${NAV_SEGMENT_PADDING}px) * var(--nav-scale, 1)
      );
      border-radius: calc(${NAV_SEGMENT_ITEM_RADIUS}px * var(--nav-scale, 1));
    }

    /* Tabs that do not fit scroll sideways rather than shrinking into
       illegibility. "safe center" keeps them centred while they do fit and
       stops the first one being clipped out of reach once they do not. */
    :host([variant="segmented"]) .bar,
    :host([variant="header"]) .bar {
      justify-content: safe center;
      overflow-x: auto;
      scrollbar-width: none;
    }

    :host([variant="segmented"]) .bar::-webkit-scrollbar,
    :host([variant="header"]) .bar::-webkit-scrollbar {
      display: none;
    }

    /* Every entry on its own faint surface, not only the current one — the
       header-tabs design draws the inactive tabs as pills too. */
    .item.plated:not(.active) {
      background: rgba(127, 127, 127, 0.14);
    }

    .item.active {
      opacity: 1;
      font-weight: 600;
    }

    .item.pressed {
      border-radius: calc(${NAV_ITEM_RADIUS_ACTIVE}px * var(--nav-scale, 1));
    }

    .item.pressed .glyph {
      border-radius: calc(${NAV_INDICATOR_RADIUS_ACTIVE}px * var(--nav-scale, 1));
    }

    .item.disabled {
      cursor: default;
      opacity: 0.3;
    }

    .item:focus-visible {
      outline: 2px solid var(--nav-ink, var(--primary-text-color));
      outline-offset: 2px;
    }

    .glyph {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-size: var(--nav-glyph, calc(${NAV_ITEM_GLYPH}px * var(--nav-scale, 1)));
      transition:
        border-radius ${unsafeCSS(NAV_PRESS_MS)}ms ${EASING},
        background ${unsafeCSS(NAV_PRESS_MS)}ms ${EASING};
    }

    /* Stacked variants: the pill is this box, sized to the icon, with the label
       underneath it rather than inside. */
    :host([variant="footer"]) .glyph,
    :host([variant="floating"]) .glyph,
    :host([variant="sheet"]) .glyph {
      /* The pill grows with the glyph rather than staying put, or a bigger icon
         sits in a box that no longer contains it. */
      width: max(
        calc(${NAV_INDICATOR_WIDTH}px * var(--nav-scale, 1)),
        calc(var(--nav-glyph, ${NAV_ITEM_GLYPH}px) * 2.2)
      );
      height: max(
        calc(${NAV_INDICATOR_HEIGHT}px * var(--nav-scale, 1)),
        calc(var(--nav-glyph, ${NAV_ITEM_GLYPH}px) * 1.35)
      );
      border-radius: calc(${NAV_INDICATOR_RADIUS}px * var(--nav-scale, 1));
    }

    :host(:not([variant="segmented"]):not([variant="header"])) .item.labels-only {
      flex-direction: row;
      padding: 0 14px;
    }

    .item.labels-only .label {
      font-size: calc(${NAV_ITEM_LABEL_SIZE + 2}px * var(--nav-scale, 1));
    }

    .label {
      font-size: calc(${NAV_ITEM_LABEL_SIZE}px * var(--nav-scale, 1));
      line-height: 1.2;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge {
      position: absolute;
      top: -4px;
      right: -8px;
      height: ${NAV_BADGE_HEIGHT}px;
      min-width: ${NAV_BADGE_HEIGHT}px;
      box-sizing: border-box;
      padding: 0 ${NAV_BADGE_PADDING}px;
      border-radius: ${NAV_BADGE_RADIUS}px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: ${NAV_BADGE_FONT}px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      pointer-events: none;
    }

    .badge.dot {
      top: -2px;
      right: -2px;
      width: ${NAV_BADGE_DOT}px;
      min-width: 0;
      height: ${NAV_BADGE_DOT}px;
      padding: 0;
      border-radius: 50%;
    }

    /* A round button set beside the bar rather than inside it — the reference
       designs put search there, detached, so it reads as its own thing rather
       than as another destination. */
    .bar-row {
      pointer-events: auto;
      display: flex;
      align-items: stretch;
      justify-content: center;
      gap: 8px;
    }

    /* A capped bar centres itself with auto margins, which inside the row
       shoves the button out to the far edge instead of leaving it beside the
       bar. The row does the centring when there is a button in it. */
    :host([variant]) .bar-row .bar.capped {
      margin-left: 0;
      margin-right: 0;
    }

    :host([variant="floating"]) .bar-row,
    :host([variant="sheet"]) .bar-row {
      margin: var(--nav-edge, ${NAV_FLOAT_INSET}px);
      margin-bottom: calc(
        var(--nav-edge, ${NAV_FLOAT_INSET}px) +
        var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
      );
    }

    :host([variant="floating"]) .bar-row .bar,
    :host([variant="sheet"]) .bar-row .bar {
      margin: 0;
      flex: 1;
      min-width: 0;
    }

    .bubble {
      flex-shrink: 0;
      align-self: center;
      width: calc(${NAV_BAR_HEIGHT}px * var(--nav-scale, 1));
      height: calc(${NAV_BAR_HEIGHT}px * var(--nav-scale, 1));
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      --mdc-icon-size: var(--nav-glyph, calc(${NAV_ITEM_GLYPH}px * var(--nav-scale, 1)));
    }

    :host([variant="segmented"]) .bubble,
    :host([variant="header"]) .bubble {
      width: calc(${NAV_SEGMENT_HEIGHT}px * var(--nav-scale, 1));
      height: calc(${NAV_SEGMENT_HEIGHT}px * var(--nav-scale, 1));
    }

    .bubble:focus-visible {
      outline: 2px solid var(--nav-ink, var(--primary-text-color));
      outline-offset: 2px;
    }

    /* ---- sheet ---- */

    /* The sheet's own frame carries the glass; the bar inside it draws none, or
       the two surfaces would stack into a double-tinted strip. */
    .sheet {
      pointer-events: auto;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      margin: var(--nav-edge, ${NAV_FLOAT_INSET}px);
      margin-bottom: calc(
        var(--nav-edge, ${NAV_FLOAT_INSET}px) +
        var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
      );
      border-radius: var(--nav-radius, ${NAV_FLOAT_RADIUS}px);
      opacity: var(--nav-opacity, 1);
      color: var(--nav-ink, var(--primary-text-color));
    }

    .sheet .bar {
      background: none !important;
      border: none !important;
      border-radius: 0;
      margin: 0;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      /* Above the panel, so a collapsed drawer slides away behind it and only
         the handle strip stays out. */
      position: relative;
      z-index: 1;
    }

    /* The drawer's height is what opens and shuts it, so its layout box shrinks
       with it and the bar stays where it belongs. Before the body has been
       measured, these two classes do the same job in percentages. */
    .sheet-panel {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      height: ${NAV_SHEET_HANDLE_HEIGHT + 2 * NAV_SHEET_HANDLE_PADDING}px;
    }

    /* The transition is added only once the drawer has been measured, and the
       height is a definite pixel value at every position from then on. A
       transition with "auto" on either end does not run at all — it silently
       stays put, which is exactly what an earlier version of this did. */
    .sheet-panel.measured {
      transition: height ${unsafeCSS(NAV_SHEET_SETTLE_MS)}ms ${EASING};
    }

    /* The body keeps its natural height at every position — the panel clips it
       rather than squashing it, so the content does not reflow while dragging. */
    .sheet-body {
      flex: none;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    /* While a finger is down the height is written on every frame, so a
       transition would make the drawer lag behind the finger by its whole
       duration. It comes back for the settle. */
    .sheet-panel.dragging {
      transition: none;
    }

    .no-animations .sheet-panel {
      transition: none;
    }

    .handle-zone {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: ${NAV_SHEET_HANDLE_PADDING}px 0;
      cursor: grab;
      /* Only the grip refuses the browser's own panning — the drawer's content
         has to keep scrolling normally. */
      touch-action: none;
    }

    .handle-zone:focus-visible {
      outline: 2px solid var(--nav-ink, var(--primary-text-color));
      outline-offset: -2px;
      border-radius: 8px;
    }

    .handle {
      width: ${NAV_SHEET_HANDLE_WIDTH}px;
      height: ${NAV_SHEET_HANDLE_HEIGHT}px;
      border-radius: ${NAV_SHEET_HANDLE_RADIUS}px;
      background: currentColor;
      opacity: ${NAV_SHEET_HANDLE_OPACITY};
    }

    .sheet-head {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 2px 16px 10px;
    }

    .sheet-title {
      flex: 1;
      min-width: 0;
      font-size: ${NAV_SHEET_TITLE_SIZE}px;
      font-weight: 700;
      letter-spacing: -0.2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sheet-action {
      flex-shrink: 0;
      width: ${NAV_SHEET_ACTION_SIZE}px;
      height: ${NAV_SHEET_ACTION_SIZE}px;
      border-radius: ${NAV_SHEET_ACTION_RADIUS}px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      --mdc-icon-size: 18px;
    }

    .sheet-action:focus-visible {
      outline: 2px solid var(--nav-ink, var(--primary-text-color));
      outline-offset: 2px;
    }

    .sheet-content {
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 0 12px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Fits as many tiles per row as the drawer is wide, which is the right
       answer on both a phone and a desktop without either being configured. */
    .sheet-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
      gap: 8px;
    }

    .sheet-tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 10px 4px;
      border-radius: ${NAV_ITEM_RADIUS}px;
      cursor: pointer;
      transition: border-radius ${unsafeCSS(NAV_PRESS_MS)}ms ${EASING};
    }

    .sheet-tile:active {
      border-radius: ${NAV_ITEM_RADIUS_ACTIVE}px;
    }

    .sheet-tile:focus-visible {
      outline: 2px solid var(--nav-ink, var(--primary-text-color));
      outline-offset: 2px;
    }

    .sheet-tile-glyph {
      width: 44px;
      height: 44px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-size: 22px;
    }

    .sheet-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sheet-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-radius: ${NAV_ITEM_RADIUS}px;
      cursor: pointer;
      /* The row is a surface of its own, the way the reference design draws it:
         a tinted well for the icon on a slightly lifted plate. */
      background: rgba(127, 127, 127, 0.1);
      transition: border-radius ${unsafeCSS(NAV_PRESS_MS)}ms ${EASING};
    }

    .sheet-row:active {
      border-radius: ${NAV_ITEM_RADIUS_ACTIVE}px;
    }

    .sheet-row:hover,
    .sheet-row:focus-visible {
      background: rgba(127, 127, 127, 0.16);
      outline: none;
    }

    .sheet-row-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .sheet-row-name {
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sheet-row-secondary {
      font-size: 12px;
      opacity: 0.6;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sheet-row-chevron {
      flex-shrink: 0;
      opacity: 0.45;
      --mdc-icon-size: 20px;
    }

    .sheet-tile-label {
      max-width: 100%;
      font-size: 11px;
      line-height: 1.2;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Being edited or previewed, or a second sheet on the same view: the card
       goes back into the flow so it can be seen, measured by the grid, and
       configured. */
    :host([inline]) {
      position: static !important;
      pointer-events: auto;
    }

    :host([inline]) .sheet,
    :host([inline]) .bar {
      margin: 0;
    }

    /* Without the fixed frame there is nothing to line the bar up against, so
       the docking offsets have to stop applying too. */
    :host([inline]) .bar {
      border-radius: var(--nav-radius, ${NAV_FLOAT_RADIUS}px);
    }

    :host([variant="header"][inline]) .bar,
    :host([variant="footer"][inline]) .bar {
      border-left: 1px solid rgba(100, 100, 100, 0.25);
      border-right: 1px solid rgba(100, 100, 100, 0.25);
      padding-bottom: calc(${NAV_BAR_PADDING}px * var(--nav-scale, 1));
      padding-top: calc(${NAV_BAR_PADDING}px * var(--nav-scale, 1));
    }

    /* ---- submenu ---- */

    .submenu {
      position: fixed;
      z-index: calc(var(--nav-z, ${NAV_Z_INDEX}) + 1);
      box-sizing: border-box;
      pointer-events: auto;
      padding: ${NAV_SUBMENU_PADDING}px;
      min-width: ${NAV_SUBMENU_MIN_WIDTH}px;
      border-radius: ${NAV_SUBMENU_RADIUS}px;
      border: 1px solid rgba(100, 100, 100, 0.25);
      background: color-mix(
        in srgb,
        var(--ha-card-background, var(--card-background-color)) 92%,
        transparent
      );
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: var(--nav-ink, var(--primary-text-color));
      animation: submenu-in ${unsafeCSS(NAV_SUBMENU_MS)}ms ${EASING};
    }

    @keyframes submenu-in {
      from {
        opacity: 0;
        transform: scale(0.82);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .submenu.no-animations {
      animation: none;
    }

    .submenu-row {
      display: flex;
      align-items: center;
      gap: 10px;
      height: ${NAV_SUBMENU_ROW_HEIGHT}px;
      padding: 0 10px;
      border-radius: ${NAV_SUBMENU_ROW_RADIUS}px;
      cursor: pointer;
      font-size: 13px;
      transition: background ${unsafeCSS(NAV_PRESS_MS)}ms ${EASING};
    }

    .submenu-row:hover,
    .submenu-row:focus-visible {
      background: rgba(127, 127, 127, 0.16);
      outline: none;
    }

    .submenu-glyph {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-size: 17px;
    }

    .submenu-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ---- editor frame ---- */

    .edit-frame {
      pointer-events: auto;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border: 1px dashed rgba(127, 127, 127, 0.5);
      border-radius: 16px;
    }

    .edit-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--nav-ink, var(--primary-text-color));
      opacity: 0.75;
      --mdc-icon-size: 16px;
    }

    .edit-meta {
      font-weight: 400;
      opacity: 0.8;
    }

    .edit-warn {
      font-size: 12px;
      line-height: 1.4;
      color: var(--error-color, #e57368);
      opacity: 0.9;
    }

    .empty {
      pointer-events: auto;
      padding: 12px;
      font-size: 13px;
      opacity: 0.6;
      color: var(--primary-text-color);
    }

    .no-animations,
    .no-animations .item {
      transition: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-nav-card": M3NavCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-nav-card",
  name: "M3 Nav Card",
  description:
    "Navigationsleiste für das Dashboard — als Kopf-, Fußzeile, Segment-Pille oder schwebende Leiste, mit Badges, Templates und getrennten Layouts für Desktop und Handy.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
