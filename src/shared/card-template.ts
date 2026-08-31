// Deep-walks a raw Lovelace card config skeleton and resolves `[[token]]`
// placeholders against a flat token map — e.g. `include_area: ["[[area_id]]"]`
// or `title: "Details [[name]]"`. Distinct from card-mod's `[[[ ]]]` and HA's
// own `{{ }}` Jinja templates so none of the three collide inside the same
// dashboard YAML.
export type CardTemplateTokens = Record<string, string | undefined>;

const TOKEN_RE = /\[\[(\w+)\]\]/g;
const EXACT_TOKEN_RE = /^\[\[(\w+)\]\]$/;

function resolveString(value: string, tokens: CardTemplateTokens): unknown {
  const exact = value.match(EXACT_TOKEN_RE);
  if (exact) return tokens[exact[1]] ?? "";
  if (!value.includes("[[")) return value;
  return value.replace(TOKEN_RE, (_match, name: string) => tokens[name] ?? "");
}

// Config errors here should never crash the popup — an unresolved token just
// becomes an empty string, same "fail soft" rule as the rest of the config
// surface (see CLAUDE.md: "Nie hart crashen").
export function resolveCardTemplate(skeleton: unknown, tokens: CardTemplateTokens): unknown {
  if (typeof skeleton === "string") return resolveString(skeleton, tokens);
  if (Array.isArray(skeleton)) return skeleton.map((v) => resolveCardTemplate(v, tokens));
  if (skeleton && typeof skeleton === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(skeleton)) {
      out[key] = resolveCardTemplate(value, tokens);
    }
    return out;
  }
  return skeleton;
}
