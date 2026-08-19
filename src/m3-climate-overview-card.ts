import { LitElement, html, css, unsafeCSS, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3ClimateOverviewCardConfig,
  ClimateOverviewTempThresholds,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_CLIMATE_OVERVIEW_RADIUS,
  DEFAULT_CLIMATE_OVERVIEW_ICON,
  DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS,
  DEFAULT_CLIMATE_OVERVIEW_HUMIDITY_RANGE,
  DEFAULT_CLIMATE_OVERVIEW_NAME_STRIP,
  CLIMATE_OVERVIEW_GRID_GAP,
  CLIMATE_OVERVIEW_GRID_MIN_COL,
  CLIMATE_OVERVIEW_TILE_RADIUS,
  CLIMATE_OVERVIEW_COLOR_COLD,
  CLIMATE_OVERVIEW_COLOR_COOL,
  CLIMATE_OVERVIEW_COLOR_COMFORTABLE,
  CLIMATE_OVERVIEW_COLOR_WARM,
  CLIMATE_OVERVIEW_COLOR_HOT,
  CLIMATE_OVERVIEW_HUMIDITY_WARN_COLOR,
  CLIMATE_OVERVIEW_SCALE_MIN_SPAN,
  CLIMATE_OVERVIEW_LABEL_CHAR_PX,
  CLIMATE_OVERVIEW_LABEL_MAX_PX,
  CLIMATE_OVERVIEW_LABEL_GAP_PX,
  CLIMATE_OVERVIEW_DOT_SIZE,
  CLIMATE_OVERVIEW_DOT_RADIUS,
  CLIMATE_OVERVIEW_DOT_TRANSITION_MS,
  CLIMATE_OVERVIEW_CHIP_RADIUS,
  CLIMATE_OVERVIEW_TREND_REFRESH_MS,
  CLIMATE_OVERVIEW_TREND_THRESHOLD_K,
  CLIMATE_OVERVIEW_MOLD_HUMIDITY_THRESHOLD,
  CLIMATE_OVERVIEW_MOLD_TEMP_THRESHOLD,
  resolveCornerRadius,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors, tintBackground } from "./shared/color-config";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import { renderCardHeader, cardHeaderStyles } from "./shared/card-header";
import { shouldAnimate, STANDARD_EASING } from "./shared/animation";
import { activateOnKey } from "./shared/a11y";
import { fireEvent } from "./shared/editor-helpers";
import { discoverClimateRooms, type DiscoveredClimateRoom } from "./shared/ha-registry";
import { fetchValueHoursAgo } from "./shared/ha-statistics";
import { formatNumber } from "./shared/formatting";
import { localize, type TranslationKey } from "./localize";

