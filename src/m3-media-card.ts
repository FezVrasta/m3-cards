import { LitElement, html, css, svg, unsafeCSS, nothing, type PropertyValues } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3MediaCardConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_MEDIA_RADIUS,
  DEFAULT_MEDIA_ACCENT,
  MEDIA_ARTWORK_SIZE,
  MEDIA_ARTWORK_RADIUS,
  MEDIA_PLAY_BTN_SIZE,
  MEDIA_PLAY_BTN_RADIUS,
  MEDIA_TRANSPORT_BTN_SIZE,
  MEDIA_TRANSPORT_BTN_RADIUS,
  MEDIA_WAVE_HEIGHT,
  MEDIA_VOLUME_WAVE_HEIGHT,
  MEDIA_VOLUME_THROTTLE_MS,
  MEDIA_MUTE_BTN_HEIGHT,
  MEDIA_ARTWORK_COLOR_CACHE_SIZE,
  resolveCornerRadius,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors } from "./shared/color-config";
import { glassCardStyles, glassCardClass, renderMissingEntity } from "./shared/glass-card";
import { shouldAnimate, STANDARD_EASING } from "./shared/animation";
import { activateOnKey } from "./shared/a11y";
import { buildWavePath } from "./shared/wave";
import { stampVersion } from "./shared/config-migration";
import { fireEvent } from "./shared/editor-helpers";
import { localize, type TranslationKey } from "./localize";

console.info(
  `%c M3-MEDIA-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #a58fe8; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #a58fe8; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

const EASING = unsafeCSS(STANDARD_EASING);

const FEATURE = {
  PAUSE: 1,
  SEEK: 2,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  VOLUME_STEP: 1024,
  SELECT_SOURCE: 2048,
  PLAY: 16384,
  SHUFFLE_SET: 32768,
  REPEAT_SET: 262144,
} as const;

const OFF_STATES = new Set(["off", "unavailable", "unknown"]);
const IDLE_STATES = new Set(["idle", "standby"]);

// Small module-level LRU cache so the (fairly expensive) canvas color
// extraction only runs once per distinct artwork URL, shared across every
// m3-media-card instance and re-renders of the same card.
const artworkColorCache = new Map<string, string>();

function clampLuminanceRgb(r: number, g: number, b: number): [number, number, number] {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < 60) {
    const t = (60 - luma) / 60;
    return [r + (255 - r) * t * 0.5, g + (255 - g) * t * 0.5, b + (255 - b) * t * 0.5];
  }
  if (luma > 200) {
    const t = (luma - 200) / 55;
    return [r * (1 - t * 0.5), g * (1 - t * 0.5), b * (1 - t * 0.5)];
  }
  return [r, g, b];
}

async function extractArtworkColor(url: string): Promise<string | undefined> {
  const cached = artworkColorCache.get(url);
  if (cached) return cached;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
    });
    img.src = url;
    await loaded;
    const size = 16;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    if (count === 0) return undefined;
    const [cr, cg, cb] = clampLuminanceRgb(r / count, g / count, b / count);
    const hex = `#${[cr, cg, cb].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;
    if (artworkColorCache.size >= MEDIA_ARTWORK_COLOR_CACHE_SIZE) {
      const firstKey = artworkColorCache.keys().next().value;
      if (firstKey) artworkColorCache.delete(firstKey);
    }
    artworkColorCache.set(url, hex);
    return hex;
  } catch {
    // Cross-origin/proxy failures fall back to the configured/default accent.
    return undefined;
  }
}

