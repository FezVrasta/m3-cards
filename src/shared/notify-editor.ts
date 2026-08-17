import { html, css, nothing, type TemplateResult } from "lit";
import type { HomeAssistant } from "../types";
import type { SchemaEntry } from "./editor-helpers";
import { localize, type TranslationKey } from "../localize";

// Several cards can create a Home Assistant automation straight from their
// editor ("notify me when the washing machine is done / a battery is empty /
// the month is over"). The mechanics are identical every time — build the
// target list from the service registry, render a button with a status line,
// POST the automation — while the interesting part (what triggers it and what
// it says) is card-specific. This module owns the shared half; each card
// supplies its own triggers/conditions/message.

export type NotifyStatus = "idle" | "success" | "error";

// Config fields every notify-capable card carries. Cards spread this into
// their own config interface rather than nesting, so YAML stays flat.
export interface NotifyConfigBase {
  notify_service?: string[];
  notify_mode?: string;
  notify_time?: string;
  notify_weekday?: string;
  /**
   * Generated on first setup and written back into the card config, so
   * re-running updates the same automation. Deriving the id from the card
   * name instead would collide between two same-named cards.
   */
  notify_automation_id?: string;
}

// ---- schema building blocks -----------------------------------------

// Built from the live service registry so every target the user actually has
// (mobile app, persistent notification, custom notify groups) shows up
// without the card knowing about it.
export function notifyServiceSchema(
  hass: HomeAssistant | undefined,
  name = "notify_service",
): SchemaEntry {
  const options = Object.keys(hass?.services?.notify ?? {})
    .filter((service) => service !== "send_message")
    .sort()
    .map((service) => ({
      value: service,
      label: service.startsWith("mobile_app_")
        ? service.slice("mobile_app_".length).replace(/_/g, " ")
        : service.replace(/_/g, " "),
    }));
  return { name, selector: { select: { mode: "dropdown", multiple: true, options } } };
}

export function notifyModeSchema(
  options: { value: string; label: string }[],
  name = "notify_mode",
): SchemaEntry {
  return { name, selector: { select: { mode: "dropdown", options } } };
}

export function notifyTimeSchema(name = "notify_time"): SchemaEntry {
  return { name, selector: { time: {} } };
}

const WEEKDAY_KEYS: [string, TranslationKey][] = [
  ["mon", "notify_weekday_mon"],
  ["tue", "notify_weekday_tue"],
  ["wed", "notify_weekday_wed"],
  ["thu", "notify_weekday_thu"],
  ["fri", "notify_weekday_fri"],
  ["sat", "notify_weekday_sat"],
  ["sun", "notify_weekday_sun"],
];

export function notifyWeekdaySchema(language: string, name = "notify_weekday"): SchemaEntry {
  return {
    name,
    selector: {
      select: {
        mode: "dropdown",
        options: WEEKDAY_KEYS.map(([value, key]) => ({ value, label: localize(key, language) })),
      },
    },
  };
}

// ---- button + status ------------------------------------------------

export interface NotifyButtonOptions {
  language: string;
  busy: boolean;
  disabled: boolean;
  status: NotifyStatus;
  /** Free-form success text; falls back to a generic "created" message. */
  successText?: string;
  /** Appended after the generic error prefix — usually the caught message. */
  detail?: string;
  labelKey?: TranslationKey;
  onClick: () => void;
}

export function renderNotifyButton(options: NotifyButtonOptions): TemplateResult {
  const t = (key: TranslationKey) => localize(key, options.language);
  return html`
    <button
      class="notify-btn"
      ?disabled=${options.busy || options.disabled}
      @click=${options.onClick}
    >
      <ha-icon icon="mdi:bell-plus-outline"></ha-icon>
      ${t(options.labelKey ?? "editor_notify_button")}
    </button>
    ${options.status === "success"
      ? html`<div class="notify-status success">
          ${options.successText ?? t("editor_notify_success")}
        </div>`
      : options.status === "error"
        ? html`<div class="notify-status error">
            ${t("editor_notify_error")} ${options.detail ?? ""}
          </div>`
        : nothing}
  `;
}

export const notifyStyles = css`
  .notify-btn {
    width: 100%;
    height: 40px;
    border: none;
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    color: var(--primary-text-color);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 14px;
    font-family: inherit;
  }

  .notify-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .notify-status {
    font-size: 13px;
  }

  .notify-status.success {
    color: var(--success-color, #4caf50);
  }

  .notify-status.error {
    color: var(--error-color, #db4437);
  }
`;

// ---- automation plumbing --------------------------------------------

export interface NotifyAutomationSpec {
  id: string;
  alias: string;
  description: string;
  /** HA automation run mode — "single" unless a card needs queueing. */
  mode?: "single" | "restart" | "queued" | "parallel";
  variables?: Record<string, string>;
  triggers: Record<string, unknown>[];
  conditions?: Record<string, unknown>[];
  actions: Record<string, unknown>[];
}

export function slugifyForId(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "card"
  );
}

// Resolves the automation id to write to: a previously stored one wins so
// re-running updates in place, otherwise a fresh random id is minted (the
// caller is expected to persist it back into the card config).
export function resolveAutomationId(kind: string, stored?: string): string {
  if (stored) return stored;
  const suffix = Math.random().toString(36).slice(2, 10);
  return `m3_${slugifyForId(kind)}_${suffix}`;
}

export function notifyActions(
  targets: string[],
  title: string,
  message: string,
): Record<string, unknown>[] {
  return targets.map((target) => ({
    action: `notify.${target}`,
    data: { title, message },
  }));
}

export async function saveNotifyAutomation(
  hass: HomeAssistant,
  spec: NotifyAutomationSpec,
): Promise<void> {
  const { id, ...body } = spec;
  await hass.callApi("POST", `config/automation/config/${id}`, body);
}
