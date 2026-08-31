import { html, css, nothing, unsafeCSS, type CSSResult, type TemplateResult } from "lit";
import { activateOnKey } from "./a11y";

// A horizontal "where does each room sit relative to the others" scale —
// originally built for m3-climate-overview-card's temperature comparison,
// extracted so any overview card with a numeric per-tile value (not just
// temperature) can attach the same bar. Not something every overview card
// gets automatically: a binary-state card like m3-lights-overview has no numeric
// value to place on it, so it doesn't use this module at all.

// ---- track width (ResizeObserver) -----------------------------------------

/**
 * Tracks the pixel width of the scale's track element, for label-collision
 * math that has to be decided in pixels (two tiles 0.1° apart sit at nearly
 * the same percentage, but whether their names overlap depends on how wide
 * the card actually is). One instance per card, held as an instance field —
 * not re-created per render, since it owns a live ResizeObserver.
 */
export class CompareScaleTrack {
  private _lastWidth = 0;
  private _observer?: ResizeObserver;
  private _observedEl?: HTMLElement;
  private _remeasureTimer?: number;

  private _report(width: number, onChange: (width: number) => void): void {
    if (width > 0 && Math.abs(width - this._lastWidth) > 1) {
      this._lastWidth = width;
      onChange(width);
    }
  }

  /**
   * Call from the host's `updated()` on every render, passing the currently
   * rendered track element (e.g. `renderRoot.querySelector(".compare-track-wrap")`).
   * `onChange` is expected to write the host's own `@state` width field, so
   * Lit's normal reactivity does the re-render.
   */
  observe(track: HTMLElement | null | undefined, onChange: (width: number) => void): void {
    if (!track) return;

    // Lit replaces this node on re-render, so the observer is re-attached
    // only when it actually changed — disconnecting on every update would
    // drop the observer's initial callback before it ever fires.
    if (this._observedEl !== track) {
      this._observer?.disconnect();
      this._observer ??= new ResizeObserver((entries) => this._report(entries[0]?.contentRect.width ?? 0, onChange));
      this._observer.observe(track);
      this._observedEl = track;
    }

    const width = track.getBoundingClientRect().width;
    if (width > 0) {
      this._report(width, onChange);
      return;
    }
    // Freshly attached cards have no layout yet. A timer rather than
    // requestAnimationFrame: a card rendered in a background tab would
    // otherwise never get its width, because animation frames and
    // ResizeObserver callbacks are both suspended while the tab is hidden.
    if (this._remeasureTimer === undefined) {
      this._remeasureTimer = window.setTimeout(() => {
        this._remeasureTimer = undefined;
        this._report(track.getBoundingClientRect().width, onChange);
      }, 0);
    }
  }

  disconnect(): void {
    this._observer?.disconnect();
    this._observer = undefined;
    this._observedEl = undefined;
    if (this._remeasureTimer !== undefined) {
      window.clearTimeout(this._remeasureTimer);
      this._remeasureTimer = undefined;
    }
  }
}

// ---- pure layout math -------------------------------------------------------

export function computeScaleRange(params: {
  values: number[];
  configMin?: number;
  configMax?: number;
  minSpan: number;
  /** Range shown when no tile has a value at all. */
  fallbackMin: number;
  fallbackMax: number;
}): [number, number] {
  const { values, configMin, configMax, minSpan, fallbackMin, fallbackMax } = params;
  let autoMin = values.length ? Math.floor(Math.min(...values)) : fallbackMin;
  let autoMax = values.length ? Math.ceil(Math.max(...values)) : fallbackMax;
  if (autoMax - autoMin < minSpan) {
    const mid = (autoMin + autoMax) / 2;
    autoMin = Math.floor(mid - minSpan / 2);
    autoMax = Math.ceil(mid + minSpan / 2);
  }
  const min = configMin ?? autoMin;
  const max = configMax ?? autoMax;
  return max > min ? [min, max] : [min, min + minSpan];
}

export interface ScalePoint {
  pct: number;
  name: string;
}

export interface PlacedLabel {
  row: "above" | "below";
  shiftPx: number;
}

/**
 * Decides which names fit without overlapping. Labels are placed greedily
 * into the two rows above and below the track, the two extremes first so the
 * ends of the scale — the interesting ones — never lose their name. Anything
 * that still collides is left off; the dot keeps its tooltip.
 */