@customElement("m3-media-card")
export class M3MediaCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3MediaCardConfig;
  @state() private _displayPosition = 0;
  @state() private _artworkColor?: string;
  @state() private _dragging = false;
  @state() private _dragVolume?: number;

  @query(".volume-slider") private _volumeSliderEl?: HTMLDivElement;

  private _positionTimer?: number;
  private _lastArtworkUrl?: string;
  private _volumeThrottleTimer?: number;
  private _pendingVolume?: number;
  private _lastVolumeCallTs = 0;

  public static getStubConfig(hass: HomeAssistant): M3MediaCardConfig {
    const entities = Object.keys(hass?.states ?? {}).filter((eid) => eid.startsWith("media_player."));
    return {
      type: "custom:m3-media-card",
      entity: entities[0] ?? "",
      glass_background: true,
    };
  }

  public setConfig(config: M3MediaCardConfig): void {
    if (!config.entity) {
      throw new Error("Bitte eine media_player-Entität auswählen / Please select a media_player entity");
    }
    this._config = stampVersion({
      glass_background: true,
      animation: "auto",
      use_artwork_color: true,
      show_source_select: false,
      show_shuffle_repeat: false,
      ...config,
    });
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_rows: 2 };
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-media-card-editor");
    return document.createElement("m3-media-card-editor") as unknown as LovelaceCardEditor;
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopPositionTimer();
    if (this._volumeThrottleTimer !== undefined) clearTimeout(this._volumeThrottleTimer);
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this._syncPositionTimer();
    this._maybeExtractColor();
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private get _entity() {
    if (!this.hass || !this._config) return undefined;
    return this.hass.states[this._config.entity];
  }

  private _computeDisplayPosition(): void {
    const entity = this._entity;
    if (!entity) return;
    const position = entity.attributes.media_position as number | undefined;
    const updatedAt = entity.attributes.media_position_updated_at as string | undefined;
    if (position === undefined) {
      this._displayPosition = 0;
      return;
    }
    if (entity.state === "playing" && updatedAt) {
      const elapsed = (Date.now() - new Date(updatedAt).getTime()) / 1000;
      this._displayPosition = Math.max(0, position + elapsed);
    } else {
      this._displayPosition = position;
    }
  }

  private _syncPositionTimer(): void {
    const entity = this._entity;
    const playing = entity?.state === "playing" && entity.attributes.media_duration;
    this._computeDisplayPosition();
    if (playing && this._positionTimer === undefined) {
      this._positionTimer = window.setInterval(() => {
        this._computeDisplayPosition();
      }, 1000);
    } else if (!playing) {
      this._stopPositionTimer();
    }
  }

  private _stopPositionTimer(): void {
    if (this._positionTimer !== undefined) {
      window.clearInterval(this._positionTimer);
      this._positionTimer = undefined;
    }
  }

  private _maybeExtractColor(): void {
    if (!this._config?.use_artwork_color) return;
    const entity = this._entity;
    const picture = entity?.attributes.entity_picture as string | undefined;
    if (!picture) {
      this._artworkColor = undefined;
      this._lastArtworkUrl = undefined;
      return;
    }
    if (picture === this._lastArtworkUrl) return;
    this._lastArtworkUrl = picture;
    const url = picture.startsWith("http") ? picture : `${location.origin}${picture}`;
    extractArtworkColor(url).then((color) => {
      if (this._lastArtworkUrl === picture) this._artworkColor = color;
    });
  }

  private _callService(service: string, data?: Record<string, unknown>): void {
    if (!this.hass || !this._config) return;
    this.hass.callService("media_player", service, { entity_id: this._config.entity, ...data });
  }

  private _fireMoreInfo(): void {
    fireEvent(this, "hass-more-info", { entityId: this._config?.entity });
  }

  private _handleVolumePointerDown = (e: PointerEvent): void => {
    if (!this._volumeSliderEl) return;
    e.preventDefault();
    this._volumeSliderEl.setPointerCapture(e.pointerId);
    this._dragging = true;
    const value = this._volumeFromClientX(e.clientX);
    this._dragVolume = value;
    this._throttledSetVolume(value);
  };

  private _handleVolumePointerMove = (e: PointerEvent): void => {
    if (!this._dragging) return;
    const value = this._volumeFromClientX(e.clientX);
    if (value === this._dragVolume) return;
    this._dragVolume = value;
    this._throttledSetVolume(value);
  };

  private _handleVolumePointerUp = (): void => {
    if (!this._dragging) return;
    this._dragging = false;
    if (this._dragVolume !== undefined) this._setVolumeNow(this._dragVolume);
    this._dragVolume = undefined;
  };

  private _volumeFromClientX(clientX: number): number {
    if (!this._volumeSliderEl) return 0;
    const rect = this._volumeSliderEl.getBoundingClientRect();
    const pct = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.min(1, Math.max(0, pct));
  }

  private _throttledSetVolume(value: number): void {
    this._pendingVolume = value;
    const now = performance.now();
    const elapsed = now - this._lastVolumeCallTs;
    if (elapsed >= MEDIA_VOLUME_THROTTLE_MS) {
      this._lastVolumeCallTs = now;
      this._pendingVolume = undefined;
      this._setVolumeNow(value);
    } else if (this._volumeThrottleTimer === undefined) {
      this._volumeThrottleTimer = window.setTimeout(() => {
        this._volumeThrottleTimer = undefined;
        if (this._pendingVolume !== undefined) {
          this._lastVolumeCallTs = performance.now();
          this._setVolumeNow(this._pendingVolume);
          this._pendingVolume = undefined;
        }
      }, MEDIA_VOLUME_THROTTLE_MS - elapsed);
    }
  }

  private _setVolumeNow(value: number): void {
    this._callService("volume_set", { volume_level: value });
  }

  private _formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, "0")}`;
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const entity = this.hass.states[this._config.entity];
    if (!entity) return renderMissingEntity(this._config.entity);

    const state = entity.state;
    const attrs = entity.attributes;
    const name = this._config.name || attrs.friendly_name || this._config.entity;
    const isPlaybackState = !OFF_STATES.has(state) && !IDLE_STATES.has(state);

    const configuredAccent = this._config.accent_color ? resolveThemeColor(this._config.accent_color) : undefined;
    const accentColor =
      configuredAccent ?? (this._config.use_artwork_color ? this._artworkColor : undefined) ?? DEFAULT_MEDIA_ACCENT;
    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(this._config);
    const radius = resolveCornerRadius(this._config.radius ?? DEFAULT_MEDIA_RADIUS, this._config.corners);
    const animClass = shouldAnimate(this._config.animation) ? "" : "no-animations";

    const cssVars = buildCssVars({
      "m3p-icon-color": accentColor,
      "m3p-icon-bg": `color-mix(in srgb, ${accentColor} 18%, transparent)`,
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
      "mc-accent": accentColor,
    });

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)} ${animClass}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${isPlaybackState ? this._renderPlayback(entity, attrs, name) : this._renderCompact(entity, attrs, name)}
        </div>
      </ha-card>
    `;
  }

  private _renderCompact(entity: { state: string }, attrs: Record<string, unknown>, name: string) {
    const off = OFF_STATES.has(entity.state);
    const statusText = entity.state === "unavailable" ? this._t("unavailable") : off ? this._t("media_off") : this._t("media_idle");
    const canTurnOn = ((attrs.supported_features as number) ?? 0) & (FEATURE.TURN_ON | FEATURE.TURN_OFF);

    return html`
      <div
        class="compact-row"
        role="button"
        tabindex="0"
        aria-label=${name}
        @click=${() => this._fireMoreInfo()}
        @keydown=${activateOnKey(() => this._fireMoreInfo())}
      >
        <div class="icon-swatch">
          <ha-icon icon="mdi:speaker"></ha-icon>
        </div>
        <div class="compact-text">
          <div class="compact-name">${name}</div>
          <div class="compact-status">${statusText}</div>
        </div>
        ${canTurnOn
          ? html`
              <button
                class="power-btn"
                ?disabled=${entity.state === "unavailable"}
                aria-label="mdi:power"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this._callService(off ? "turn_on" : "turn_off");
                }}
              >
                <ha-icon icon="mdi:power"></ha-icon>
              </button>
            `
          : nothing}
      </div>
    `;
  }

  private _renderPlayback(entity: { state: string }, attrs: Record<string, unknown>, name: string) {
    const features = (attrs.supported_features as number) ?? 0;
    const title = (attrs.media_title as string) || name;
    const artist = attrs.media_artist as string | undefined;
    const source = attrs.source as string | undefined;
    const picture = attrs.entity_picture as string | undefined;
    const duration = attrs.media_duration as number | undefined;
    const isPlaying = entity.state === "playing";
    const volume = (attrs.volume_level as number | undefined) ?? 0;
    const displayVolume = this._dragging ? (this._dragVolume ?? volume) : volume;
    const muted = !!attrs.is_volume_muted;

    return html`
      <div class="playback">
        <div class="playback-top">
          <div class="artwork" style=${picture ? `background-image: url(${picture});` : ""}>
            ${!picture ? html`<ha-icon icon="mdi:music-note"></ha-icon>` : nothing}
          </div>
          <div class="meta">
            <div class="meta-title">${title}</div>
            ${artist ? html`<div class="meta-artist">${artist}</div>` : nothing}
            ${source ? html`<div class="meta-source">${source}</div>` : nothing}
          </div>
        </div>

        ${duration
          ? html`
              <div class="progress">
                ${this._renderProgressWave(duration)}
                <div class="progress-times">
                  <span>${this._formatTime(this._displayPosition)}</span>
                  <span>${this._formatTime(duration)}</span>
                </div>
              </div>
            `
          : nothing}

        <div class="transport-row">
          ${features & FEATURE.PREVIOUS_TRACK
            ? html`
                <button class="transport-btn" @click=${() => this._callService("media_previous_track")}>
                  <ha-icon icon="mdi:skip-previous"></ha-icon>
                </button>
              `
            : nothing}
          ${features & (FEATURE.PAUSE | FEATURE.PLAY)
            ? html`
                <button class="play-btn" @click=${() => this._callService(isPlaying ? "media_pause" : "media_play")}>
                  <ha-icon icon=${isPlaying ? "mdi:pause" : "mdi:play"}></ha-icon>
                </button>
              `
            : nothing}
          ${features & FEATURE.NEXT_TRACK
            ? html`
                <button class="transport-btn" @click=${() => this._callService("media_next_track")}>
                  <ha-icon icon="mdi:skip-next"></ha-icon>
                </button>
              `
            : nothing}
          ${this._config?.show_shuffle_repeat && features & FEATURE.SHUFFLE_SET
            ? html`
                <button
                  class="pill-toggle ${attrs.shuffle ? "active" : ""}"
                  @click=${() => this._callService("shuffle_set", { shuffle: !attrs.shuffle })}
                >
                  <ha-icon icon="mdi:shuffle"></ha-icon>
                </button>
              `
            : nothing}
          ${this._config?.show_shuffle_repeat && features & FEATURE.REPEAT_SET
            ? html`
                <button
                  class="pill-toggle ${attrs.repeat && attrs.repeat !== "off" ? "active" : ""}"
                  @click=${() =>
                    this._callService("repeat_set", { repeat: attrs.repeat === "off" ? "all" : "off" })}
                >
                  <ha-icon icon="mdi:repeat"></ha-icon>
                </button>
              `
            : nothing}
        </div>

        ${features & FEATURE.VOLUME_SET ? this._renderVolume(displayVolume, muted, features) : nothing}

        ${this._config?.show_source_select && attrs.source_list
          ? this._renderSourceSelect(attrs.source_list as string[], source)
          : nothing}
      </div>
    `;
  }

  private _renderProgressWave(duration: number) {
    const pct = duration > 0 ? Math.min(1, this._displayPosition / duration) : 0;
    const width = 260;
    const midY = MEDIA_WAVE_HEIGHT / 2;
    const gap = 8;
    const activeEnd = Math.max(0, pct * width - gap / 2);
    const trackStart = Math.min(width, pct * width + gap / 2);
    return html`
      <svg class="progress-svg" viewBox="0 0 ${width} ${MEDIA_WAVE_HEIGHT}" preserveAspectRatio="none">
        ${activeEnd > 1
          ? svg`<path class="progress-active" d=${buildWavePath(0, activeEnd, 1.6, 14, 0, midY)} fill="none"></path>`
          : nothing}
        ${trackStart < width - 1
          ? svg`<line class="progress-track" x1=${trackStart} y1=${midY} x2=${width} y2=${midY}></line>`
          : nothing}
        <circle class="progress-dot" cx=${Math.min(width, pct * width)} cy=${midY} r="3"></circle>
      </svg>
    `;
  }

  private _renderVolume(volume: number, muted: boolean, features: number) {
    const width = 220;
    const midY = MEDIA_VOLUME_WAVE_HEIGHT / 2;
    const activeWidth = volume * width;
    return html`
      <div class="volume-row">
        ${features & FEATURE.VOLUME_MUTE
          ? html`
              <button class="mute-btn ${muted ? "active" : ""}" @click=${() => this._callService("volume_mute", { is_volume_muted: !muted })}>
                <ha-icon icon=${muted ? "mdi:volume-off" : "mdi:volume-high"}></ha-icon>
              </button>
            `
          : nothing}
        <div
          class="volume-slider"
          role="slider"
          aria-label=${this._t("media_volume_label")}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow=${Math.round(volume * 100)}
          tabindex="0"
          @pointerdown=${this._handleVolumePointerDown}
          @pointermove=${this._handleVolumePointerMove}
          @pointerup=${this._handleVolumePointerUp}
          @pointercancel=${this._handleVolumePointerUp}
        >
          <svg class="volume-svg" viewBox="0 0 ${width} ${MEDIA_VOLUME_WAVE_HEIGHT}" preserveAspectRatio="none">
            ${activeWidth > 1
              ? svg`<path class="volume-active" d=${buildWavePath(0, activeWidth, 3, 20, 0, midY)} fill="none"></path>`
              : nothing}
            ${activeWidth < width - 1
              ? svg`<line class="volume-track" x1=${activeWidth} y1=${midY} x2=${width} y2=${midY}></line>`
              : nothing}
          </svg>
        </div>
      </div>
    `;
  }

  private _renderSourceSelect(sources: string[], current: string | undefined) {
    return html`
      <div class="source-row">
        ${sources.map(
          (s) => html`
            <button
              class="source-pill ${s === current ? "active" : ""}"
              @click=${() => this._callService("select_source", { source: s })}
            >
              ${s}
            </button>
          `,
        )}
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    css`
      .compact-row {
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
      }

      .compact-row:focus-visible {
        outline: 2px solid var(--mc-accent);
        outline-offset: 2px;
        border-radius: 8px;
      }

      .icon-swatch {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--m3p-icon-bg);
        color: var(--m3p-icon-color);
      }

      .compact-text {
        flex: 1;
        min-width: 0;
      }

      .compact-name {
        font-size: 15px;
        font-weight: 700;
        color: var(--m3p-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .compact-status {
        font-size: 12px;
        opacity: 0.65;
        color: var(--m3p-secondary-text);
      }

      .power-btn {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 14px;
        background: color-mix(in srgb, var(--mc-accent) 14%, transparent);
        color: var(--mc-accent);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .playback {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .playback-top {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .artwork {
        flex-shrink: 0;
        width: ${MEDIA_ARTWORK_SIZE}px;
        height: ${MEDIA_ARTWORK_SIZE}px;
        border-radius: ${MEDIA_ARTWORK_RADIUS}px;
        background-color: color-mix(in srgb, var(--mc-accent) 18%, transparent);
        background-size: cover;
        background-position: center;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--mc-accent);
      }

      .artwork ha-icon {
        --mdc-icon-size: 30px;
      }

      .meta {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .meta-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--m3p-text);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .meta-artist {
        font-size: 12px;
        opacity: 0.65;
        color: var(--m3p-secondary-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .meta-source {
        font-size: 11px;
        opacity: 0.5;
        color: var(--m3p-secondary-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .progress {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .progress-svg {
        display: block;
        width: 100%;
        height: ${MEDIA_WAVE_HEIGHT}px;
        overflow: visible;
      }

      .progress-active {
        stroke: var(--mc-accent);
        stroke-width: 5px;
        stroke-linecap: round;
      }

      .progress-track {
        stroke: color-mix(in srgb, var(--primary-text-color) 16%, transparent);
        stroke-width: 5px;
        stroke-linecap: round;
      }

      .progress-dot {
        fill: var(--mc-accent);
      }

      .progress-times {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        opacity: 0.55;
        color: var(--m3p-text);
      }

      .transport-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }

      .transport-btn {
        flex-shrink: 0;
        width: ${MEDIA_TRANSPORT_BTN_SIZE}px;
        height: ${MEDIA_TRANSPORT_BTN_SIZE}px;
        border: none;
        border-radius: ${MEDIA_TRANSPORT_BTN_RADIUS}px;
        background: color-mix(in srgb, var(--mc-accent) 8%, transparent);
        color: var(--m3p-text);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .play-btn {
        flex-shrink: 0;
        width: ${MEDIA_PLAY_BTN_SIZE}px;
        height: ${MEDIA_PLAY_BTN_SIZE}px;
        border: none;
        border-radius: ${MEDIA_PLAY_BTN_RADIUS}px;
        background: var(--mc-accent);
        color: #101010;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: border-radius 300ms ${EASING};
      }

      .play-btn ha-icon {
        --mdc-icon-size: 26px;
      }

      .card-inner.no-animations .play-btn {
        transition: none;
      }

      .pill-toggle {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 14px;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--m3p-secondary-text);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .pill-toggle.active {
        background: color-mix(in srgb, var(--mc-accent) 24%, transparent);
        color: var(--mc-accent);
      }

      .volume-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .mute-btn {
        flex-shrink: 0;
        height: ${MEDIA_MUTE_BTN_HEIGHT}px;
        width: ${MEDIA_MUTE_BTN_HEIGHT}px;
        border: none;
        border-radius: 20px;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--m3p-secondary-text);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: border-radius 300ms ${EASING};
      }

      .mute-btn.active {
        border-radius: 12px;
        background: color-mix(in srgb, var(--mc-accent) 20%, transparent);
        color: var(--mc-accent);
      }

      .card-inner.no-animations .mute-btn {
        transition: none;
      }

      .volume-slider {
        flex: 1;
        height: ${MEDIA_VOLUME_WAVE_HEIGHT}px;
        cursor: pointer;
        touch-action: none;
        outline: none;
      }

      .volume-slider:focus-visible {
        outline: 2px solid var(--mc-accent);
        outline-offset: 2px;
        border-radius: 8px;
      }

      .volume-svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }

      .volume-active {
        stroke: var(--mc-accent);
        stroke-width: 14px;
        stroke-linecap: round;
      }

      .volume-track {
        stroke: color-mix(in srgb, var(--primary-text-color) 13%, transparent);
        stroke-width: 14px;
        stroke-linecap: round;
      }

      .source-row {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding-bottom: 2px;
      }

      .source-pill {
        flex-shrink: 0;
        height: 30px;
        padding: 0 12px;
        border: none;
        border-radius: 15px;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--m3p-text);
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: border-radius 300ms ${EASING};
      }

      .source-pill.active {
        background: color-mix(in srgb, var(--mc-accent) 22%, transparent);
        color: var(--mc-accent);
        border-radius: 10px;
      }

      .card-inner.no-animations .source-pill {
        transition: none;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-media-card": M3MediaCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-media-card",
  name: "M3 Media Card",
  description: "Steuerkarte für media_player-Entities mit Cover-Farbextraktion, Fortschritt und Lautstärke-Slider.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
