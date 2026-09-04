import { html, css, nothing } from "lit";
import { stampVersion } from "./config-migration";
import { localize } from "../localize";
import { THEME_COLOR_TOKENS } from "../const";

export interface SchemaEntry {
  name: string;
  selector: Record<string, unknown>;
  required?: boolean;
  default?: unknown;
}

// The version stamp belongs on the way out of an editor, because that is the
// only path that writes a config back to the dashboard. Stamping in a card's
// setConfig — as this used to — only ever touched the in-memory copy and never
// reached stored YAML, so no config ever carried the field.
function stampConfigDetail(detail: unknown): unknown {
  if (!detail || typeof detail !== "object") return detail;
  const d = detail as { config?: unknown };
  if (!d.config || typeof d.config !== "object") return detail;
  return { ...d, config: stampVersion(d.config as { card_version?: string }) };
}

export function fireEvent(node: HTMLElement, type: string, detail: unknown): void {
  const event = new CustomEvent(type, {
    detail: type === "config-changed" ? stampConfigDetail(detail) : detail,
    bubbles: true,
    composed: true,
  });
  node.dispatchEvent(event);
}

export interface ColorOpacityOption {
  label: string;
  value: number | undefined;
  defaultValue: number;
  onChange: (value: number) => void;
}

// A standalone 0-100 intensity slider, used either on its own (e.g. one
// slider governing several background-tint sites at once) or embedded in
// colorRow via its `opacity` option (a slider tied to one specific color).
export function opacityRow(
  label: string,
  value: number | undefined,
  defaultValue: number,
  onChange: (value: number) => void,
) {
  const current = value ?? defaultValue;
  return html`
    <div class="opacity-row">
      <span class="opacity-label">${label}</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        .value=${String(current)}
        @input=${(e: Event) => onChange(Number((e.target as HTMLInputElement).value))}
      />
      <span class="opacity-value">${current}%</span>
    </div>
  `;
}

// A free-text color field with a live swatch preview, used for every
// optional color override across the M3 card editors (not an ha-form
// selector, since these accept HA color tokens, hex, or any CSS color).
// Pass `opacity` when this color is used as a `color-mix(...)` background
// tint somewhere in the card, to expose a strength slider alongside it.
export function colorRow(
  label: string,
  value: string | undefined,
  onChange: (value: string) => void,
  opacity?: ColorOpacityOption,
) {
  // The native swatch only understands a hex, so a named token is resolved to
  // one for it — otherwise picking "red" left the swatch showing grey. Taken
  // from the button card's own copy of this row, which is being deleted in
  // favour of this one.
  const token = value ? THEME_COLOR_TOKENS[value] : undefined;
  const hexValue = /^#[0-9a-fA-F]{6}$/.test(value ?? "")
    ? (value as string)
    : token && /^#[0-9a-fA-F]{6}$/.test(token)
      ? token
      : "#888888";
  // Every card resolves a colour through the same token list, so "primary" has
  // always meant "whatever the theme's accent is" — under Material You, the
  // tone generated from the wallpaper. Nobody would guess to type it into a
  // free-text field, though, which is why it needed a button of its own.
  // Clicking it again clears the field, which puts the card back on its own
  // default rather than on a colour the theme picked.
  const themeToken = value === "primary" || value === "accent";
  return html`
    <div class="color-row">
      <label class="color-label">${label}</label>
      <input
        type="text"
        class="color-text"
        .value=${value ?? ""}
        placeholder="z.B. red oder #6ba7dc"
        @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)}
      />
      <input
        type="color"
        class="swatch"
        .value=${hexValue}
        @input=${(e: Event) => onChange((e.target as HTMLInputElement).value)}
      />
      <button
        type="button"
        class="theme-color ${themeToken ? "active" : ""}"
        title=${localize(
          "editor_use_theme_color",
          document.documentElement.lang,
        )}
        aria-pressed=${themeToken ? "true" : "false"}
        @click=${() => onChange(themeToken ? "" : "primary")}
      >
        <ha-icon icon="mdi:palette-swatch-outline"></ha-icon>
      </button>
      ${opacity ? opacityRow(opacity.label, opacity.value, opacity.defaultValue, opacity.onChange) : nothing}
    </div>
  `;
}

// A comma-separated free-text list field (e.g. status-mapping values).
export function listRow(
  label: string,
  values: string[],
  onChange: (values: string[]) => void,
) {
  return html`
    <div class="color-row">
      <label class="color-label">${label}</label>
      <input
        type="text"
        class="color-text list-input"
        .value=${values.join(", ")}
        @input=${(e: Event) => {
          const raw = (e.target as HTMLInputElement).value;
          const parsed = raw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          onChange(parsed);
        }}
      />
    </div>
  `;
}

// Shared editor chrome: expansion-panel spacing, ha-form block display,
// hint text, and the color-row/list-row input styling above.
export const editorStyles = css`
  /* A hint that is a caution rather than an explanation. */
  .hint.warn {
    color: var(--error-color, #e57368);
    opacity: 0.9;
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  ha-expansion-panel {
    border-radius: 12px;
    --expansion-panel-summary-padding: 0 8px;
    --ha-card-border-radius: 12px;
  }

  .panel-content {
    padding: 12px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  ha-form {
    display: block;
  }

  .hint {
    font-size: 12px;
    opacity: 0.6;
    color: var(--primary-text-color);
  }

  .color-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
  }

  .color-label {
    flex-basis: 100%;
    font-size: 13px;
    color: var(--secondary-text-color, var(--primary-text-color));
  }

  .color-text {
    flex: 1;
    min-width: 120px;
    height: 40px;
    box-sizing: border-box;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid rgba(127, 127, 127, 0.4);
    background: transparent;
    color: var(--primary-text-color);
    font-size: 14px;
    font-family: inherit;
  }

  .list-input {
    min-width: 100%;
  }

  .swatch {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 8px;
    padding: 0;
    background: none;
    cursor: pointer;
  }

  .theme-color {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid rgba(127, 127, 127, 0.4);
    background: transparent;
    color: var(--secondary-text-color, var(--primary-text-color));
    cursor: pointer;
    --mdc-icon-size: 20px;
  }

  /* Pressed, not merely hovered: the button reports whether the colour is the
     theme's, so it has to look different while it is. */
  .theme-color.active {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .opacity-row {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .opacity-label {
    flex-shrink: 0;
    min-width: 90px;
    font-size: 12px;
    color: var(--secondary-text-color, var(--primary-text-color));
    opacity: 0.7;
  }

  .opacity-row input[type="range"] {
    flex: 1;
    accent-color: var(--primary-color);
  }

  .opacity-value {
    flex-shrink: 0;
    min-width: 32px;
    text-align: right;
    font-size: 12px;
    color: var(--secondary-text-color, var(--primary-text-color));
  }
`;