export function placeScaleLabels(
  points: ScalePoint[],
  trackWidthPx: number,
  charPx: number,
  maxLabelPx: number,
  gapPx: number,
): Map<number, PlacedLabel> {
  const placed = new Map<number, PlacedLabel>();
  if (!trackWidthPx) return placed; // not measured yet — first paint draws dots only

  const rows: Record<"above" | "below", { from: number; to: number }[]> = { above: [], below: [] };
  const order = [...points.keys()].sort((a, b) => {
    const extreme = (i: number) => (i === 0 || i === points.length - 1 ? 0 : 1);
    return extreme(a) - extreme(b) || a - b;
  });

  for (const i of order) {
    const p = points[i];
    const halfPx = Math.min(p.name.length * charPx, maxLabelPx) / 2;
    const centre = (p.pct / 100) * trackWidthPx;
    // A label centred on a dot at 0% or 100% would hang off the card, so it
    // is nudged inwards and the collision test uses the nudged position.
    const shiftPx = Math.max(0, halfPx - centre) - Math.max(0, centre + halfPx - trackWidthPx);
    const from = centre + shiftPx - halfPx - gapPx / 2;
    const to = centre + shiftPx + halfPx + gapPx / 2;
    const row = (["above", "below"] as const).find((r) => rows[r].every((s) => to <= s.from || from >= s.to));
    if (!row) continue;
    rows[row].push({ from, to });
    placed.set(i, { row, shiftPx });
  }
  return placed;
}

// ---- render -----------------------------------------------------------------

export interface CompareScaleTile {
  key: string;
  name: string;
  value: number | undefined;
  color: string;
}

export interface CompareScaleParams<Tile extends CompareScaleTile> {
  tiles: Tile[];
  trackWidthPx: number;
  configMin?: number;
  configMax?: number;
  minSpan: number;
  fallbackMin: number;
  fallbackMax: number;
  unit: string;
  formatValue: (value: number) => string;
  title: string;
  showLabels: boolean;
  charPx: number;
  maxLabelPx: number;
  gapPx: number;
  /** Left-to-right gradient stops for the track background, e.g. the
   * cold→hot color ramp. */
  gradientColors: string[];
  onActivate: (tile: Tile) => void;
}

// Renders nothing below two tiles with a value — a "comparison" of one point
// isn't one, and it's what m3-climate-overview-card's `show_scale` config
// gates already, so this stays a true no-op rather than an empty bar.
export function renderCompareScale<Tile extends CompareScaleTile>(
  params: CompareScaleParams<Tile>,
): TemplateResult | typeof nothing {
  const withValue = params.tiles.filter((t) => t.value !== undefined);
  if (withValue.length < 2) return nothing;

  const [min, max] = computeScaleRange({
    values: withValue.map((t) => t.value!),
    configMin: params.configMin,
    configMax: params.configMax,
    minSpan: params.minSpan,
    fallbackMin: params.fallbackMin,
    fallbackMax: params.fallbackMax,
  });
  const span = max - min;
  const sorted = [...withValue].sort((a, b) => a.value! - b.value!);
  const points: ScalePoint[] = sorted.map((t) => ({
    pct: Math.max(0, Math.min(100, ((t.value! - min) / span) * 100)),
    name: t.name,
  }));
  const labelRows = params.showLabels
    ? placeScaleLabels(points, params.trackWidthPx, params.charPx, params.maxLabelPx, params.gapPx)
    : new Map<number, PlacedLabel>();

  return html`
    <div class="compare-section">
      <div class="compare-title">${params.title}</div>
      <div class="compare-track-wrap">
        <div
          class="compare-track"
          style=${`background: linear-gradient(to right, ${params.gradientColors.join(", ")});`}
        ></div>
        ${sorted.map((t, i) => {
          const pct = points[i].pct;
          const row = labelRows.get(i);
          const activate = () => params.onActivate(t);
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
              style=${`left: ${pct}%; background: ${t.color};`}
              title="${t.name}: ${params.formatValue(t.value!)} ${params.unit}"
              role="button"
              tabindex="0"
              aria-label=${t.name}
              @click=${activate}
              @keydown=${activateOnKey(activate)}
            ></div>
          `;
        })}
      </div>
      <div class="compare-minmax">
        <span>${params.formatValue(min)} ${params.unit}</span>
        <span>${params.formatValue(max)} ${params.unit}</span>
      </div>
    </div>
  `;
}

// ---- styles -------------------------------------------------------------

// Dot/transition sizing is baked in at call time (not left as CSS custom
// properties) so a card with only one scale on the page pays nothing extra —
// this mirrors how the styles were written inline before extraction.
export function compareScaleStyles(params: {
  dotSizePx: number;
  dotRadiusPx: number;
  dotTransitionMs: number;
  easing: string;
}): CSSResult {
  const { dotSizePx, dotRadiusPx, dotTransitionMs } = params;
  const easing = unsafeCSS(params.easing);
  return css`
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
      top: ${24 + 4 - dotSizePx / 2}px;
      width: ${dotSizePx}px;
      height: ${dotSizePx}px;
      border-radius: ${dotRadiusPx}px;
      border: 2px solid var(--card-background-color, #1c1c1e);
      box-sizing: border-box;
      transform: translateX(-50%);
      cursor: pointer;
      transition: left ${dotTransitionMs}ms ${easing};
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
  `;
}
