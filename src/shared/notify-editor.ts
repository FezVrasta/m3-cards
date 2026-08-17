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
  /**
   * Master switch. Off by default — a card must never start notifying just
   * because a target was picked while exploring the editor.
   */
  notify_enabled?: boolean;
  notify_service?: string[];
  /** Free-text overrides; empty falls back to the card's built-in wording. */
  notify_title?: string;
  notify_message?: string;
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

export function notifyTitleSchema(name = "notify_title"): SchemaEntry {
  return { name, selector: { text: {} } };
}

export function notifyMessageSchema(name = "notify_message"): SchemaEntry {
  return { name, selector: { text: { multiline: true } } };
}

/** Placeholder name → the Jinja expression it expands to. */
export type NotifyTokens = Record<string, string>;

// Expands `{platzhalter}` in a user-written text. The card's own default is
// returned untouched — it already contains Jinja, and running it through the
// same replace could mangle an expression like `{{ d }}`.
// Unknown placeholders are left visible rather than silently dropped, so a
// typo shows up in the notification instead of vanishing.
export function applyNotifyTemplate(
  custom: string | undefined,
  fallback: string,
  tokens: NotifyTokens,
): string {
  if (!custom || !custom.trim()) return fallback;
  return custom.replace(/\{(\w+)\}/g, (whole, key: string) => tokens[key] ?? whole);
}

