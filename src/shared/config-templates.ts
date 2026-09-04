import { isTemplate, TemplateSubManager, type TemplateSubscription } from "./template-sub";
import type { HomeAssistant } from "../types";

// Finds the Jinja2 templates a card's author wrote into its *own* config, keeps
// them subscribed, and puts the rendered values back in. No element in here —
// `TemplatedCard` in templated-card.ts is the piece that hangs this off a card's
// update cycle.
//
// THE NESTED-CARD RULE
//
// A card config is not a leaf. It can carry other cards inside it: `cards` on
// the group and room cards, `content` under a popup action, mushroom chips or
// badges someone dropped into a slot. Those configs belong to the inner card,
// which is handed them verbatim and does its own thing with them — a mushroom
// card, for one, renders templates itself, and it renders them *live*.
//
// Resolving them here would replace a live template with the one string it
// happened to render to at the moment this card's config was walked, and the
// inner card would then have nothing left to subscribe to: a badge that used to
// follow a sensor would freeze at whatever it said when the view was opened.
//
// So the walk stops at any nested object that carries its own string `type`.
// That is what a Lovelace card config looks like, whatever card it is for, and
// it is the only marker available without a registry of every card in existence.
// The root config's `type` is of course its own — the walk starts inside it.

/** One templated string in a config, and where it sits. */
export interface ConfigTemplateRef {
  /** Object keys and array indices, from the root config down to the string. */
  readonly path: readonly (string | number)[];
  /** The Jinja2 source, verbatim — also the subscription's identity. */
  readonly template: string;
}

// A config nested twelve levels deep is a config that has gone wrong, and the
// limit is what keeps a hand-written cycle from walking forever.
const MAX_DEPTH = 12;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * This project's own uses of `type` for something that is not a card: a
 * power-list entity and a power-summary metric are each a `consumer` or a
 * `producer` (`PowerEntryType` in types.ts). Without this the walk would take
 * those entries for nested cards and skip the templates in their names.
 *
 * A new config field named `type` that is not a card type belongs in here.
 */
const NON_CARD_TYPES: ReadonlySet<string> = new Set(["consumer", "producer"]);

/** A nested Lovelace card config: it has a `type`, so it is not ours to touch. */
function isNestedCardConfig(value: unknown): boolean {
  return isPlainObject(value) && typeof value.type === "string" && !NON_CARD_TYPES.has(value.type);
}

/**
 * Every templated string the card owns, in walk order. Empty — the common case,
 * since most dashboards use no templates at all — means there is nothing to
 * subscribe to and nothing to substitute.
 */
export function collectConfigTemplates(config: unknown): ConfigTemplateRef[] {
  const found: ConfigTemplateRef[] = [];
  if (isPlainObject(config) || Array.isArray(config)) walk(config, [], found, 0);
  return found;
}

function walk(
  node: Record<string, unknown> | unknown[],
  path: readonly (string | number)[],
  found: ConfigTemplateRef[],
  depth: number,
): void {
  if (depth > MAX_DEPTH) return;

  const entries: [string | number, unknown][] = Array.isArray(node)
    ? node.map((value, index) => [index, value])
    : Object.entries(node);

  for (const [key, value] of entries) {
    if (typeof value === "string") {
      if (isTemplate(value)) found.push({ path: [...path, key], template: value });
      continue;
    }
    if (!isPlainObject(value) && !Array.isArray(value)) continue;
    if (isNestedCardConfig(value)) continue; // see THE NESTED-CARD RULE above
    walk(value, [...path, key], found, depth + 1);
  }
}

/**
 * The config as the author wrote it, with each collected template swapped for
 * what `render` says it currently says.
 *
 * Copy-on-write along the paths that changed: a branch with no template under
 * it comes back as the very same object. That matters beyond allocation — the
 * cards compare `_config` sub-objects by identity to decide whether to rebuild
 * their nested cards, so cloning the whole config on every pushed value would
 * tear those down and rebuild them several times a minute.
 */
export function applyConfigTemplates<T>(
  config: T,
  refs: readonly ConfigTemplateRef[],
  render: (template: string) => string,
): T {
  let resolved: unknown = config;
  for (const ref of refs) {
    resolved = replaceAt(resolved, ref.path, 0, render(ref.template));
  }
  return resolved as T;
}

function replaceAt(
  node: unknown,
  path: readonly (string | number)[],
  index: number,
  value: string,
): unknown {
  if (index >= path.length) return value;
  const key = path[index];

  if (Array.isArray(node) && typeof key === "number") {
    const copy = node.slice();
    copy[key] = replaceAt(node[key], path, index + 1, value);
    return copy;
  }
  if (isPlainObject(node) && typeof key === "string") {
    return { ...node, [key]: replaceAt(node[key], path, index + 1, value) };
  }
  // The config no longer has the shape the path was collected from. Nothing
  // sensible to write, so the config is handed back untouched rather than
  // grown a key nobody asked for.
  return node;
}

