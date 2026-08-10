import { html, css } from "lit";

export interface SchemaEntry {
  name: string;
  selector: Record<string, unknown>;
  required?: boolean;
  default?: unknown;
}

export function fireEvent(node: HTMLElement, type: string, detail: unknown): void {
  const event = new CustomEvent(type, {
    detail,
    bubbles: true,
    composed: true,
  });
  node.dispatchEvent(event);
}

// A free-text color field with a live swatch preview, used for every
// optional color override across the M3 card editors (not an ha-form
// selector, since these accept HA color tokens, hex, or any CSS color).
export function colorRow(
  label: string,
  value: string | undefined,
  onChange: (value: string) => void,
) {
  const hexValue = /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : "#888888";
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
`;
