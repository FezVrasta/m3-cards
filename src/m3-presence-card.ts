import { LitElement, html, css, unsafeCSS, nothing, type PropertyValues } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3PresenceCardConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  HassEntity,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_PRESENCE_RADIUS,
  DEFAULT_PRESENCE_ICON,
  PRESENCE_AVATAR_SIZE,
  PRESENCE_AVATAR_RADIUS,
  PRESENCE_DOT_SIZE,
  PRESENCE_RING_WIDTH,
  PRESENCE_GRID_GAP,
  PRESENCE_GRID_MIN_COL,
  PRESENCE_COLOR_HOME,
  PRESENCE_COLOR_NOT_HOME,
  PRESENCE_COLOR_ZONE,
  PRESENCE_COLOR_UNKNOWN,
  resolveCornerRadius,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors, tintBackground } from "./shared/color-config";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import { renderCardHeader, cardHeaderStyles } from "./shared/card-header";
import { shouldAnimate } from "./shared/animation";
import { activateOnKey } from "./shared/a11y";
import { discoverPersonEntities } from "./shared/ha-registry";
import { fireEvent } from "./shared/editor-helpers";
import { localize, type TranslationKey } from "./localize";

console.info(
  `%c M3-PRESENCE-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #85b7eb; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #85b7eb; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const HOLD_MS = 500;

interface PersonRow {
  entityId: string;
  name: string;
  entity: HassEntity;
  status: "home" | "not_home" | "zone" | "unknown";
  zoneName?: string;
  color: string;
  icon: string;
}

@customElement("m3-presence-card")
export class M3PresenceCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3PresenceCardConfig;
  @state() private _discovered: string[] = [];

  @query(".map-wrap") private _mapWrapEl?: HTMLDivElement;

  private _discoverInFlight = false;
  private _lastDiscoverKey?: string;
  private _holdTimer?: number;
  private _holdFired = false;
  private _mapCardEl?: HTMLElement & { hass?: HomeAssistant; setConfig?: (c: unknown) => void };
  private _mapEntityKey?: string;

  public static getStubConfig(): M3PresenceCardConfig {
    return {
      type: "custom:m3-presence-card",
      auto_discover: true,
      glass_background: true,
    };
  }

  public setConfig(config: M3PresenceCardConfig): void {
    this._config = {
      glass_background: true,
      animation: "auto",
      auto_discover: config.entities ? false : true,
      sort: "home_first",
      show_distance: true,
      show_since: true,
      show_map: false,
      ...config,
    };
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_rows: 3 };
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-presence-card-editor");
    return document.createElement("m3-presence-card-editor") as unknown as LovelaceCardEditor;
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this._maybeDiscover();
    this._syncMapCard();
  }

  private _syncMapCard(): void {
    if (!this._config?.show_map || !this.hass || !this._mapWrapEl) {
      this._mapCardEl = undefined;
      this._mapEntityKey = undefined;
      return;
    }
    if (this._mapCardEl && this._mapCardEl.parentElement !== this._mapWrapEl) {
      this._mapCardEl = undefined;
      this._mapEntityKey = undefined;
    }
    const rows = this._buildRows();
    if (rows.length === 0) return;
    const entityIds = rows.map((r) => r.entityId);
    const key = entityIds.join(",");
    if (!this._mapCardEl) {
      const ctor = customElements.get("hui-map-card");
      if (!ctor) return;
      try {
        this._mapCardEl = document.createElement("hui-map-card") as HTMLElement & {
          hass?: HomeAssistant;
          setConfig?: (c: unknown) => void;
        };
        this._mapWrapEl.appendChild(this._mapCardEl);
      } catch (e) {
        console.warn("m3-presence-card: failed to create hui-map-card", e);
        return;
      }
    }
    if (key !== this._mapEntityKey) {
      this._mapEntityKey = key;
      try {
        this._mapCardEl.setConfig?.({
          type: "map",
          entities: entityIds.map((id) => ({ entity: id })),
        });
      } catch (e) {
        console.warn("m3-presence-card: hui-map-card setConfig failed", e);
      }
    }
    this._mapCardEl.hass = this.hass;
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._holdTimer !== undefined) window.clearTimeout(this._holdTimer);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _maybeDiscover(): void {
    if (!this.hass || !this._config || !(this._config.auto_discover ?? true) || this._discoverInFlight) return;
    const key = JSON.stringify({
      area: this._config.include_area,
      label: this._config.include_label,
      exclude: this._config.exclude_entities,
    });
    if (key === this._lastDiscoverKey) return;
    this._lastDiscoverKey = key;
    this._discoverInFlight = true;
    discoverPersonEntities(this.hass, {
      includeAreas: this._config.include_area,
      includeLabels: this._config.include_label,
      excludeEntities: this._config.exclude_entities,
    })
      .then((ids) => {
        this._discovered = ids;
      })
      .finally(() => {
        this._discoverInFlight = false;
      });
  }

  private _buildRows(): PersonRow[] {
    if (!this.hass || !this._config) return [];
    const autoDiscover = this._config.auto_discover ?? true;
    const ids = autoDiscover ? this._discovered : (this._config.entities ?? []);
    const rows: PersonRow[] = [];
    for (const entityId of ids) {
      const entity: HassEntity | undefined = this.hass.states[entityId];
      if (!entity) continue;
      const name = entity.attributes.friendly_name || entityId;
      const state = entity.state;
      let status: PersonRow["status"];
      let zoneName: string | undefined;
      let color: string;
      let icon: string;
      if (state === "home") {
        status = "home";
        color = this._config.home_color ? resolveThemeColor(this._config.home_color) : PRESENCE_COLOR_HOME;
        icon = "mdi:home";
      } else if (state === "not_home") {
        status = "not_home";
        color = this._config.not_home_color
          ? resolveThemeColor(this._config.not_home_color)
          : PRESENCE_COLOR_NOT_HOME;
        icon = "mdi:map-marker-outline";
      } else if (state === "unknown" || state === "unavailable") {
        status = "unknown";
        color = this._config.unknown_color ? resolveThemeColor(this._config.unknown_color) : PRESENCE_COLOR_UNKNOWN;
        icon = "mdi:help-circle-outline";
      } else {
        status = "zone";
        zoneName = state;
        const override = this._config.zone_colors?.[state];
        color = override
          ? resolveThemeColor(override)
          : this._config.zone_color
            ? resolveThemeColor(this._config.zone_color)
            : PRESENCE_COLOR_ZONE;
        icon = "mdi:map-marker";
      }
      rows.push({ entityId, name, entity, status, zoneName, color, icon });
    }

    const sort = this._config.sort ?? "home_first";
    return rows.sort((a, b) => {
      if (sort === "home_first") {
        const rank = (r: PersonRow) => (r.status === "home" ? 0 : r.status === "zone" ? 1 : r.status === "not_home" ? 2 : 3);
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
      }
      return a.name.localeCompare(b.name, this._language);
    });
  }

  private _initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  private _relativeSince(row: PersonRow): string | undefined {
    if (!this._config?.show_since || row.status === "home") return undefined;
    const changed = new Date(row.entity.last_changed).getTime();
    if (Number.isNaN(changed)) return undefined;
    const elapsedMin = Math.max(0, Math.round((Date.now() - changed) / 60000));
    if (elapsedMin < 1) return undefined;
    if (elapsedMin < 60) return this._t("since_minutes").replace("{n}", String(elapsedMin));
    const hours = Math.round(elapsedMin / 60);
    if (hours < 24) return this._t("since_hours").replace("{n}", String(hours));
    const days = Math.round(hours / 24);
    return this._t("since_days").replace("{n}", String(days));
  }

  private _fireMoreInfo(entityId: string): () => void {
    return () => fireEvent(this, "hass-more-info", { entityId });
  }

  private _handlePointerDown(row: PersonRow): (e: PointerEvent) => void {
    return () => {
      this._holdFired = false;
      if (!this._config?.hold_action || this._config.hold_action.action === "none") return;
      this._holdTimer = window.setTimeout(() => {
        this._holdFired = true;
        this._triggerHoldAction();
      }, HOLD_MS);
    };
  }

  private _handlePointerUp(row: PersonRow): (e: PointerEvent) => void {
    return () => {
      if (this._holdTimer !== undefined) {
        window.clearTimeout(this._holdTimer);
        this._holdTimer = undefined;
      }
      if (!this._holdFired) this._fireMoreInfo(row.entityId)();
    };
  }

  private _triggerHoldAction(): void {
    const action = this._config?.hold_action;
    if (!action) return;
    if (action.action === "navigate" && action.navigation_path) {
      window.history.pushState(null, "", action.navigation_path);
      window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
    } else if (action.action === "url" && action.url_path) {
      window.open(action.url_path, action.new_tab === false ? "_self" : "_blank");
    }
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const rows = this._buildRows();
    const homeCount = rows.filter((r) => r.status === "home").length;
    const total = rows.length;
    const name = this._config.name || this._t("presence_default_name");
    const icon = this._config.icon || DEFAULT_PRESENCE_ICON;
    const subtitle = this._t("presence_subtitle")
      .replace("{home}", String(homeCount))
      .replace("{total}", String(total));

    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(this._config);
    const radius = resolveCornerRadius(this._config.radius ?? DEFAULT_PRESENCE_RADIUS, this._config.corners);
    const animClass = shouldAnimate(this._config.animation) ? "" : "no-animations";

    const cssVars = buildCssVars({
      "m3p-icon-color": "var(--primary-color)",
      "m3p-icon-bg": "color-mix(in srgb, var(--primary-color) 14%, transparent)",
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
    });

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)} ${animClass}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${renderCardHeader({
            icon,
            name,
            subtitle,
            right:
              total > 0
                ? html`
                    <div class="presence-chip ${homeCount === 0 ? "empty" : "some"}">
                      ${homeCount === 0 ? this._t("presence_nobody_home") : homeCount}
                    </div>
                  `
                : undefined,
          })}

          ${rows.length === 0
            ? html`<div class="empty-state">${this._t("presence_empty")}</div>`
            : html`<div class="person-grid">${rows.map((r) => this._renderPerson(r))}</div>`}

          ${this._config.show_map && rows.length > 0 ? html`<div class="map-wrap"></div>` : nothing}
        </div>
      </ha-card>
    `;
  }

  private _renderPerson(row: PersonRow) {
    const picture = row.entity.attributes.entity_picture as string | undefined;
    const since = this._relativeSince(row);
    const distance =
      this._config?.show_distance && row.status === "not_home" && typeof row.entity.attributes.distance === "number"
        ? `${this._formatNumber(row.entity.attributes.distance)} km`
        : undefined;
    const statusText = row.status === "home" ? this._t("presence_home") : row.status === "zone" ? row.zoneName! : row.status === "not_home" ? this._t("presence_not_home") : this._t("unavailable");

    return html`
      <div
        class="person"
        role="button"
        tabindex="0"
        aria-label=${row.name}
        style=${`--presence-color: ${row.color}; --presence-tint: ${tintBackground(row.color, this._config?.presence_tint_opacity, 18)};`}
        @pointerdown=${this._handlePointerDown(row)}
        @pointerup=${this._handlePointerUp(row)}
        @pointercancel=${() => {
          if (this._holdTimer !== undefined) {
            window.clearTimeout(this._holdTimer);
            this._holdTimer = undefined;
          }
        }}
        @keydown=${activateOnKey(this._fireMoreInfo(row.entityId))}
      >
        <div class="avatar-wrap">
          <div class="avatar" style=${picture ? `background-image: url(${picture});` : ""}>
            ${!picture ? html`<span class="initials">${this._initials(row.name)}</span>` : nothing}
          </div>
          <div class="status-dot">
            <ha-icon icon=${row.icon}></ha-icon>
          </div>
        </div>
        <div class="person-name">${row.name}</div>
        <div class="person-status">
          ${statusText}${distance ? html` · ${distance}` : nothing}
        </div>
        ${since ? html`<div class="person-since">${since}</div>` : nothing}
      </div>
    `;
  }

  private _formatNumber(value: number): string {
    return new Intl.NumberFormat(this._language, { maximumFractionDigits: 1 }).format(value);
  }

  static styles = [
    glassCardStyles,
    cardHeaderStyles,
    css`
      .presence-chip {
        flex-shrink: 0;
        height: 24px;
        padding: 0 10px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        font-size: 12px;
        font-weight: 700;
      }

      .presence-chip.some {
        background: color-mix(in srgb, ${unsafeCSS(PRESENCE_COLOR_HOME)} 20%, transparent);
        color: ${unsafeCSS(PRESENCE_COLOR_HOME)};
      }

      .presence-chip.empty {
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--m3p-secondary-text);
      }

      .empty-state {
        padding: 12px 0;
        font-size: 13px;
        opacity: 0.6;
        color: var(--m3p-text);
      }

      .person-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(${PRESENCE_GRID_MIN_COL}px, 1fr));
        gap: ${PRESENCE_GRID_GAP}px;
      }

      .person {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        padding: 4px;
        border-radius: 12px;
        text-align: center;
      }

      .person:focus-visible {
        outline: 2px solid var(--presence-color);
        outline-offset: 2px;
      }

      .avatar-wrap {
        position: relative;
        width: ${PRESENCE_AVATAR_SIZE}px;
        height: ${PRESENCE_AVATAR_SIZE}px;
      }

      .avatar {
        width: 100%;
        height: 100%;
        border-radius: ${PRESENCE_AVATAR_RADIUS}px;
        border: ${PRESENCE_RING_WIDTH}px solid var(--presence-color);
        background-color: var(--presence-tint);
        background-size: cover;
        background-position: center;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .initials {
        font-size: 20px;
        font-weight: 700;
        color: var(--presence-color);
      }

      .status-dot {
        position: absolute;
        right: -2px;
        bottom: -2px;
        width: ${PRESENCE_DOT_SIZE}px;
        height: ${PRESENCE_DOT_SIZE}px;
        border-radius: 5px;
        background: var(--presence-color);
        border: 2px solid var(--card-background-color, #1c1c1e);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .status-dot ha-icon {
        --mdc-icon-size: 9px;
        color: white;
      }

      .person-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--m3p-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }

      .person-status {
        font-size: 10px;
        opacity: 0.55;
        color: var(--m3p-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }

      .person-since {
        font-size: 9px;
        opacity: 0.45;
        color: var(--m3p-text);
      }

      .map-wrap {
        height: 200px;
        border-radius: 16px;
        overflow: hidden;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-presence-card": M3PresenceCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-presence-card",
  name: "M3 Presence Card",
  description: "Anwesenheitsübersicht für person- und device_tracker-Entities mit Avataren und Statusringen.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
