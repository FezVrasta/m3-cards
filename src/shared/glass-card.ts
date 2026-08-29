import { css, html, type TemplateResult } from "lit";

// Shared M3 card frame: the "glass" translucent/blurred background used by
// every card in this project, plus the "solid" theme-background fallback.
// Cards import this once instead of redefining ha-card/.card-inner rules.
// The frosted-glass surface, as one value so the three cards that build their
// own card CSS (button, climate, climate-mini) cannot drift from it.
//
// Mixed from the card *surface* colour, not the text colour. HA already hands
// every card theme-correct variables — the surface is light in a light theme
// and dark in a dark one — so tinting with it is self-correcting and needs no
// theme detection. Tinting with the text colour, as this did before, inverts
// that: in a light theme it darkened the backdrop that dark text then had to
// sit on, which made every card unreadable over a dark dashboard wallpaper.
//
// 55% keeps the backdrop visible through the blur while still establishing a
// ground of its own, so legibility no longer depends on what is behind the
// dashboard — something the card cannot see.
export const glassBackground = css`color-mix(
  in srgb,
  var(--ha-card-background, var(--card-background-color)) 55%,
  transparent
)`;

export const glassCardStyles = css`
  :host {
    display: block;
    height: 100%;
  }

  ha-card {
    height: 100%;
    overflow: hidden;
    box-shadow: none;
    background: transparent;
  }

  .card-inner {
    box-sizing: border-box;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border: 1px solid rgba(100, 100, 100, 0.25);
  }

  .card-inner.glass {
    background: ${glassBackground};
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    /* Forces its own compositor layer. Without this, Chromium sometimes
       renders a visible seam where two adjacent backdrop-filter elements'
       GPU tiles meet (flickers/disappears on scroll-triggered repaint) —
       a known browser tiling bug, not a layout issue on our end. */
    transform: translateZ(0);
    isolation: isolate;
  }

  .card-inner.solid {
    background: var(--ha-card-background, var(--card-background-color));
  }

  .missing-entity {
    padding: 16px;
    color: var(--error-color, red);
    font-size: 14px;
  }
`;

// Resolves the "glass" vs "solid" class from a card config's
// glass_background option (defaults to glass, matching every card so far).
export function glassCardClass(glassBackground: boolean | undefined): string {
  return glassBackground === false ? "solid" : "glass";
}

// Standard "entity not found" fallback, used identically by every card when
// its configured entity is missing from hass.states.
export function renderMissingEntity(entityId: string): TemplateResult {
  return html`
    <ha-card>
      <div class="card-inner glass">
        <div class="missing-entity">${entityId}: entity not found</div>
      </div>
    </ha-card>
  `;
}
