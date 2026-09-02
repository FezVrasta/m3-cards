// Dashboard-wide swipe plugins (hass-swipe-navigation and friends) listen for
// touch and mouse drags on an ancestor of the card, in the bubble phase. A
// drag on a slider/wheel is setting a value, never navigation, so it must be
// kept from reaching them — a flick with any sideways drift would otherwise
// change the view out from under the value being set. Verified against
// hass-swipe-navigation 1.16.0: its listeners sit on haAppLayout with no
// capture flag, so stopping propagation in the bubble phase is enough.
//
// Wire on any draggable control as:
//   @touchstart=${stopSwipe} @touchmove=${stopSwipe} @touchend=${stopSwipe}
//   @mousedown=${stopSwipe}  @mousemove=${stopSwipe} @mouseup=${stopSwipe}
// Note: touch-action:none only stops the browser's own panning, not these
// JS listeners — this is the piece that actually shields the plugin.
//
// Shield the whole gesture, not just its start. The plugin decides on touchend,
// and that handler reads no event: it acts on the start and movement it recorded
// before. Swallow the start and let the end through and it decides using
// whatever it last recorded somewhere else on the page — which is worse than not
// shielding it at all, because the gesture it acts on is one the user never made
// here.
export function stopSwipe(e: Event): void {
  e.stopPropagation();
}