// Renders the "available placeholders" hint under the free-text fields.
export function notifyTokenHint(language: string, tokens: string[]): string {
  return `${localize("editor_notify_tokens", language)} ${tokens.map((t) => `{${t}}`).join(", ")}`;
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

  .notify-toggle-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .notify-toggle-label {
    font-size: 14px;
    color: var(--primary-text-color);
  }

  .notify-state {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    padding: 8px 12px;
    border-radius: 8px;
  }

  .notify-state ha-icon {
    --mdc-icon-size: 18px;
  }

  .notify-state.active {
    background: color-mix(in srgb, var(--success-color, #4caf50) 14%, transparent);
    color: var(--success-color, #4caf50);
  }

  .notify-state.inactive {
    background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
    color: var(--secondary-text-color, var(--primary-text-color));
  }

  .notify-blocked {
    font-size: 13px;
    color: var(--warning-color, #ffa726);
  }
`;

// ---- automation plumbing --------------------------------------------

export type MeterCycle = "daily" | "weekly" | "monthly" | "other";

// Verified against a live HA 2026.8 instance: `utility_meter` entities do NOT
// publish `meter_period` (or `cron_pattern`) as an attribute — only
// `last_reset` / `next_reset`. Checking `meter_period` therefore never matches
// and silently disables anything gated on it, so the cycle is derived from the
// distance between the two resets instead. Bands are wide enough for DST
// shifts and for months of differing length.
export function meterCycle(hass: HomeAssistant | undefined, entityId: string): MeterCycle {
  const attrs = hass?.states[entityId]?.attributes ?? {};
  const last = Date.parse(String(attrs.last_reset ?? ""));
  const next = Date.parse(String(attrs.next_reset ?? ""));
  // A meter that has never rolled over yet has no next_reset — unverifiable.
  if (Number.isNaN(last) || Number.isNaN(next) || next <= last) return "other";
  const days = (next - last) / 86_400_000;
  if (days >= 0.9 && days <= 1.1) return "daily";
  if (days >= 6.9 && days <= 7.1) return "weekly";
  if (days >= 27 && days <= 32) return "monthly";
  return "other";
}

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

export interface NotifyTextOverrides {
  title?: string;
  message?: string;
  /** Placeholders the user may use in the custom texts. */
  tokens?: NotifyTokens;
}

export function notifyActions(
  targets: string[],
  title: string,
  message: string,
  overrides?: NotifyTextOverrides,
): Record<string, unknown>[] {
  const tokens = overrides?.tokens ?? {};
  const finalTitle = applyNotifyTemplate(overrides?.title, title, tokens);
  const finalMessage = applyNotifyTemplate(overrides?.message, message, tokens);
  return targets.map((target) => ({
    action: `notify.${target}`,
    data: { title: finalTitle, message: finalMessage },
  }));
}

export async function saveNotifyAutomation(
  hass: HomeAssistant,
  spec: NotifyAutomationSpec,
): Promise<void> {
  const { id, ...body } = spec;
  await hass.callApi("POST", `config/automation/config/${id}`, body);
}

export type AutomationStatus = "missing" | "on" | "off";

// An automation's config id and its entity_id are different things; the
// registry links them via unique_id.
function automationEntityId(hass: HomeAssistant | undefined, automationId: string): string | undefined {
  if (!hass || !automationId) return undefined;
  return Object.keys(hass.states).find(
    (id) => id.startsWith("automation.") && hass.states[id].attributes.id === automationId,
  );
}

// Reads the real state rather than trusting the config flag, so the editor
// can't claim a notification is active after the automation was deleted or
// switched off elsewhere.
export function automationStatus(
  hass: HomeAssistant | undefined,
  automationId: string | undefined,
): AutomationStatus {
  if (!automationId) return "missing";
  const entityId = automationEntityId(hass, automationId);
  if (!entityId) return "missing";
  return hass!.states[entityId].state === "on" ? "on" : "off";
}

export async function setAutomationEnabled(
  hass: HomeAssistant,
  automationId: string,
  enabled: boolean,
): Promise<void> {
  const entityId = automationEntityId(hass, automationId);
  if (!entityId) return;
  await hass.callService("automation", enabled ? "turn_on" : "turn_off", {}, { entity_id: entityId });
}

export interface NotifyControlsOptions {
  hass: HomeAssistant | undefined;
  language: string;
  enabled: boolean;
  automationId?: string;
  busy: boolean;
  status: NotifyStatus;
  detail?: string;
  successText?: string;
  /** Why the notification can't be switched on yet; also disables the toggle. */
  blockedReason?: string;
  onToggle: (enabled: boolean) => void;
  onSetup: () => void;
}

// The whole control block: master toggle, a live status line reflecting the
// actual automation, and an update button once it exists. Cards render this
// instead of assembling their own, so on/off reads identically everywhere.
export function renderNotifyControls(options: NotifyControlsOptions): TemplateResult {
  const t = (key: TranslationKey) => localize(key, options.language);
  const live = automationStatus(options.hass, options.automationId);
  const blocked = !!options.blockedReason;
  return html`
    <div class="notify-toggle-row">
      <ha-switch
        .checked=${options.enabled}
        .disabled=${blocked || options.busy}
        @change=${(e: Event) => options.onToggle((e.target as HTMLInputElement).checked)}
      ></ha-switch>
      <span class="notify-toggle-label">${t("editor_notify_enabled")}</span>
    </div>
    ${blocked ? html`<div class="notify-blocked">${options.blockedReason}</div>` : nothing}
    ${options.enabled && !blocked
      ? html`
          <div class="notify-state ${live === "on" ? "active" : "inactive"}">
            <ha-icon icon=${live === "on" ? "mdi:bell-ring-outline" : "mdi:bell-off-outline"}></ha-icon>
            <span>
              ${live === "on"
                ? t("editor_notify_state_active")
                : live === "off"
                  ? t("editor_notify_state_paused")
                  : t("editor_notify_state_missing")}
            </span>
          </div>
          <button class="notify-btn" ?disabled=${options.busy} @click=${options.onSetup}>
            <ha-icon icon="mdi:refresh"></ha-icon>
            ${t(live === "missing" ? "editor_notify_button" : "editor_notify_update")}
          </button>
        `
      : nothing}
    ${options.status === "success"
      ? html`<div class="notify-status success">
          ${options.successText ?? t("editor_notify_success")}
        </div>`
      : options.status === "error"
        ? html`<div class="notify-status error">${t("editor_notify_error")} ${options.detail ?? ""}</div>`
        : nothing}
  `;
}