console.info(
  `%c M3-CLIMATE-OVERVIEW-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #6ba7dc; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #6ba7dc; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const EASING = unsafeCSS(STANDARD_EASING);

type TempStage = "cold" | "cool" | "comfortable" | "warm" | "hot";

interface ClimateOverviewTile {
  key: string;
  name: string;
  icon: string;
  entity: string;
  temperature?: number;
  temperatureUnavailable: boolean;
  humidity?: number;
  humidityUnavailable: boolean;
  hasHumidity: boolean;
  tempColor: string;
}

// Guesses a Material icon from a room's (German/English) name — there's no
// area-icon precedent in this repo to reuse, and most users won't have set
// one explicitly in HA's area registry either.
const ROOM_ICON_RULES: Array<[RegExp, string]> = [
  [/wohnzimmer|living\s*room|lounge/i, "mdi:sofa"],
  [/schlafzimmer|bedroom/i, "mdi:bed"],
  [/kinderzimmer|nursery|kids?\s*room/i, "mdi:teddy-bear"],
  [/arbeitszimmer|b(ü|ue)ro|office|study/i, "mdi:desk"],
  [/k(ü|ue)che|kitchen/i, "mdi:silverware-fork-knife"],
  [/bad(ezimmer)?|bathroom/i, "mdi:bathtub"],
  [/g(ä|ae)ste-?wc|\bwc\b|toilette|toilet|\bklo\b/i, "mdi:toilet"],
  [/flur|diele|hallway|corridor|entrance/i, "mdi:door"],
  [/keller|basement|cellar/i, "mdi:home-floor-b"],
  [/dachboden|attic|loft/i, "mdi:home-roof"],
  [/garage/i, "mdi:garage"],
  [/garten|garden|outdoor|terrasse|balkon|balcony/i, "mdi:flower"],
  [/ess-?zimmer|dining/i, "mdi:table-furniture"],
];

function guessRoomIcon(name: string): string {
  for (const [re, icon] of ROOM_ICON_RULES) {
    if (re.test(name)) return icon;
  }
  return "mdi:home-outline";
}

@customElement("m3-climate-overview-card")
export class M3ClimateOverviewCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ClimateOverviewCardConfig;
  @state() private _discovered: DiscoveredClimateRoom[] = [];
  @state() private _trendValues: Map<string, number> = new Map();

  private _lastDiscoverKey?: string;
  private _discoverInFlight = false;
  private _trendLastKey?: string;
  private _trendInFlight = false;
  private _trendRefreshTimer?: number;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-climate-overview-card-editor");
    return document.createElement(
      "m3-climate-overview-card-editor",
    ) as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): M3ClimateOverviewCardConfig {
    return {
      type: "custom:m3-climate-overview-card",
      auto_discover: true,
      glass_background: true,
    };
  }

  public setConfig(config: M3ClimateOverviewCardConfig): void {
    this._config = {
      glass_background: true,
      animation: "auto",
      auto_discover: config.rooms?.length ? false : true,
      sort: "area",
      show_scale: true,
      show_outlier_chip: true,
      ...config,
    };
  }

  public getCardSize(): number {
    return 4;
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: "full",
      rows: "auto",
      min_rows: 4,
    };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._trendRefreshTimer = window.setInterval(() => {
      this._trendLastKey = undefined;
      this._maybeFetchTrend();
    }, CLIMATE_OVERVIEW_TREND_REFRESH_MS);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._trendRefreshTimer !== undefined) {
      window.clearInterval(this._trendRefreshTimer);
      this._trendRefreshTimer = undefined;
    }
    this._trackObserver?.disconnect();
    this._trackObserver = undefined;
    this._observedTrack = undefined;
    if (this._remeasureTimer !== undefined) {
      window.clearTimeout(this._remeasureTimer);
      this._remeasureTimer = undefined;
    }
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this._maybeDiscover();
    this._maybeFetchTrend();
    if (this._config?.show_scale !== false) this._observeTrack();
  }

  private _maybeFetchTrend(): void {
    if (!this.hass || !this._config?.show_trend || this._trendInFlight) return;
    const entityIds = this._buildTiles().map((t) => t.entity);
    const key = entityIds.join(",");
    if (key === this._trendLastKey || entityIds.length === 0) return;
    this._trendLastKey = key;
    this._trendInFlight = true;
    fetchValueHoursAgo(this.hass, entityIds, 1)
      .then((values) => {
        this._trendValues = values;
      })
      .finally(() => {
        this._trendInFlight = false;
      });
  }

  private _trendDelta(tile: ClimateOverviewTile): number | undefined {
    if (!this._config?.show_trend || tile.temperature === undefined) return undefined;
    const past = this._trendValues.get(tile.entity);
    if (past === undefined) return undefined;
    const delta = tile.temperature - past;
    return Math.abs(delta) > CLIMATE_OVERVIEW_TREND_THRESHOLD_K ? delta : undefined;
  }

  private _moldRisk(tile: ClimateOverviewTile): boolean {
    return (
      !!this._config?.show_mold_warning &&
      tile.humidity !== undefined &&
      tile.humidity > CLIMATE_OVERVIEW_MOLD_HUMIDITY_THRESHOLD &&
      tile.temperature !== undefined &&
      tile.temperature < CLIMATE_OVERVIEW_MOLD_TEMP_THRESHOLD
    );
  }

  private _maybeDiscover(): void {
    if (
      !this.hass ||
      !this._config ||
      this._config.rooms?.length ||
      !(this._config.auto_discover ?? true) ||
      this._discoverInFlight
    ) {
      return;
    }
    const key = JSON.stringify({
      area: this._config.include_area ?? [],
      excl: this._config.exclude_entities ?? [],
      strip: this._config.name_strip ?? DEFAULT_CLIMATE_OVERVIEW_NAME_STRIP,
    });
    if (key === this._lastDiscoverKey) return;
    this._lastDiscoverKey = key;
    this._discoverInFlight = true;
    discoverClimateRooms(this.hass, {
      includeAreas: this._config.include_area,
      excludeEntities: this._config.exclude_entities,
      nameStrip: this._config.name_strip ?? DEFAULT_CLIMATE_OVERVIEW_NAME_STRIP,
    })
      .then((rooms) => {
        this._discovered = rooms;
        // eslint-disable-next-line no-console
        console.info(`m3-climate-overview-card: ${rooms.length} Räume gefunden`, rooms);
      })
      .catch((e) => console.error("m3-climate-overview-card: auto-discovery failed", e))
      .finally(() => {
        this._discoverInFlight = false;
      });
  }

  private _tempThresholds(): Required<ClimateOverviewTempThresholds> {
    const t = this._config?.temp_thresholds ?? {};
    return {
      cold: t.cold ?? DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS.cold,
      cool: t.cool ?? DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS.cool,
      comfortable: t.comfortable ?? DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS.comfortable,
      warm: t.warm ?? DEFAULT_CLIMATE_OVERVIEW_TEMP_THRESHOLDS.warm,
    };
  }

  private _tempStage(value: number): TempStage {
    const t = this._tempThresholds();
    if (value < t.cold) return "cold";
    if (value < t.cool) return "cool";
    if (value < t.comfortable) return "comfortable";
    if (value < t.warm) return "warm";
    return "hot";
  }

  private _tempColor(stage: TempStage): string {
    const c = this._config;
    switch (stage) {
      case "cold":
        return c?.cold_color ? resolveThemeColor(c.cold_color) : CLIMATE_OVERVIEW_COLOR_COLD;
      case "cool":
        return c?.cool_color ? resolveThemeColor(c.cool_color) : CLIMATE_OVERVIEW_COLOR_COOL;
      case "comfortable":
        return c?.comfortable_color
          ? resolveThemeColor(c.comfortable_color)
          : CLIMATE_OVERVIEW_COLOR_COMFORTABLE;
      case "warm":
        return c?.warm_color ? resolveThemeColor(c.warm_color) : CLIMATE_OVERVIEW_COLOR_WARM;
      case "hot":
      default:
        return c?.hot_color ? resolveThemeColor(c.hot_color) : CLIMATE_OVERVIEW_COLOR_HOT;
    }
  }

  private _buildTiles(): ClimateOverviewTile[] {
    if (!this.hass || !this._config) return [];

    const source = this._config.rooms?.length
      ? this._config.rooms.map((r, i) => ({
          key: `manual:${i}`,
          name: r.name,
          icon: r.icon,
          tempEntity: r.temperature_entity,
          humidityEntity: r.humidity_entity,
          color: r.color,
        }))
      : this._discovered.map((r) => ({
          key: r.key,
          name: r.name,
          icon: r.icon,
          tempEntity: r.temperatureEntity,
          humidityEntity: r.humidityEntity,
          color: undefined as string | undefined,
        }));

    return source.map((room): ClimateOverviewTile => {
      const tempSt = this.hass!.states[room.tempEntity];
      const tempUnavailable = !tempSt || tempSt.state === "unavailable" || tempSt.state === "unknown";
      const tempParsed = tempUnavailable ? NaN : parseFloat(tempSt!.state);
      const temperature = Number.isNaN(tempParsed) ? undefined : tempParsed;

      const humiditySt = room.humidityEntity ? this.hass!.states[room.humidityEntity] : undefined;
      const humidityUnavailable =
        !room.humidityEntity || !humiditySt || humiditySt.state === "unavailable" || humiditySt.state === "unknown";
      const humidityParsed = humidityUnavailable ? NaN : parseFloat(humiditySt!.state);
      const humidity = Number.isNaN(humidityParsed) ? undefined : humidityParsed;

      const stage = temperature !== undefined ? this._tempStage(temperature) : "comfortable";

      return {
        key: room.key,
        name: room.name,
        icon: room.icon || guessRoomIcon(room.name),
        entity: room.tempEntity,
        temperature,
        temperatureUnavailable: tempUnavailable,
        humidity,
        humidityUnavailable,
        hasHumidity: !!room.humidityEntity,
        tempColor: room.color ? resolveThemeColor(room.color) : this._tempColor(stage),
      };
    });
  }

  private _sortTiles(tiles: ClimateOverviewTile[]): ClimateOverviewTile[] {
    const sort = this._config?.sort ?? "area";
    if (sort === "name") {
      return [...tiles].sort((a, b) => a.name.localeCompare(b.name, this._language));
    }
    if (sort === "temp_desc") {
      return [...tiles].sort((a, b) => (b.temperature ?? -Infinity) - (a.temperature ?? -Infinity));
    }
    if (sort === "temp_asc") {
      return [...tiles].sort((a, b) => (a.temperature ?? Infinity) - (b.temperature ?? Infinity));
    }
    return tiles;
  }

  private _tempUnit(): string {
    return this.hass?.config?.unit_system?.temperature ?? "°C";
  }

  private _formatTempValue(value: number): string {
    return formatNumber(this._language, value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  private _humidityDisplay(tile: ClimateOverviewTile): { color: string; opacity: string } {
    if (tile.humidity === undefined) return { color: "var(--m3p-text)", opacity: "0.55" };
    const [lo, hi] = this._config?.humidity_range ?? DEFAULT_CLIMATE_OVERVIEW_HUMIDITY_RANGE;
    if (tile.humidity < lo || tile.humidity > hi) {
      const warn = this._config?.humidity_warn_color
        ? resolveThemeColor(this._config.humidity_warn_color)
        : CLIMATE_OVERVIEW_HUMIDITY_WARN_COLOR;
      return { color: warn, opacity: "1" };
    }
    return { color: "var(--m3p-text)", opacity: "0.55" };
  }

  private _moreInfo(entityId: string): () => void {
    return () => fireEvent(this, "hass-more-info", { entityId });
  }

  // The single most conspicuous room: whichever tile deviates furthest
  // outside the "comfortable" band (below the cool threshold, or at/above
  // the comfortable threshold) — coldest wins on the cold side, warmest on
  // the hot side. No chip when every room is within the comfortable band.
  private _outlierTile(
    tiles: ClimateOverviewTile[],
  ): { tile: ClimateOverviewTile; direction: "cold" | "hot" } | undefined {
    const t = this._tempThresholds();
    let best: { tile: ClimateOverviewTile; direction: "cold" | "hot"; deviation: number } | undefined;
    for (const tile of tiles) {
      if (tile.temperature === undefined) continue;
      if (tile.temperature < t.cool) {
        const deviation = t.cool - tile.temperature;
        if (!best || deviation > best.deviation) best = { tile, direction: "cold", deviation };
      } else if (tile.temperature >= t.comfortable) {
        const deviation = tile.temperature - t.comfortable;
        if (!best || deviation > best.deviation) best = { tile, direction: "hot", deviation };
      }
    }
    return best;
  }

  /**
   * Width of the comparison track in px. Label collision has to be decided in
   * pixels — two rooms 0.1 °C apart sit at nearly the same percentage, but
   * whether their names overlap depends on how wide the card actually is.
   */
  @state() private _trackWidth = 0;
  private _trackObserver?: ResizeObserver;
  private _observedTrack?: HTMLElement;
  private _remeasureTimer?: number;

  private _setTrackWidth(w: number): void {
    if (w > 0 && Math.abs(w - this._trackWidth) > 1) this._trackWidth = w;
  }

  private _observeTrack(): void {
    const track = this.renderRoot?.querySelector(".compare-track-wrap") as HTMLElement | null;
    if (!track) return;

    // Lit replaces this node on re-render, so the observer is re-attached only
    // when it actually changed — disconnecting on every update would drop the
    // observer's initial callback before it ever fires.
    if (this._observedTrack !== track) {
      this._trackObserver?.disconnect();
      this._trackObserver ??= new ResizeObserver((entries) =>
        this._setTrackWidth(entries[0]?.contentRect.width ?? 0),
      );
      this._trackObserver.observe(track);
      this._observedTrack = track;
    }

    const w = track.getBoundingClientRect().width;
    if (w > 0) {
      this._setTrackWidth(w);
      return;
    }
    // Freshly attached cards have no layout yet. A timer rather than
    // requestAnimationFrame: a card rendered in a background tab would
    // otherwise never get its width, because animation frames and
    // ResizeObserver callbacks are both suspended while the tab is hidden.
    if (this._remeasureTimer === undefined) {
      this._remeasureTimer = window.setTimeout(() => {
        this._remeasureTimer = undefined;
        const el = this.renderRoot?.querySelector(".compare-track-wrap") as HTMLElement | null;
        if (el) this._setTrackWidth(el.getBoundingClientRect().width);
      }, 0);
    }
  }

  private _scaleRange(tiles: ClimateOverviewTile[]): [number, number] {
    const temps = tiles.filter((t) => t.temperature !== undefined).map((t) => t.temperature!);
    let autoMin = temps.length ? Math.floor(Math.min(...temps)) : 16;
    let autoMax = temps.length ? Math.ceil(Math.max(...temps)) : 26;
    if (autoMax - autoMin < CLIMATE_OVERVIEW_SCALE_MIN_SPAN) {
      const mid = (autoMin + autoMax) / 2;
      autoMin = Math.floor(mid - CLIMATE_OVERVIEW_SCALE_MIN_SPAN / 2);
      autoMax = Math.ceil(mid + CLIMATE_OVERVIEW_SCALE_MIN_SPAN / 2);
    }
    const min = this._config?.scale_min ?? autoMin;
    const max = this._config?.scale_max ?? autoMax;
    return max > min ? [min, max] : [min, min + CLIMATE_OVERVIEW_SCALE_MIN_SPAN];
  }

  /**
   * Decides which names fit without overlapping. Labels are placed greedily
   * into the two rows above and below the track, coldest and warmest first so
   * the ends of the scale — the interesting ones — never lose their name.
   * Anything that still collides is left off; the dot keeps its tooltip.
   */
  private _placeLabels(
    points: { pct: number; name: string }[],
  ): Map<number, { row: "above" | "below"; shiftPx: number }> {
    const placed = new Map<number, { row: "above" | "below"; shiftPx: number }>();
    const width = this._trackWidth;
    if (!width) return placed; // not measured yet — first paint draws dots only

    const rows: Record<"above" | "below", { from: number; to: number }[]> = { above: [], below: [] };
    // Priority: the two extremes, then the rest left to right. The ends of the
    // scale are the ones worth naming, so they must never lose to a neighbour.
    const order = [...points.keys()].sort((a, b) => {
      const extreme = (i: number) => (i === 0 || i === points.length - 1 ? 0 : 1);
      return extreme(a) - extreme(b) || a - b;
    });

    for (const i of order) {
      const p = points[i];
      const halfPx = Math.min(p.name.length * CLIMATE_OVERVIEW_LABEL_CHAR_PX, CLIMATE_OVERVIEW_LABEL_MAX_PX) / 2;
      const centre = (p.pct / 100) * width;
      // A label centred on a dot at 0 % or 100 % would hang off the card, so
      // it is nudged inwards and the collision test uses the nudged position.
      const shiftPx = Math.max(0, halfPx - centre) - Math.max(0, centre + halfPx - width);
      const from = centre + shiftPx - halfPx - CLIMATE_OVERVIEW_LABEL_GAP_PX / 2;
      const to = centre + shiftPx + halfPx + CLIMATE_OVERVIEW_LABEL_GAP_PX / 2;
      const row = (["above", "below"] as const).find((r) =>
        rows[r].every((s) => to <= s.from || from >= s.to),
      );
      if (!row) continue;
      rows[row].push({ from, to });
      placed.set(i, { row, shiftPx });
    }
    return placed;
  }

  private _renderCompareScale(tiles: ClimateOverviewTile[]) {
    const withTemp = tiles.filter((t) => t.temperature !== undefined);
    if (withTemp.length < 2) return nothing;

    const [min, max] = this._scaleRange(tiles);
    const span = max - min;
    const unit = this._tempUnit();
    const sorted = [...withTemp].sort((a, b) => a.temperature! - b.temperature!);
    const points = sorted.map((t) => ({
      pct: Math.max(0, Math.min(100, ((t.temperature! - min) / span) * 100)),
      name: t.name,
    }));
    const labelRows = this._config?.show_scale_labels === false ? new Map() : this._placeLabels(points);

    return html`
      <div class="compare-section">
        <div class="compare-title">${this._t("climate_overview_compare")}</div>
        <div class="compare-track-wrap">
          <div
            class="compare-track"
            style=${`background: linear-gradient(to right, ${CLIMATE_OVERVIEW_COLOR_COLD}, ${CLIMATE_OVERVIEW_COLOR_COOL}, ${CLIMATE_OVERVIEW_COLOR_COMFORTABLE}, ${CLIMATE_OVERVIEW_COLOR_WARM}, ${CLIMATE_OVERVIEW_COLOR_HOT});`}
          ></div>
          ${sorted.map((t, i) => {
            const pct = points[i].pct;
            const row = labelRows.get(i);
            return html`
              ${row
                ? html`
                    <div
                      class="compare-label ${row.row}"
                      style=${`left: ${pct}%; transform: translateX(calc(-50% + ${Math.round(row.shiftPx)}px));`}
                    >
                      ${t.name}
                    </div>
                  `
                : nothing}
              <div
                class="compare-dot"
                style=${`left: ${pct}%; background: ${t.tempColor};`}
                title="${t.name}: ${this._formatTempValue(t.temperature!)} ${unit}"
                role="button"
                tabindex="0"
                aria-label=${t.name}
                @click=${this._moreInfo(t.entity)}
                @keydown=${activateOnKey(this._moreInfo(t.entity))}
              ></div>
            `;
          })}
        </div>
        <div class="compare-minmax">
          <span>${this._formatTempValue(min)} ${unit}</span>
          <span>${this._formatTempValue(max)} ${unit}</span>
        </div>
      </div>
    `;
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const tiles = this._sortTiles(this._buildTiles());
    const validTemps = tiles.filter((t) => t.temperature !== undefined).map((t) => t.temperature!);
    const avgTemp = validTemps.length ? validTemps.reduce((a, b) => a + b, 0) / validTemps.length : undefined;

    const name = this._config.name || this._t("climate_overview_default_name");
    const icon = this._config.icon || DEFAULT_CLIMATE_OVERVIEW_ICON;
    const avgTempText = avgTemp !== undefined ? `${this._formatTempValue(avgTemp)} ${this._tempUnit()}` : "—";
    const subtitle =
      tiles.length === 0
        ? this._t("climate_overview_empty")
        : (tiles.length === 1
            ? this._t("climate_overview_subtitle_one")
            : this._t("climate_overview_subtitle").replace("{n}", String(tiles.length))
          ).replace("{temp}", avgTempText);

    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(this._config);
    const radius = resolveCornerRadius(this._config.radius ?? DEFAULT_CLIMATE_OVERVIEW_RADIUS, this._config.corners);
    const animClass = shouldAnimate(this._config.animation) ? "" : "no-animations";
    const outlier = this._config.show_outlier_chip !== false ? this._outlierTile(tiles) : undefined;

    const accentColor = this._config.accent_color
      ? resolveThemeColor(this._config.accent_color)
      : "var(--primary-text-color)";

    const cssVars = buildCssVars({
      "m3p-icon-color": accentColor,
      "m3p-icon-bg": tintBackground(accentColor, this._config.accent_opacity, 12),
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
            right: outlier
              ? html`
                  <div
                    class="outlier-chip"
                    style=${`background: ${tintBackground(outlier.tile.tempColor, this._config.tile_tint_opacity, 18)}; color: ${outlier.tile.tempColor};`}
                    role="button"
                    tabindex="0"
                    aria-label=${outlier.tile.name}
                    @click=${this._moreInfo(outlier.tile.entity)}
                    @keydown=${activateOnKey(this._moreInfo(outlier.tile.entity))}
                  >
                    <ha-icon icon=${outlier.direction === "cold" ? "mdi:snowflake" : "mdi:fire"}></ha-icon>
                    <span>${outlier.tile.name} ${this._formatTempValue(outlier.tile.temperature!)}°</span>
                  </div>
                `
              : undefined,
          })}

          ${tiles.length === 0
            ? html`<div class="empty-state">${this._t("climate_overview_empty")}</div>`
            : html`<div class="room-grid">${tiles.map((t) => this._renderTile(t))}</div>`}

          ${this._config.show_scale !== false ? this._renderCompareScale(tiles) : nothing}
        </div>
      </ha-card>
    `;
  }

  private _renderTile(tile: ClimateOverviewTile) {
    const humidity = this._humidityDisplay(tile);
    const trendDelta = this._trendDelta(tile);
    const moldRisk = this._moldRisk(tile);
    return html`
      <div
        class="room-tile ${tile.temperatureUnavailable ? "unavailable" : ""}"
        style=${`--tile-color: ${tile.tempColor}; background: ${tintBackground(tile.tempColor, this._config?.tile_tint_opacity, 12)};`}
        role="button"
        tabindex="0"
        aria-label=${tile.name}
        title=${tile.name}
        @click=${this._moreInfo(tile.entity)}
        @keydown=${activateOnKey(this._moreInfo(tile.entity))}
      >
        <div class="tile-header">
          <ha-icon icon=${tile.icon}></ha-icon>
          <span class="tile-name">${tile.name}</span>
          ${moldRisk
            ? html`
                <ha-icon
                  class="mold-icon"
                  icon="mdi:water-alert-outline"
                  title=${this._t("climate_overview_mold_risk")}
                ></ha-icon>
              `
            : nothing}
        </div>
        <div class="tile-temp">
          ${tile.temperatureUnavailable
            ? html`<span class="temp-value">${this._t("climate_overview_unavailable")}</span>`
            : html`
                <span class="temp-value">${this._formatTempValue(tile.temperature!)}</span>
                <span class="temp-unit">${this._tempUnit()}</span>
                ${trendDelta !== undefined
                  ? html`
                      <ha-icon
                        class="trend-icon"
                        icon=${trendDelta > 0 ? "mdi:arrow-up-thin" : "mdi:arrow-down-thin"}
                      ></ha-icon>
                    `
                  : nothing}
              `}
        </div>
        ${tile.hasHumidity
          ? html`
              <div class="tile-humidity" style=${`color: ${humidity.color}; opacity: ${humidity.opacity};`}>
                <ha-icon icon="mdi:water-outline"></ha-icon>
                <span>${tile.humidityUnavailable ? this._t("climate_overview_unavailable") : `${Math.round(tile.humidity!)} %`}</span>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    cardHeaderStyles,
    css`
      .room-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(${CLIMATE_OVERVIEW_GRID_MIN_COL}px, 1fr));
        gap: ${CLIMATE_OVERVIEW_GRID_GAP}px;
      }

      .room-tile {
        padding: 11px 9px;
        border-radius: ${CLIMATE_OVERVIEW_TILE_RADIUS}px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 4px;
        box-sizing: border-box;
      }

      .room-tile:focus-visible {
        outline: 2px solid var(--tile-color);
        outline-offset: 2px;
      }

      .room-tile.unavailable {
        opacity: 0.4;
      }

      .tile-header {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }

      .tile-header ha-icon {
        --mdc-icon-size: 13px;
        color: var(--tile-color);
        flex-shrink: 0;
      }

      .tile-name {
        font-size: 10px;
        opacity: 0.7;
        color: var(--m3p-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }

      .mold-icon {
        --mdc-icon-size: 11px;
        flex-shrink: 0;
        margin-left: auto;
        color: ${unsafeCSS(CLIMATE_OVERVIEW_HUMIDITY_WARN_COLOR)};
      }

      .tile-temp {
        display: flex;
        align-items: baseline;
        gap: 1px;
      }

      .trend-icon {
        --mdc-icon-size: 12px;
        color: var(--tile-color);
        opacity: 0.8;
        margin-left: 2px;
        align-self: center;
      }

      .temp-value {
        font-size: 21px;
        font-weight: 700;
        color: var(--tile-color);
      }

      .temp-unit {
        font-size: 11px;
        font-weight: 500;
        color: var(--tile-color);
      }

      .tile-humidity {
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 10px;
        font-weight: 500;
      }

      .tile-humidity ha-icon {
        --mdc-icon-size: 11px;
      }

      .outlier-chip {
        flex-shrink: 0;
        height: 30px;
        max-width: 150px;
        padding: 0 10px;
        border-radius: ${CLIMATE_OVERVIEW_CHIP_RADIUS}px;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .outlier-chip ha-icon {
        --mdc-icon-size: 16px;
        flex-shrink: 0;
      }

      .outlier-chip span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .empty-state {
        text-align: center;
        font-size: 13px;
        opacity: 0.6;
        padding: 16px 0;
        color: var(--m3p-secondary-text);
      }

      .compare-section {
        margin-top: 4px;
      }

      .compare-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--m3p-text);
        margin-bottom: 8px;
      }

      .compare-track-wrap {
        position: relative;
        height: 56px;
      }

      .compare-track {
        position: absolute;
        top: 24px;
        left: 0;
        right: 0;
        height: 8px;
        border-radius: 4px;
        opacity: 0.35;
      }

      .compare-dot {
        position: absolute;
        top: ${24 + 4 - CLIMATE_OVERVIEW_DOT_SIZE / 2}px;
        width: ${CLIMATE_OVERVIEW_DOT_SIZE}px;
        height: ${CLIMATE_OVERVIEW_DOT_SIZE}px;
        border-radius: ${CLIMATE_OVERVIEW_DOT_RADIUS}px;
        border: 2px solid var(--card-background-color, #1c1c1e);
        box-sizing: border-box;
        transform: translateX(-50%);
        cursor: pointer;
        transition: left ${CLIMATE_OVERVIEW_DOT_TRANSITION_MS}ms ${EASING};
      }

      .compare-dot:focus-visible {
        outline: 2px solid var(--m3p-text);
        outline-offset: 2px;
      }

      .card-inner.no-animations .compare-dot {
        transition: none;
      }

      .compare-label {
        position: absolute;
        font-size: 9px;
        color: var(--m3p-secondary-text);
        white-space: nowrap;
        transform: translateX(-50%);
        max-width: 70px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .compare-label.above {
        top: 0;
      }

      .compare-label.below {
        top: 40px;
      }

      .compare-minmax {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        opacity: 0.55;
        color: var(--m3p-secondary-text);
        margin-top: 2px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-climate-overview-card": M3ClimateOverviewCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-climate-overview-card",
  name: "M3 Climate Overview Card",
  description:
    "Eine Material-3-Übersicht aller Raumklima-Sensoren, automatisch nach Bereich gruppiert.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
