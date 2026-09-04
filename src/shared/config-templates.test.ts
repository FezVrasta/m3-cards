import { describe, it, expect, vi } from "vitest";
import {
  applyConfigTemplates,
  collectConfigTemplates,
  ConfigTemplateResolver,
} from "./config-templates";
import type { HomeAssistant } from "../types";

const identity = (template: string): string => template;

describe("collectConfigTemplates", () => {
  it("finds a template in a top-level field", () => {
    expect(collectConfigTemplates({ type: "custom:m3-button-card", name: "{{ x }}" })).toEqual([
      { path: ["name"], template: "{{ x }}" },
    ]);
  });

  it("finds a statement block as well as an expression", () => {
    const found = collectConfigTemplates({ name: "{% if true %}a{% endif %}" });
    expect(found).toHaveLength(1);
  });

  it("ignores strings that are not templates", () => {
    expect(collectConfigTemplates({ name: "Kitchen", entity: "light.kitchen" })).toEqual([]);
  });

  it("walks plain nested objects and arrays", () => {
    expect(
      collectConfigTemplates({
        header: { title: "{{ a }}" },
        buttons: [{ name: "{{ b }}" }, { name: "plain" }],
        tags: ["{{ c }}", "plain"],
      }),
    ).toEqual([
      { path: ["header", "title"], template: "{{ a }}" },
      { path: ["buttons", 0, "name"], template: "{{ b }}" },
      { path: ["tags", 0], template: "{{ c }}" },
    ]);
  });

  it("does not descend into a nested object that carries its own type", () => {
    // The popup holds a whole other card. Rendering its template here would
    // bake the value it happens to have right now into a dead string, and the
    // inner card — which renders templates live itself — would never update.
    const found = collectConfigTemplates({
      type: "custom:m3-room-card",
      name: "{{ mine }}",
      tap_action: {
        action: "popup",
        popup: {
          content: {
            type: "custom:mushroom-template-card",
            primary: "{{ theirs }}",
          },
        },
      },
    });
    expect(found).toEqual([{ path: ["name"], template: "{{ mine }}" }]);
  });

  it("does not descend into nested card configs in an array", () => {
    const found = collectConfigTemplates({
      type: "custom:m3-group-card",
      title: "{{ mine }}",
      cards: [
        { type: "custom:mushroom-template-card", primary: "{{ theirs }}" },
        { type: "custom:m3-button-card", name: "{{ also_theirs }}" },
      ],
    });
    expect(found).toEqual([{ path: ["title"], template: "{{ mine }}" }]);
  });

  it("still walks the root config, whose own type is its own", () => {
    const found = collectConfigTemplates({ type: "custom:m3-button-card", icon: "{{ i }}" });
    expect(found).toEqual([{ path: ["icon"], template: "{{ i }}" }]);
  });

  it("descends into nested objects without a type", () => {
    const found = collectConfigTemplates({
      type: "custom:m3-nav-card",
      badge: { text: "{{ n }}" },
    });
    expect(found).toEqual([{ path: ["badge", "text"], template: "{{ n }}" }]);
  });

  it("still walks a power-list entry, whose type names a consumer, not a card", () => {
    const found = collectConfigTemplates({
      type: "custom:m3-power-list-card",
      entities: [{ entity: "sensor.washer", name: "{{ n }}", type: "producer" }],
    });
    expect(found).toEqual([{ path: ["entities", 0, "name"], template: "{{ n }}" }]);
  });

  it("ignores a non-string type, which is not a card config", () => {
    const found = collectConfigTemplates({ thresholds: { type: 3, label: "{{ l }}" } });
    expect(found).toEqual([{ path: ["thresholds", "label"], template: "{{ l }}" }]);
  });

  it("stops at a depth no real config reaches, so a cycle cannot hang the card", () => {
    const cyclic: Record<string, unknown> = { name: "{{ a }}" };
    cyclic.self = cyclic;
    expect(() => collectConfigTemplates(cyclic)).not.toThrow();
  });

  it("returns nothing for a non-config value", () => {
    expect(collectConfigTemplates(undefined)).toEqual([]);
    expect(collectConfigTemplates("{{ a }}")).toEqual([]);
  });
});

