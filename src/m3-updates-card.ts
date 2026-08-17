import { LitElement, html, css, unsafeCSS, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type {
  HomeAssistant,
  HassEntity,
  M3UpdatesCardConfig,
  LovelaceCard,
  LovelaceGridOptions,
  UpdateGroup,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_UPDATES_RADIUS,
  DEFAULT_UPDATES_ICON,
  DEFAULT_UPDATES_MAX_VISIBLE,
  DEFAULT_UPDATES_NO_INSTALL,
  UPDATES_COLOR_OK,
  UPDATES_COLOR_AVAILABLE,
  UPDATES_COLOR_ADDON,
  UPDATES_COLOR_HACS,
  UPDATES_COLOR_FIRMWARE,
  UPDATES_COLOR_REMOTE,
  UPDATES_GROUP_ORDER,
  UPDATES_BANNER_PADDING,
  UPDATES_BANNER_RADIUS,
  UPDATES_BANNER_ICON_SIZE,
  UPDATES_BANNER_ICON_RADIUS,
  UPDATES_ROW_HEIGHT,
  UPDATES_ROW_RADIUS,
  UPDATES_ROW_ICON_SIZE,
  UPDATES_ROW_ICON_RADIUS,
  UPDATES_TOGGLE_HEIGHT,
  UPDATES_TOGGLE_RADIUS,
  resolveCornerRadius,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors, tintBackground } from "./shared/color-config";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import { shouldAnimate, STANDARD_EASING } from "./shared/animation";
import { fireEvent } from "./shared/editor-helpers";
import { stampVersion } from "./shared/config-migration";
import { activateOnKey } from "./shared/a11y";
import { localize, type TranslationKey } from "./localize";

console.info(
  `%c M3-UPDATES-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #85b7eb; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #85b7eb; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

interface UpdateRow {
  entity: string;
  name: string;
  group: UpdateGroup;
  installed?: string;
  latest?: string;
  pending: boolean;
  inProgress: boolean;
  percentage?: number;
  autoUpdate: boolean;
  picture?: string;
  skipped: boolean;
}

// Which registry platform an update entity comes from is a far more reliable
// signal than its entity_id: a mirrored second instance exposes entities named
// exactly like the local ones (home_assistant_core_update_2), so matching on
// "home_assistant_core" alone would render two indistinguishable core boxes.
const PLATFORM_GROUPS: Record<string, UpdateGroup> = {
  hacs: "hacs",
  remote_homeassistant: "remote",
};

const CORE_PATTERNS: [RegExp, UpdateGroup][] = [
  [/home_?assistant_core/, "core"],
  [/operating_system/, "os"],
  [/supervisor/, "supervisor"],
];

const GROUP_ICONS: Record<UpdateGroup, string> = {
  core: "mdi:home-assistant",
  os: "mdi:harddisk",
  supervisor: "mdi:server-network",
  addon: "mdi:puzzle-outline",
  hacs: "mdi:storefront-outline",
  firmware: "mdi:chip",
  remote: "mdi:lan-connect",
  other: "mdi:package-variant",
};

const GROUP_LABELS: Record<UpdateGroup, TranslationKey> = {
  core: "updates_group_core",
  os: "updates_group_os",
  supervisor: "updates_group_supervisor",
  addon: "updates_group_addon",
  hacs: "updates_group_hacs",
  firmware: "updates_group_firmware",
  remote: "updates_group_remote",
  other: "updates_group_other",
};

@customElement("m3-updates-card")
export class M3UpdatesCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3UpdatesCardConfig;
  @state() private _expanded = false;
  @state() private _platforms: Record<string, string> = {};
  private _unavailable = 0;

  public setConfig(config: M3UpdatesCardConfig): void {
    this._config = stampVersion({
      auto_discover: true,
      max_visible: DEFAULT_UPDATES_MAX_VISIBLE,
      show_uptodate: true,
      show_skipped: true,
      show_release_notes: true,
      require_confirm: true,
      ...config,
    });
    this._loadPlatforms();
  }

  // getConfigElement follows in step 4 together with the editor; until then
  // the card is configured via YAML.

  public static getStubConfig(): Partial<M3UpdatesCardConfig> {
    return { auto_discover: true };
  }

  public getCardSize(): number {
    return 4;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", min_rows: 3 };
  }

  // The registry is only needed for the platform → group mapping, so it's
  // fetched once rather than on every render.
  private async _loadPlatforms(): Promise<void> {
    if (!this.hass || Object.keys(this._platforms).length) return;
    try {
      const reg = await this.hass.callWS<Array<{ entity_id: string; platform: string }>>({
        type: "config/entity_registry/list",
      });
      const map: Record<string, string> = {};
      for (const e of reg) if (e.entity_id.startsWith("update.")) map[e.entity_id] = e.platform;
      this._platforms = map;
    } catch {
      this._platforms = {}; // fall back to entity_id patterns below
    }
  }

  protected updated(): void {
    if (this.hass && !Object.keys(this._platforms).length) this._loadPlatforms();
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _groupFor(entityId: string, st: HassEntity): UpdateGroup {
    for (const [needle, group] of Object.entries(this._config?.type_patterns ?? {})) {
      if (entityId.includes(needle)) return group;
    }
    const platform = this._platforms[entityId];
    const mapped = platform ? PLATFORM_GROUPS[platform] : undefined;
    if (mapped) return mapped;
    if (platform === "hassio" || !platform) {
      for (const [re, group] of CORE_PATTERNS) if (re.test(entityId)) return group;
      if (platform === "hassio") return "addon";
    }
    // Everything else that isn't the supervisor or HACS is device firmware —
    // including integrations that never set device_class (e.g. tapo_control).
    if (platform) return "firmware";
    return st.attributes.device_class === "firmware" ? "firmware" : "other";
  }

  private _groupOrder(): UpdateGroup[] {
    const custom = this._config?.group_order ?? [];
    const rest = UPDATES_GROUP_ORDER.filter((g) => !custom.includes(g));
    return [...custom, ...rest] as UpdateGroup[];
  }

  private _buildRows(): UpdateRow[] {
    if (!this.hass || !this._config) return [];
    const cfg = this._config;
    const excluded = new Set(cfg.exclude_entities ?? []);
    const ids = cfg.auto_discover
      ? Object.keys(this.hass.states).filter((id) => id.startsWith("update.") && !excluded.has(id))
      : (cfg.entities ?? []).filter((id) => !excluded.has(id));

    const include = cfg.include_types?.length ? new Set(cfg.include_types) : undefined;
    const rows: UpdateRow[] = [];
    this._unavailable = 0;
    for (const id of ids) {
      const st = this.hass.states[id];
      if (!st) continue;
      // A restored entity is one HA could not reach on startup: no version, no
      // name, no state. Counting those as "watched" would overstate coverage,
      // and listing them would add nameless rows, so they are surfaced as a
      // note instead.
      if (st.attributes.restored || st.state === "unavailable" || st.state === "unknown") {
        this._unavailable += 1;
        continue;
      }
      const group = this._groupFor(id, st);
      if (include && !include.has(group)) continue;
      const a = st.attributes;
      rows.push({
        entity: id,
        name: a.title || a.friendly_name || id,
        group,
        installed: a.installed_version,
        latest: a.latest_version,
        pending: st.state === "on",
        inProgress: !!a.in_progress,
        percentage: typeof a.update_percentage === "number" ? a.update_percentage : undefined,
        autoUpdate: !!a.auto_update,
        picture: a.entity_picture,
        skipped: st.state === "off" && !!a.skipped_version,
      });
    }

    const order = this._groupOrder();
    return rows.sort((x, y) => {
      const d = order.indexOf(x.group) - order.indexOf(y.group);
      return d !== 0 ? d : x.name.localeCompare(y.name);
    });
  }

  private _installAllowed(group: UpdateGroup): boolean {
    const blocked = this._config?.no_install_types ?? DEFAULT_UPDATES_NO_INSTALL;
    return !blocked.includes(group);
  }

  private _moreInfo(entityId: string): () => void {
    return () => fireEvent(this, "hass-more-info", { entityId });
  }

  private _groupColor(group: UpdateGroup): string {
    const c = this._config;
    switch (group) {
      case "addon":
        return c?.addon_color ? resolveThemeColor(c.addon_color) : UPDATES_COLOR_ADDON;
      case "hacs":
        return c?.hacs_color ? resolveThemeColor(c.hacs_color) : UPDATES_COLOR_HACS;
      case "firmware":
        return c?.firmware_color ? resolveThemeColor(c.firmware_color) : UPDATES_COLOR_FIRMWARE;
      case "remote":
        return c?.remote_color ? resolveThemeColor(c.remote_color) : UPDATES_COLOR_REMOTE;
      default:
        return c?.update_color ? resolveThemeColor(c.update_color) : UPDATES_COLOR_AVAILABLE;
    }
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const rows = this._buildRows();
    const pending = rows.filter((r) => r.pending && !r.skipped);
    const running = pending.find((r) => r.inProgress);
    const upToDate = rows.filter((r) => !r.pending);

    const okColor = this._config.ok_color ? resolveThemeColor(this._config.ok_color) : UPDATES_COLOR_OK;
    const updColor = this._config.update_color
      ? resolveThemeColor(this._config.update_color)
      : UPDATES_COLOR_AVAILABLE;
    const statusColor = running ? updColor : pending.length ? updColor : okColor;

    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(this._config);
    const radius = resolveCornerRadius(this._config.radius ?? DEFAULT_UPDATES_RADIUS, this._config.corners);
    const animClass = shouldAnimate(this._config.animation) ? "" : "no-animations";

    const maxVisible = this._config.max_visible ?? DEFAULT_UPDATES_MAX_VISIBLE;
    const visible = maxVisible > 0 ? pending.slice(0, maxVisible) : pending;
    const overflow = maxVisible > 0 ? pending.slice(maxVisible) : [];

    const title = running
      ? this._t("updates_status_running").replace("{name}", running.name)
      : pending.length
        ? this._t(pending.length === 1 ? "updates_status_one" : "updates_status_many").replace(
            "{n}",
            String(pending.length),
          )
        : this._t("updates_status_ok");

    const cssVars = buildCssVars({
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
      "upd-status": statusColor,
      "upd-status-bg": tintBackground(statusColor, this._config.accent_opacity, 14),
      "upd-status-icon-bg": tintBackground(statusColor, undefined, 24),
    });

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)} ${animClass}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          <div class="banner">
            <div class="banner-icon">
              <ha-icon
                icon=${running
                  ? "mdi:progress-download"
                  : pending.length
                    ? "mdi:package-up"
                    : "mdi:check-circle-outline"}
              ></ha-icon>
            </div>
            <div class="banner-text">
              <div class="banner-title">${title}</div>
              <div class="banner-sub">
                ${this._t("updates_watched").replace("{n}", String(rows.length))}
              </div>
            </div>
          </div>

          ${rows.length === 0
            ? html`<div class="empty-state">${this._t("updates_empty")}</div>`
            : nothing}

          ${visible.length
            ? html`<div class="row-list">
                ${repeat(visible, (r) => r.entity, (r) => this._renderRow(r))}
              </div>`
            : nothing}

          ${overflow.length
            ? html`
                <button
                  class="toggle ${this._expanded ? "open" : ""}"
                  @click=${() => (this._expanded = !this._expanded)}
                >
                  <span>
                    ${overflow.length}
                    ${this._expanded
                      ? this._t(overflow.length === 1 ? "updates_hide_more_one" : "updates_hide_more")
                      : this._t(overflow.length === 1 ? "updates_show_more_one" : "updates_show_more")}
                  </span>
                  <ha-icon class="chevron" icon="mdi:chevron-down"></ha-icon>
                </button>
                ${this._expanded
                  ? html`<div class="row-list">
                      ${repeat(overflow, (r) => r.entity, (r) => this._renderRow(r))}
                    </div>`
                  : nothing}
              `
            : nothing}

          ${this._unavailable
            ? html`<div class="uptodate-note">
                <ha-icon icon="mdi:cloud-off-outline"></ha-icon>
                <span>${this._t("updates_unavailable").replace("{n}", String(this._unavailable))}</span>
              </div>`
            : nothing}

          ${this._config.show_uptodate !== false && upToDate.length
            ? html`<div class="uptodate-note">
                <ha-icon icon="mdi:check-circle-outline"></ha-icon>
                <span>${this._t("updates_uptodate").replace("{n}", String(upToDate.length))}</span>
              </div>`
            : nothing}
        </div>
      </ha-card>
    `;
  }

  private _renderRow(row: UpdateRow) {
    const color = this._groupColor(row.group);
    const readOnly = !this._installAllowed(row.group);
    return html`
      <div
        class="row"
        role="button"
        tabindex="0"
        title=${row.name}
        @click=${this._moreInfo(row.entity)}
        @keydown=${activateOnKey(this._moreInfo(row.entity))}
      >
        <div class="row-icon" style=${`background: ${tintBackground(color, undefined, 20)}; color: ${color};`}>
          ${row.picture
            ? html`<img src=${row.picture} alt="" />`
            : html`<ha-icon icon=${GROUP_ICONS[row.group]}></ha-icon>`}
        </div>
        <div class="row-text">
          <div class="row-name">${row.name}</div>
          <div class="row-type">
            ${this._t(GROUP_LABELS[row.group])}
            ${row.autoUpdate ? html`· <ha-icon class="auto" icon="mdi:autorenew"></ha-icon>` : nothing}
            ${readOnly ? html`· ${this._t("updates_readonly")}` : nothing}
          </div>
        </div>
        <div class="row-version" style=${`color: ${color};`}>${row.latest ?? ""}</div>
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }

      .card-inner {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }

      .banner {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: ${UPDATES_BANNER_PADDING}px;
        border-radius: ${UPDATES_BANNER_RADIUS}px;
        background: var(--upd-status-bg);
      }

      .banner-icon {
        flex-shrink: 0;
        width: ${UPDATES_BANNER_ICON_SIZE}px;
        height: ${UPDATES_BANNER_ICON_SIZE}px;
        border-radius: ${UPDATES_BANNER_ICON_RADIUS}px;
        background: var(--upd-status-icon-bg);
        color: var(--upd-status);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .banner-text {
        min-width: 0;
      }

      .banner-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--m3p-text);
      }

      .banner-sub {
        font-size: 12px;
        opacity: 0.65;
        color: var(--m3p-secondary-text);
      }

      .row-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        height: ${UPDATES_ROW_HEIGHT}px;
        border-radius: ${UPDATES_ROW_RADIUS}px;
        padding: 0 12px;
        background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
        cursor: pointer;
        min-width: 0;
      }

      .row-icon {
        flex-shrink: 0;
        width: ${UPDATES_ROW_ICON_SIZE}px;
        height: ${UPDATES_ROW_ICON_SIZE}px;
        border-radius: ${UPDATES_ROW_ICON_RADIUS}px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .row-icon ha-icon {
        --mdc-icon-size: 18px;
      }

      .row-icon img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .row-text {
        flex: 1;
        min-width: 0;
      }

      .row-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--m3p-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .row-type {
        font-size: 10px;
        opacity: 0.5;
        color: var(--m3p-secondary-text);
        display: flex;
        align-items: center;
        gap: 3px;
      }

      .row-type .auto {
        --mdc-icon-size: 11px;
      }

      .row-version {
        flex-shrink: 0;
        font-size: 11px;
        font-weight: 700;
      }

      .toggle {
        width: 100%;
        height: ${UPDATES_TOGGLE_HEIGHT}px;
        border-radius: ${UPDATES_TOGGLE_RADIUS}px;
        border: none;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--m3p-text);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        transition: border-radius 350ms ${unsafeCSS(STANDARD_EASING)};
      }

      .toggle.open {
        border-radius: 12px;
      }

      .chevron {
        --mdc-icon-size: 18px;
        transition: transform 350ms ${unsafeCSS(STANDARD_EASING)};
      }

      .toggle.open .chevron {
        transform: rotate(180deg);
      }

      .card-inner.no-animations .toggle,
      .card-inner.no-animations .chevron {
        transition: none;
      }

      .uptodate-note {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        opacity: 0.6;
        color: var(--m3p-secondary-text);
      }

      .uptodate-note ha-icon {
        --mdc-icon-size: 16px;
      }

      .empty-state {
        font-size: 13px;
        opacity: 0.7;
        color: var(--m3p-secondary-text);
        padding: 8px 4px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-updates-card": M3UpdatesCard;
  }
}

const windowWithCards = window as unknown as Window & {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-updates-card",
  name: "M3 Updates Card",
  description:
    "Übersicht aller verfügbaren Updates (Core, OS, Supervisor, Add-ons, HACS, Firmware) mit Statusbanner.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
