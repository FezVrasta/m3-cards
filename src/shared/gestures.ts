import { activateOnKey } from "./a11y";

const HOLD_MS = 500;
const MOVE_CANCEL_PX = 16;
const DOUBLE_TAP_WINDOW_MS = 250;

export interface TapHoldHandlers {
  onTap?: () => void;
  onHold?: () => void;
  onDoubleTap?: () => void;
  /** Fires true the moment a hold starts (not when it fires) and false when
   * it ends, so a tile can show a pressed state while the hold is pending —
   * without it the hold reads as unresponsive until the action appears. */
  onPressChange?: (pressed: boolean) => void;
}

export interface TapHoldListeners {
  "@pointerdown": (e: PointerEvent) => void;
  "@pointermove": (e: PointerEvent) => void;
  "@pointerup": (e: PointerEvent) => void;
  "@pointercancel": (e: PointerEvent) => void;
  "@contextmenu": (e: Event) => void;
  "@keydown": (e: KeyboardEvent) => void;
}

interface GestureState {
  startX: number;
  startY: number;
  held: boolean;
  lastTapAt: number;
  holdTimer?: number;
  tapTimer?: number;
}

// Tap / hold / double-tap over pointer events, for tile grids that need all
// three on one element (m3-lights-overview: tap toggles, hold opens a popup).
// One instance is shared across a tile's listeners, not re-created per
// render — it owns pending timers.
export class TapHoldGesture {
  private _state: GestureState = { startX: 0, startY: 0, held: false, lastTapAt: 0 };
  private _scrollHandler?: () => void;

  // Call from disconnectedCallback so a pending hold/tap timer doesn't fire
  // (or leave a dangling pressed state) after the element is gone.
  cancel(): void {
    this._detachScrollGuard();
    if (this._state.holdTimer !== undefined) window.clearTimeout(this._state.holdTimer);
    if (this._state.tapTimer !== undefined) window.clearTimeout(this._state.tapTimer);
    this._state.holdTimer = undefined;
    this._state.tapTimer = undefined;
  }

  // A touch scroll does not reliably fire pointermove before the browser
  // takes the gesture over, so the scroll itself is watched as a second
  // cancel path for a pending hold.
  private _attachScrollGuard(onCancel: () => void): void {
    this._detachScrollGuard();
    this._scrollHandler = () => {
      onCancel();
      this._detachScrollGuard();
    };
    window.addEventListener("scroll", this._scrollHandler, { passive: true, capture: true });
  }

  private _detachScrollGuard(): void {
    if (this._scrollHandler) {
      window.removeEventListener("scroll", this._scrollHandler, { capture: true });
      this._scrollHandler = undefined;
    }
  }

  listeners(handlers: TapHoldHandlers): TapHoldListeners {
    const resolveTap = (): void => {
      if (!handlers.onDoubleTap) {
        handlers.onTap?.();
        return;
      }
      const now = Date.now();
      if (now - this._state.lastTapAt < DOUBLE_TAP_WINDOW_MS) {
        this._state.lastTapAt = 0;
        if (this._state.tapTimer !== undefined) window.clearTimeout(this._state.tapTimer);
        this._state.tapTimer = undefined;
        handlers.onDoubleTap();
        return;
      }
      // First tap of a possible pair: wait out the window before committing
      // to onTap, so a fast second tap can still upgrade it to onDoubleTap.
      this._state.lastTapAt = now;
      this._state.tapTimer = window.setTimeout(() => {
        this._state.tapTimer = undefined;
        handlers.onTap?.();
      }, DOUBLE_TAP_WINDOW_MS);
    };

    return {
      "@pointerdown": (e) => {
        this.cancel();
        this._state.held = false;
        this._state.startX = e.clientX;
        this._state.startY = e.clientY;
        if (!handlers.onHold) return;
        handlers.onPressChange?.(true);
        this._attachScrollGuard(() => {
          if (this._state.holdTimer !== undefined) window.clearTimeout(this._state.holdTimer);
          this._state.holdTimer = undefined;
          handlers.onPressChange?.(false);
        });
        this._state.holdTimer = window.setTimeout(() => {
          this._state.holdTimer = undefined;
          this._state.held = true;
          handlers.onPressChange?.(false);
          navigator.vibrate?.(15);
          handlers.onHold?.();
        }, HOLD_MS);
      },
      "@pointermove": (e) => {
        if (this._state.holdTimer === undefined) return;
        const dx = Math.abs(e.clientX - this._state.startX);
        const dy = Math.abs(e.clientY - this._state.startY);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
          window.clearTimeout(this._state.holdTimer);
          this._state.holdTimer = undefined;
          this._detachScrollGuard();
          handlers.onPressChange?.(false);
        }
      },
      "@pointerup": (e) => {
        this._detachScrollGuard();
        handlers.onPressChange?.(false);
        if (this._state.holdTimer !== undefined) {
          window.clearTimeout(this._state.holdTimer);
          this._state.holdTimer = undefined;
        }
        if (this._state.held) {
          this._state.held = false;
          e.preventDefault();
          return;
        }
        resolveTap();
      },
      "@pointercancel": () => {
        this.cancel();
        this._state.held = false;
        handlers.onPressChange?.(false);
      },
      // A hold is meant to trigger onHold, not the browser's own long-press
      // context menu racing it.
      "@contextmenu": (e) => {
        if (handlers.onHold) e.preventDefault();
      },
      "@keydown": activateOnKey(() => handlers.onTap?.()),
    };
  }
}