describe("applyConfigTemplates", () => {
  it("substitutes every template, each with its own value", () => {
    const config = {
      type: "custom:m3-button-card",
      name: "{{ a }}",
      icon: "{{ b }}",
      color: "{{ a }}",
    };
    const values: Record<string, string> = { "{{ a }}": "Kitchen", "{{ b }}": "mdi:lamp" };
    const resolved = applyConfigTemplates(config, collectConfigTemplates(config), (t) => values[t]);

    expect(resolved).toEqual({
      type: "custom:m3-button-card",
      name: "Kitchen",
      icon: "mdi:lamp",
      color: "Kitchen",
    });
  });

  it("round-trips templates in arrays and nested objects by path", () => {
    const config = {
      buttons: [{ name: "{{ a }}" }, { name: "{{ b }}" }],
      header: { title: "{{ c }}" },
    };
    const resolved = applyConfigTemplates(
      config,
      collectConfigTemplates(config),
      (t) => `<${t.replace(/[{}% ]/g, "")}>`,
    );

    expect(resolved).toEqual({
      buttons: [{ name: "<a>" }, { name: "<b>" }],
      header: { title: "<c>" },
    });
  });

  it("leaves the author's config untouched", () => {
    const config = { name: "{{ a }}" };
    const resolved = applyConfigTemplates(config, collectConfigTemplates(config), () => "Kitchen");

    expect(config.name).toBe("{{ a }}");
    expect(resolved).not.toBe(config);
  });

  it("keeps the identity of branches that hold no template", () => {
    // The cards decide whether to rebuild their nested cards by comparing these
    // by identity; a full clone would rebuild them on every pushed value.
    const config = {
      name: "{{ a }}",
      cards: [{ type: "custom:m3-button-card", entity: "light.kitchen" }],
    };
    const resolved = applyConfigTemplates(config, collectConfigTemplates(config), () => "Kitchen");

    expect(resolved.cards).toBe(config.cards);
  });

  it("returns the same object when there is nothing to substitute", () => {
    const config = { name: "Kitchen" };
    expect(applyConfigTemplates(config, collectConfigTemplates(config), identity)).toBe(config);
  });

  it("ignores a path the config no longer has", () => {
    const resolved = applyConfigTemplates(
      { name: "Kitchen" },
      [{ path: ["header", "title"], template: "{{ a }}" }],
      () => "x",
    );
    expect(resolved).toEqual({ name: "Kitchen" });
  });
});

/**
 * A hass with the one thing the resolver needs: a websocket that takes a
 * `render_template` subscription. `push` plays the part of Home Assistant
 * re-rendering a template because something it reads changed.
 */
