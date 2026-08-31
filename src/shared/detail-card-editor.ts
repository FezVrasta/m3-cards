import { html } from "lit";
import type { HomeAssistant } from "../types";

// Raw card-config editing has no ha-form selector equivalent, so this is the
// first place in the codebase reaching for HA's own <ha-yaml-editor> — a
// standard element the HA frontend runtime always provides, same "reuse HA's
// building blocks" principle as ha-form/ha-expansion-panel elsewhere.
export function renderDetailCardField(params: {
  hass?: HomeAssistant;
  value: Record<string, unknown> | undefined;
  label: string;
  hint: string;
  onChange: (value: Record<string, unknown> | undefined) => void;
}) {
  const { hass, value, label, hint, onChange } = params;
  return html`
    <ha-yaml-editor
      .hass=${hass}
      .label=${label}
      .defaultValue=${value}
      @value-changed=${(ev: CustomEvent) => {
        const detail = ev.detail as { value?: unknown; isValid?: boolean };
        if (detail.isValid === false) return;
        const v = detail.value;
        onChange(v && typeof v === "object" && Object.keys(v).length ? (v as Record<string, unknown>) : undefined);
      }}
    ></ha-yaml-editor>
    <div class="hint">${hint}</div>
  `;
}
