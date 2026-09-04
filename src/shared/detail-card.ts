import { resolveCardTemplate, type CardTemplateTokens } from "./card-template";
import type { PopupCardHandle } from "./popup-card";

// `loadCardHelpers` is a global HA's own frontend attaches to `window` at
// runtime (the same public API `auto-entities` uses to instantiate arbitrary
// card types) — no npm dependency needed, and unavailable outside a running
// HA frontend (e.g. in tests), hence optional.
export interface CardHelpers {
  createCardElement(config: Record<string, unknown>): Promise<HTMLElement & PopupCardHandle>;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

/**
 * Builds (and reuses) a Lovelace card element from a user-configured card
 * skeleton plus a per-tap token map — the popup's "detail card" mode. Mirrors
 * `auto-entities`' own instantiation lifecycle: the element is only rebuilt
 * when the resolved `type` actually changes; any other config/token change is
 * applied via `setConfig()` on the existing element, and `hass` is always
 * pushed through. Call `sync()` from the host's `updated()`, passing an
 * `onChange` that writes the host's own `@state` element field — same
 * calling convention as `CompareScaleTrack.observe()` in compare-scale.ts.
 */
export class DetailCardController {
  private _el?: HTMLElement & PopupCardHandle;
  private _elType?: string;
  private _skeletonKey?: string;
  private _building = false;

  reset(): void {
    this._el = undefined;
    this._elType = undefined;
    this._skeletonKey = undefined;
    this._building = false;
  }

  sync(params: {
    skeleton: Record<string, unknown> | undefined;
    tokens: CardTemplateTokens;
    hass: unknown;
    onChange: (el: (HTMLElement & PopupCardHandle) | undefined) => void;
  }): void {
    const { skeleton, tokens, hass, onChange } = params;
    if (!skeleton) {
      if (this._el) this.reset();
      onChange(undefined);
      return;
    }

    const resolved = resolveCardTemplate(skeleton, tokens) as Record<string, unknown>;
    const key = JSON.stringify(resolved);
    if (key === this._skeletonKey && this._el) {
      this._el.hass = hass;
      onChange(this._el);
      return;
    }

    const type = typeof resolved.type === "string" ? resolved.type : undefined;
    if (this._el && type === this._elType) {
      this._skeletonKey = key;
      this._el.setConfig?.(resolved);
      this._el.hass = hass;
      onChange(this._el);
      return;
    }

    // A build for a stale key may already be in flight — the next sync()
    // call (the host's next updated() tick) re-checks the key once it lands
    // and starts a fresh build if it's still out of date. Avoids piling up
    // concurrent loadCardHelpers() calls under rapid hass/token churn.
    if (this._building) return;
    const loadHelpers = window.loadCardHelpers;
    if (!loadHelpers) {
      onChange(undefined);
      return;
    }
    this._building = true;
    this._skeletonKey = key;
    loadHelpers()
      .then((helpers) => helpers.createCardElement(resolved))
      .then((el) => {
        el.hass = hass;
        this._el = el;
        this._elType = type;
        onChange(el);
      })
      .catch((e) => {
        console.error("m3-cards: failed to build detail card", e);
        onChange(undefined);
      })
      .finally(() => {
        this._building = false;
      });
  }
}