/**
 * Keeps one card's config resolved: collects the templates it holds, subscribes
 * to them, and hands back the config with the current values substituted in.
 *
 * Element-free on purpose, like the subscription manager it sits on — a Lit
 * element cannot be built in the Node environment the tests run in, and none of
 * the bookkeeping here needs one. `TemplatedCard` in templated-card.ts is the
 * thin piece that wires it to a card's update cycle.
 */
export class ConfigTemplateResolver {
  private refs: readonly ConfigTemplateRef[] = [];
  /** The config as the card's setConfig built it, templates unrendered. */
  private raw?: unknown;
  /** The resolved copy last handed back, so it is recognised when it returns. */
  private resolved?: unknown;
  private manager?: TemplateSubManager;
  private subs?: Map<string, TemplateSubscription>;
  /** A new config or a pushed value is waiting to be substituted in. */
  private dirty = false;
  /** The open subscriptions are out of step with the config's templates. */
  private pending = false;

  /** `onChange` is the card's requestUpdate — one call per pushed value. */
  constructor(private readonly onChange: () => void) {}

  /** True once a config with templates in it has been seen. */
  public get active(): boolean {
    return this.refs.length > 0;
  }

  /** The config as the author wrote it, templates unrendered. */
  public get rawConfig(): unknown {
    return this.raw;
  }

  /**
   * The config the card should render. The very object it was passed when there
   * is nothing to resolve — which is how a card that uses no templates pays
   * nothing beyond the two identity checks at the top.
   */
  public sync(config: unknown, hass: HomeAssistant | undefined): unknown {
    // Neither the config we were given nor the copy we handed back: the card's
    // setConfig has run with something new.
    if (config !== this.raw && config !== this.resolved) {
      this.raw = config;
      this.resolved = undefined;
      this.refs = collectConfigTemplates(config);
      this.dirty = this.refs.length > 0;
      this.pending = this.refs.length > 0;
      // Editing the last template out of a config closes its subscriptions.
      if (!this.refs.length) this.close();
    }

    if (!this.refs.length) return config;

    const manager = this.open(hass);
    if (manager) {
      // HA hands the card a new hass object on every state change; only the
      // connection on it matters, and the subscriptions survive the swap.
      manager.updateHass(hass);
      if (this.pending) {
        this.pending = false;
        this.subscribe(manager);
      }
    }

    if (this.dirty) {
      this.dirty = false;
      const subs = this.subs;
      this.resolved = applyConfigTemplates(
        this.raw,
        this.refs,
        // A template that has not been rendered yet reads empty, the same as it
        // does on the nav card: the card draws its "no value" state for the few
        // milliseconds before the first push, rather than the Jinja source.
        (template) => subs?.get(template)?.value ?? "",
      );
    }
    return this.resolved ?? config;
  }

  /**
   * Drops every subscription. The last resolved config is kept, so a card put
   * away in Home Assistant's view cache and brought back shows its last known
   * values instead of blanking while the first push is in flight.
   */
  public close(): void {
    this.subs?.clear();
    this.manager?.disconnect();
    this.manager = undefined;
    this.pending = this.refs.length > 0;
  }

  private open(hass: HomeAssistant | undefined): TemplateSubManager | undefined {
    if (this.manager) return this.manager;
    // Before the websocket is on the object there is nothing to subscribe
    // through, and a manager built now would hold a connection-less hass.
    if (!(hass as unknown as { connection?: unknown } | undefined)?.connection) return undefined;
    this.manager = new TemplateSubManager(hass, () => {
      this.dirty = true;
      this.onChange();
    });
    this.pending = true;
    return this.manager;
  }

  /**
   * One subscription per distinct template, and none for the ones the config no
   * longer names. Runs on a config change, not on a render: a card re-renders
   * on every state tick in the system, and re-subscribing there would tear down
   * and rebuild the subscriptions several times a second.
   */
  private subscribe(manager: TemplateSubManager): void {
    const subs = (this.subs ??= new Map<string, TemplateSubscription>());
    const wanted = new Set(this.refs.map((ref) => ref.template));

    for (const [template, sub] of subs) {
      if (wanted.has(template)) continue;
      sub.unsubscribe();
      subs.delete(template);
    }
    for (const template of wanted) {
      // The manager de-duplicates, so the same string behind two fields costs
      // one subscription.
      if (!subs.has(template)) subs.set(template, manager.subscribe(template));
    }
  }
}
