import { css, html, nothing, type TemplateResult } from "lit";
import { activateOnKey } from "./a11y";

// Shared header row used by the M3 data cards (energy, gauge): a 44px/16px
// squircle icon, a name + subtitle text block, and an optional right-aligned
// slot (e.g. the energy card's big "today" value).
export function renderCardHeader(params: {
  icon: string;
  name: string;
  subtitle: string;
  onClick?: (e: Event) => void;
  right?: TemplateResult;
}): TemplateResult {
  const interactive = !!params.onClick;
  return html`
    <div
      class="m3-header"
      role=${interactive ? "button" : nothing}
      tabindex=${interactive ? "0" : nothing}
      aria-label=${interactive ? params.name : nothing}
      @click=${params.onClick}
      @keydown=${interactive && params.onClick ? activateOnKey(params.onClick) : nothing}
    >
      <div class="m3-icon-swatch">
        <ha-icon icon=${params.icon}></ha-icon>
      </div>
      <div class="m3-text-block">
        <div class="m3-name">${params.name}</div>
        <div class="m3-subtitle">${params.subtitle}</div>
      </div>
      ${params.right ?? nothing}
    </div>
  `;
}

export const cardHeaderStyles = css`
  .m3-header {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
  }

  .m3-header:focus-visible {
    outline: 2px solid var(--m3p-icon-color, var(--primary-color));
    outline-offset: 2px;
    border-radius: 8px;
  }

  .m3-icon-swatch {
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

  .m3-icon-swatch ha-icon {
    --mdc-icon-size: 22px;
  }

  .m3-text-block {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .m3-name {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--m3p-text);
  }

  .m3-subtitle {
    font-size: 12px;
    opacity: 0.65;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--m3p-secondary-text);
  }
`;
