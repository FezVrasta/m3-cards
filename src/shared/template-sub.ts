import type { HomeAssistant } from "../types";

// Live Jinja2 values for a card, over Home Assistant's `render_template`
// websocket subscription.
//
// This is not the one-shot evaluator an automation uses. That one is asked a
// question and answers once; this one is a subscription — the backend re-renders
// and pushes a new value whenever anything the template reads changes, which is
// what makes a templated badge or name update without the card polling anything.
// The two are easy to confuse, and the difference matters: the limitations noted
// elsewhere in this project about templates in *automations* do not apply here.
//
// The manager exists rather than a bare `subscribeMessage` call per field
// because a nav bar can hold a dozen templated fields, several of them the same
// string ("is anyone home?" behind two different badges). One subscription per
// unique template, ref-counted, is the difference between one websocket
// subscription and twelve.

/** A caller's handle on one template. `value` updates in place. */
export interface TemplateSubscription {
  readonly value: string;
  unsubscribe(): void;
}

interface Entry {
  refs: number;
  value: string;
  /** Resolves once HA has accepted the subscription; undefined until then. */
  stop?: () => void;
  /** Set when the subscription was torn down while still connecting. */
  cancelled?: boolean;
}

/** Cheap pre-filter: only a string that could be Jinja is worth a round-trip. */
export function isTemplate(value: string | undefined): boolean {
  return !!value && (value.includes("{{") || value.includes("{%"));
}

/**
 * A rendered template read as a boolean, for `hidden` / `disabled` / `show_if`.
 *
 * Home Assistant renders a boolean template to the strings "True"/"False" (its
 * Python repr), and people also write templates that produce "on"/"off" or
 * "1"/"0". All of them mean the same thing here, and anything else — including
 * the error text HA returns for a broken template — is false, so a typo hides
 * nothing rather than silently emptying the whole bar.
 */
export function templateTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "on" || v === "yes" || v === "1";
}

export class TemplateSubManager {
  private readonly entries = new Map<string, Entry>();
  private hass?: HomeAssistant;

  /** `onUpdate` is the card's requestUpdate — one per pushed value. */
  constructor(
    hass: HomeAssistant | undefined,
    private readonly onUpdate: () => void,
  ) {
    this.hass = hass;
  }

  /**
   * Home Assistant hands the card a new `hass` object on every state change, and
   * only the connection on it matters here. Subscriptions survive that, so this
   * only stores the newest one for templates subscribed later.
   */
  updateHass(hass: HomeAssistant | undefined): void {
    this.hass = hass;
  }

  subscribe(template: string): TemplateSubscription {
    let entry = this.entries.get(template);
    if (!entry) {
      entry = { refs: 0, value: "" };
      this.entries.set(template, entry);
      this.open(template, entry);
    }
    entry.refs++;

    let released = false;
    return {
      get value(): string {
        return entry!.value;
      },
      unsubscribe: () => {
        // A caller that releases twice must not take someone else's reference
        // with it.
        if (released) return;
        released = true;
        entry!.refs--;
        if (entry!.refs <= 0) this.close(template);
      },
    };
  }

  /** Drops every subscription. Call from the card's disconnectedCallback. */
  disconnect(): void {
    for (const template of [...this.entries.keys()]) this.close(template);
  }

  private open(template: string, entry: Entry): void {
    const connection = (
      this.hass as unknown as {
        connection?: {
          subscribeMessage: (
            cb: (msg: { result?: unknown; error?: unknown }) => void,
            payload: Record<string, unknown>,
          ) => Promise<() => void>;
        };
      }
    )?.connection;
    if (!connection?.subscribeMessage) return;

    connection
      .subscribeMessage(
        (msg) => {
          // HA sends `result` on success. An error arrives as a message too, and
          // is shown as-is: a card cannot tell a broken template from one that
          // legitimately renders the word "error", and quietly blanking the
          // field would hide the typo instead of surfacing it.
          const next =
            msg.result !== undefined && msg.result !== null
              ? String(msg.result)
              : msg.error !== undefined
                ? String(msg.error)
                : "";
          if (next === entry.value) return;
          entry.value = next;
          this.onUpdate();
        },
        { type: "render_template", template, report_errors: false },
      )
      .then((stop) => {
        // Torn down before the subscription came back — close it immediately
        // rather than leaking one per removed card.
        if (entry.cancelled) {
          stop();
          return;
        }
        entry.stop = stop;
      })
      .catch(() => {
        // An unparseable template is rejected outright by HA. Nothing to render
        // and nothing to retry; leaving the value empty is the honest result.
        this.entries.delete(template);
      });
  }

  private close(template: string): void {
    const entry = this.entries.get(template);
    if (!entry) return;
    this.entries.delete(template);
    entry.cancelled = true;
    entry.stop?.();
  }
}
