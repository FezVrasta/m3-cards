// Dashboard-wide swipe plugins (hass-swipe-navigation and friends) listen for
// touch and mouse drags on an ancestor of the card, in the bubble phase. A
// drag on a slider/wheel is setting a value, never navigation, so it must be
// kept from reaching them — a flick with any sideways drift would otherwise
// change the view out from under the value being set. Verified against
// hass-swipe-navigation 1.16.0: its listeners sit on haAppLayout with no
// capture flag, so stopping propagation in the bubble phase is enough.
//
// Wire on any draggable control as:
//   @touchstart=${stopSwipe} @touchmove=${stopSwipe}
//   @mousedown=${stopSwipe}  @mousemove=${stopSwipe}
// Note: touch-action:none only stops the browser's own panning, not these
// JS listeners — this is the piece that actually shields the plugin.
export function stopSwipe(e: Event): void {
  e.stopPropagation();
}
