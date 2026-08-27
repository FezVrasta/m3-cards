import { LitElement, html, css, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type {
  HomeAssistant,
  M3OccupancyCardConfig,
  OccupancySensorConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_OCCUPANCY_RADIUS,
  DEFAULT_OCCUPANCY_ICON,
  DEFAULT_OCCUPANCY_ACCENT,
  DEFAULT_OCCUPANCY_NAME_STRIP,
  OCCUPANCY_HEADER_ICON_SIZE,
  OCCUPANCY_HEADER_ICON_RADIUS,
  OCCUPANCY_ROW_RADIUS,
  OCCUPANCY_ROW_RADIUS_ACTIVE,
  OCCUPANCY_ROW_PADDING_Y,
  OCCUPANCY_ROW_PADDING_X,
  OCCUPANCY_ROW_GAP,
  OCCUPANCY_ICON_SIZE,
  OCCUPANCY_ICON_RADIUS,
  OCCUPANCY_DOT_SIZE,
  OCCUPANCY_PULSE_MS,
  OCCUPANCY_TINT_OCCUPIED,
  OCCUPANCY_TINT_FREE,
  OCCUPANCY_CHIP_RADIUS,
  OCCUPANCY_TICK_MS,
  resolveCornerRadius,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors, tintBackground } from "./shared/color-config";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import { activateOnKey } from "./shared/a11y";
import { STANDARD_EASING, shouldAnimate } from "./shared/animation";
import { formatSince } from "./shared/formatting";
import { guessRoomIcon } from "./shared/room-icons";
import { discoverOccupancyRooms, type DiscoveredOccupancyRoom } from "./shared/ha-registry";
import { localize, type TranslationKey } from "./localize";

console.info(
  `%c M3-OCCUPANCY-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #5dcaa5; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #5dcaa5; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const EASING = unsafeCSS(STANDARD_EASING);

interface OccupancyRow {
  key: string;
  /** Every sensor in the room; occupied when any is on. */
  entities: string[];
  /** The sensor a tap opens — the one that last changed. */
  primary: string;
  name: string;
  icon: string;
  occupied: boolean;
  available: boolean;
  /** ISO timestamp of the room's last state change, for the "since" line. */
  since?: string;
  config: OccupancySensorConfig;
}

@customElement("m3-occupancy-card")
export class M3OccupancyCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3OccupancyCardConfig;
  @state() private _discovered: DiscoveredOccupancyRoom[] = [];
  /** Bumped by the ticker so the elapsed-time text stays honest. */
  @state() private _tick = 0;

  private _lastDiscoverKey?: string;
  private _discoverInFlight = false;
  private _tickTimer?: number;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-occupancy-card-editor");
    return document.createElement("m3-occupancy-card-editor") as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): M3OccupancyCardConfig {
    return { type: "custom:m3-occupancy-card", auto_discover: true };
  }

  public setConfig(config: M3OccupancyCardConfig): void {
    this._config = {
      glass_background: true,
      animation: "auto",
      auto_discover: true,
      sort: "occupied_first",
      show_timeline: true,
      ...config,
    };
    this._lastDiscoverKey = undefined;
  }

  public getCardSize(): number {
    return 4;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_rows: 3 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._tickTimer = window.setInterval(() => {
      this._tick++;
    }, OCCUPANCY_TICK_MS);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._tickTimer !== undefined) {
      clearInterval(this._tickTimer);
      this._tickTimer = undefined;
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (changed.has("hass") || changed.has("_config")) this._maybeDiscover();
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey, vars?: Record<string, string | number>): string {
    let out = localize(key, this._language);
    for (const [k, v] of Object.entries(vars ?? {})) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  }

  // ---- discovery --------------------------------------------------------

  private _maybeDiscover(): void {
    if (!this.hass || !this._config?.auto_discover) return;
    const key = JSON.stringify({
      areas: this._config.include_area ?? [],
      exclude: this._config.exclude_entities ?? [],
      strip: this._config.name_strip ?? DEFAULT_OCCUPANCY_NAME_STRIP,
    });
    if (key === this._lastDiscoverKey || this._discoverInFlight) return;
    this._lastDiscoverKey = key;
    this._discover();
  }

  private async _discover(): Promise<void> {
    if (!this.hass || this._discoverInFlight) return;
    this._discoverInFlight = true;
    try {
      this._discovered = await discoverOccupancyRooms(this.hass, {
        includeAreas: this._config?.include_area,
        excludeEntities: this._config?.exclude_entities,
        nameStrip: this._config?.name_strip ?? DEFAULT_OCCUPANCY_NAME_STRIP,
      });
    } catch (e) {
      console.warn("m3-occupancy-card: discovery failed", e);
    } finally {
      this._discoverInFlight = false;
    }
  }

  /**
   * Manual `sensors:` wins over discovery, one room per configured entry;
   * otherwise the discovered rooms, each possibly holding several sensors.
   */
  private get _rooms(): { key: string; entities: string[]; config: OccupancySensorConfig; icon?: string }[] {
    const manual = this._config?.sensors ?? [];
    if (manual.length) {
      return manual
        .filter((cfg) => cfg.entity)
        .map((cfg) => ({ key: cfg.entity, entities: [cfg.entity], config: cfg, icon: cfg.icon }));
    }
    return this._discovered.map((d) => ({
      key: d.key,
      entities: d.entities,
      icon: d.icon,
      config: {
        entity: d.entities[0],
        name: d.name,
        icon: d.icon,
        illuminance_entity: d.illuminanceEntity,
        battery_entity: d.batteryEntity,
        signal_entity: d.signalEntity,
        timeout_entity: d.timeoutEntity,
      },
    }));
  }

  private _buildRows(): OccupancyRow[] {
    const hass = this.hass;
    if (!hass) return [];
    const rows = this._rooms.map((room): OccupancyRow => {
      const states = room.entities.map((id) => hass.states[id]).filter(Boolean);
      // One live sensor is enough for the room to count as reporting; the
      // room only goes dark when every sensor in it has.
      const live = states.filter((st) => st.state !== "unavailable" && st.state !== "unknown");
      const occupiedStates = live.filter((st) => st.state === "on");
      const occupied = occupiedStates.length > 0;
      // Time the room in question: since the first sensor turned on while
      // occupied, since the last one turned off while clear.
      const relevant = occupied ? occupiedStates : live;
      const timestamps = relevant
        .map((st) => Date.parse(st.last_changed ?? ""))
        .filter((t) => !isNaN(t));
      const since = timestamps.length
        ? new Date(occupied ? Math.min(...timestamps) : Math.max(...timestamps)).toISOString()
        : undefined;
      const name =
        room.config.name ??
        (states[0]?.attributes.friendly_name as string | undefined) ??
        room.entities[0];
      return {
        key: room.key,
        entities: room.entities,
        primary: (occupiedStates[0] ?? live[0] ?? states[0])?.entity_id ?? room.entities[0],
        name,
        icon: room.icon ?? guessRoomIcon(name),
        occupied,
        available: live.length > 0,
        since,
        config: room.config,
      };
    });
    return this._sortRows(rows);
  }

  private _sortRows(rows: OccupancyRow[]): OccupancyRow[] {
    const sorted = [...rows];
    // A sensor that stopped reporting outranks everything: a dead presence
    // sensor is a problem, a quiet room is not.
    const rank = (r: OccupancyRow): number => (!r.available ? 0 : r.occupied ? 1 : 2);
    switch (this._config?.sort ?? "occupied_first") {
      case "name":
        sorted.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
        break;
      case "last_active":
        sorted.sort(
          (a, b) =>
            rank(a) - rank(b) ||
            Date.parse(b.since ?? "0") - Date.parse(a.since ?? "0"),
        );
        break;
      default:
        sorted.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    }
    return sorted;
  }

  // ---- render -----------------------------------------------------------

  private _statusText(row: OccupancyRow): string {
    if (!row.available) return this._t("occupancy_unavailable");
    const since = formatSince(row.since, {
      minutes: this._t("occupancy_minutes"),
      hours: this._t("occupancy_hours"),
      days: this._t("occupancy_days"),
    });
    if (!since) return row.occupied ? this._t("occupancy_occupied") : this._t("occupancy_never");
    return row.occupied
      ? `${this._t("occupancy_occupied")} · ${this._t("occupancy_since", { dauer: since })}`
      : this._t("occupancy_free_since", { dauer: since });
  }

  private _moreInfo(entityId: string): () => void {
    return () => {
      this.dispatchEvent(
        new CustomEvent("hass-more-info", {
          detail: { entityId },
          bubbles: true,
          composed: true,
        }),
      );
    };
  }

  protected render() {
    const cfg = this._config;
    if (!cfg) return nothing;
    // Referenced so the minute ticker actually triggers a re-render.
    void this._tick;

    const rows = this._buildRows();
    const occupied = rows.filter((r) => r.occupied).length;
    const accent = resolveThemeColor(cfg.accent_color ?? DEFAULT_OCCUPANCY_ACCENT);
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(cfg);

    const cssVars = buildCssVars({
      "m3o-accent": accent,
      "m3o-accent-tint": tintBackground(accent, cfg.accent_opacity, 18),
      "m3o-text": textColorCss,
      "m3o-secondary-text": secondaryTextColorCss,
      "m3o-radius": resolveCornerRadius(cfg.radius ?? DEFAULT_OCCUPANCY_RADIUS, cfg.corners),
    });
    const style = cardBackgroundCss
      ? `${cssVars} --ha-card-background: ${cardBackgroundCss};`
      : cssVars;

    return html`
      <ha-card style=${style}>
        <div
          class="card-inner ${glassCardClass(cfg.glass_background)} ${shouldAnimate(cfg.animation) ? "" : "no-animations"}"
        >
          ${this._renderHeader(occupied, rows.length)}
          ${rows.length
            ? html`<div class="rows">
                ${repeat(rows, (r) => r.key, (r) => this._renderRow(r))}
              </div>`
            : html`<div class="empty">${this._t("occupancy_none_found")}</div>`}
        </div>
      </ha-card>
    `;
  }

  private _renderHeader(occupied: number, total: number): TemplateResult {
    const cfg = this._config!;
    return html`
      <div class="header">
        <div class="header-icon">
          <ha-icon icon=${cfg.icon ?? DEFAULT_OCCUPANCY_ICON}></ha-icon>
        </div>
        <div class="header-text">
          <div class="header-name">${cfg.name ?? this._t("occupancy_default_name")}</div>
          <div class="header-sub">
            ${this._t("occupancy_subtitle", { belegt: occupied, gesamt: total })}
          </div>
        </div>
        ${occupied > 0
          ? html`<div class="count-chip">
              <span class="pulse-dot"></span>
              <span>${occupied}</span>
            </div>`
          : nothing}
      </div>
    `;
  }

  private _renderRow(row: OccupancyRow): TemplateResult {
    return html`
      <div
        class="row ${row.occupied ? "occupied" : ""} ${row.available ? "" : "dead"}"
        role="button"
        tabindex="0"
        aria-label=${row.name}
        @click=${this._moreInfo(row.primary)}
        @keydown=${activateOnKey(this._moreInfo(row.primary))}
      >
        <div class="row-icon">
          <ha-icon icon=${row.icon}></ha-icon>
          ${row.occupied ? html`<span class="pulse-dot corner"></span>` : nothing}
        </div>
        <div class="row-body">
          <div class="row-head">
            <span class="row-name">${row.name}</span>
            <span class="row-status">${this._statusText(row)}</span>
          </div>
        </div>
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    css`
      ha-card {
        border-radius: var(--m3o-radius);
      }

      .card-inner {
        border-radius: var(--m3o-radius);
        gap: 10px;
      }

      .empty {
        font-size: 12px;
        opacity: 0.5;
        color: var(--m3o-secondary-text);
        padding: 8px 2px;
      }

      /* ---- header ---- */

      .header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .header-icon {
        flex-shrink: 0;
        width: ${OCCUPANCY_HEADER_ICON_SIZE}px;
        height: ${OCCUPANCY_HEADER_ICON_SIZE}px;
        border-radius: ${OCCUPANCY_HEADER_ICON_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m3o-accent);
        background: var(--m3o-accent-tint);
      }

      .header-icon ha-icon {
        --mdc-icon-size: 22px;
      }

      .header-text {
        flex: 1;
        min-width: 0;
      }

      .header-name {
        font-size: 15px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--m3o-text);
      }

      .header-sub {
        font-size: 12px;
        opacity: 0.6;
        color: var(--m3o-secondary-text);
      }

      .count-chip {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 7px;
        height: 30px;
        padding: 0 12px;
        border-radius: ${OCCUPANCY_CHIP_RADIUS}px;
        font-size: 13px;
        font-weight: 700;
        color: var(--m3o-accent);
        background: var(--m3o-accent-tint);
      }

      /* ---- rows ---- */

      .rows {
        display: flex;
        flex-direction: column;
        gap: ${OCCUPANCY_ROW_GAP}px;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: ${OCCUPANCY_ROW_PADDING_Y}px ${OCCUPANCY_ROW_PADDING_X}px;
        border-radius: ${OCCUPANCY_ROW_RADIUS}px;
        cursor: pointer;
        box-sizing: border-box;
        background: color-mix(in srgb, var(--primary-text-color) ${OCCUPANCY_TINT_FREE}%, transparent);
        transition: border-radius 350ms ${EASING};
      }

      .row.occupied {
        background: color-mix(in srgb, var(--m3o-accent) ${OCCUPANCY_TINT_OCCUPIED}%, transparent);
      }

      .row.dead {
        opacity: 0.5;
      }

      .row:active {
        border-radius: ${OCCUPANCY_ROW_RADIUS_ACTIVE}px;
      }

      .card-inner.no-animations .row {
        transition: none;
      }

      .row:focus-visible {
        outline: 2px solid var(--m3o-accent);
        outline-offset: 2px;
      }

      .row-icon {
        position: relative;
        flex-shrink: 0;
        width: ${OCCUPANCY_ICON_SIZE}px;
        height: ${OCCUPANCY_ICON_SIZE}px;
        border-radius: ${OCCUPANCY_ICON_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m3o-secondary-text);
        background: color-mix(in srgb, var(--primary-text-color) 7%, transparent);
      }

      .row.occupied .row-icon {
        color: var(--m3o-accent);
        background: color-mix(in srgb, var(--m3o-accent) 20%, transparent);
      }

      .row-icon ha-icon {
        --mdc-icon-size: 19px;
      }

      .pulse-dot {
        width: ${OCCUPANCY_DOT_SIZE}px;
        height: ${OCCUPANCY_DOT_SIZE}px;
        border-radius: 50%;
        background: var(--m3o-accent);
        animation: occupancy-pulse ${OCCUPANCY_PULSE_MS}ms ease-in-out infinite;
      }

      .pulse-dot.corner {
        position: absolute;
        top: -2px;
        right: -2px;
      }

      @keyframes occupancy-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.35;
        }
      }

      /* Both switches must silence it: the config option and the OS setting. */
      .card-inner.no-animations .pulse-dot {
        animation: none;
      }

      @media (prefers-reduced-motion: reduce) {
        .pulse-dot {
          animation: none;
        }
      }

      .row-body {
        flex: 1;
        min-width: 0;
      }

      .row-head {
        display: flex;
        align-items: baseline;
        gap: 8px;
        min-width: 0;
      }

      .row-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--m3o-text);
        white-space: nowrap;
      }

      .row-status {
        font-size: 10px;
        color: var(--m3o-secondary-text);
        opacity: 0.7;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .row.occupied .row-status {
        color: var(--m3o-accent);
        opacity: 1;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-occupancy-card": M3OccupancyCard;
  }
}

const windowWithCards = window as unknown as Window & {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-occupancy-card",
  name: "M3 Occupancy Card",
  description:
    "Raumbelegung aus Präsenz- und Bewegungssensoren: Zustand, Dauer und Aktivitätsverlauf je Raum.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