function fakeHass(): {
  hass: HomeAssistant;
  templates: string[];
  push(template: string, result: string): void;
  stopped: string[];
} {
  const callbacks = new Map<string, (msg: { result?: unknown }) => void>();
  const templates: string[] = [];
  const stopped: string[] = [];

  const hass = {
    connection: {
      subscribeMessage: (
        cb: (msg: { result?: unknown }) => void,
        payload: { type: string; template: string },
      ) => {
        expect(payload.type).toBe("render_template");
        templates.push(payload.template);
        callbacks.set(payload.template, cb);
        return Promise.resolve(() => {
          stopped.push(payload.template);
          callbacks.delete(payload.template);
        });
      },
    },
  } as unknown as HomeAssistant;

  return {
    hass,
    templates,
    stopped,
    push: (template, result) => callbacks.get(template)?.({ result }),
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("ConfigTemplateResolver", () => {
  it("hands back the very same config, and opens nothing, when there are no templates", () => {
    const ha = fakeHass();
    const onChange = vi.fn();
    const config = { type: "custom:m3-button-card", name: "Kitchen" };

    const resolver = new ConfigTemplateResolver(onChange);
    expect(resolver.sync(config, ha.hass)).toBe(config);
    expect(resolver.sync(config, ha.hass)).toBe(config);

    expect(ha.templates).toEqual([]);
    expect(resolver.active).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("subscribes once per distinct template and substitutes what is pushed back", () => {
    const ha = fakeHass();
    const onChange = vi.fn();
    const config = {
      type: "custom:m3-button-card",
      name: "{{ a }}",
      icon: "{{ b }}",
      // The same string twice is one subscription, not two.
      color: "{{ a }}",
    };

    const resolver = new ConfigTemplateResolver(onChange);
    resolver.sync(config, ha.hass);
    expect(ha.templates).toEqual(["{{ a }}", "{{ b }}"]);

    ha.push("{{ a }}", "Kitchen");
    ha.push("{{ b }}", "mdi:lamp");
    expect(onChange).toHaveBeenCalled();

    expect(resolver.sync(config, ha.hass)).toEqual({
      type: "custom:m3-button-card",
      name: "Kitchen",
      icon: "mdi:lamp",
      color: "Kitchen",
    });
    expect(resolver.rawConfig).toBe(config);
  });

  it("recognises the config it handed back, and does not re-collect or re-subscribe", () => {
    const ha = fakeHass();
    const resolver = new ConfigTemplateResolver(() => {});
    const config = { name: "{{ a }}" };

    resolver.sync(config, ha.hass);
    ha.push("{{ a }}", "Kitchen");
    const resolved = resolver.sync(config, ha.hass);

    // What the card now holds, fed back in on the next render.
    expect(resolver.sync(resolved, ha.hass)).toBe(resolved);
    expect(ha.templates).toEqual(["{{ a }}"]);
    expect(resolver.rawConfig).toBe(config);
  });

  it("waits for a connection instead of subscribing against a hass that has none", () => {
    const ha = fakeHass();
    const resolver = new ConfigTemplateResolver(() => {});
    const config = { name: "{{ a }}" };

    resolver.sync(config, undefined);
    resolver.sync(config, {} as HomeAssistant);
    expect(ha.templates).toEqual([]);

    resolver.sync(config, ha.hass);
    expect(ha.templates).toEqual(["{{ a }}"]);
  });

  it("re-subscribes to what a new config asks for and drops the rest", async () => {
    const ha = fakeHass();
    const resolver = new ConfigTemplateResolver(() => {});

    resolver.sync({ name: "{{ a }}" }, ha.hass);
    resolver.sync({ name: "{{ b }}" }, ha.hass);
    await flush();

    expect(ha.templates).toEqual(["{{ a }}", "{{ b }}"]);
    expect(ha.stopped).toEqual(["{{ a }}"]);
  });

  it("closes every subscription on close, and keeps the last resolved config", async () => {
    const ha = fakeHass();
    const resolver = new ConfigTemplateResolver(() => {});
    const config = { name: "{{ a }}" };

    resolver.sync(config, ha.hass);
    ha.push("{{ a }}", "Kitchen");
    const resolved = resolver.sync(config, ha.hass);
    expect(resolved).toEqual({ name: "Kitchen" });

    resolver.close();
    await flush();
    expect(ha.stopped).toEqual(["{{ a }}"]);

    // Back from the view cache: the last known value is still on screen while
    // the reopened subscription's first push is in flight.
    expect(resolver.sync(resolved, ha.hass)).toBe(resolved);
    expect(ha.templates).toEqual(["{{ a }}", "{{ a }}"]);
  });

  it("leaves a nested card's template for the nested card to render", () => {
    const ha = fakeHass();
    const resolver = new ConfigTemplateResolver(() => {});
    const config = {
      type: "custom:m3-room-card",
      name: "{{ mine }}",
      cards: [{ type: "custom:mushroom-template-card", primary: "{{ theirs }}" }],
    };

    resolver.sync(config, ha.hass);
    expect(ha.templates).toEqual(["{{ mine }}"]);
  });
});
