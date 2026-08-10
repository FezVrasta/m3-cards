# Contributing

## Setup

```bash
npm install
npm run dev     # watch build to dist/m3-cards.js
npm run build   # production build
npm run lint    # typecheck (tsc --noEmit)
```

To test locally, copy `dist/m3-cards.js` into Home Assistant's `config/www/`
and register it as a Lovelace resource (`/local/m3-cards.js`, type
"JavaScript module"). See `docs/TESTING.md` for the manual QA checklist used
before releases.

## Conventions

- No dependency on `button-card`, `card-mod`, `mod-card`, or `stack-in-card` —
  every card is a plain Lit custom element.
- Shared behavior (wave-slider geometry, list-row animation, card header,
  corner-radius editor, appearance editor panel, color resolver, design
  tokens) lives in `src/shared/`. Reuse it before adding a new abstraction.
- Config field names are consistent across cards where the concept is the
  same (e.g. `animation: auto | on | off`, `card_background`, `radius` /
  `corners`).
- All interactive elements need `role="button"`, `tabindex`, `aria-label`,
  and keyboard activation (Enter/Space) via `src/shared/a11y.ts`.
- All animation must respect `prefers-reduced-motion`, in addition to the
  per-card `animation` override.
- Each card writes its own `card_version` into the config so future config
  migrations can be detected reliably (`src/shared/config-migration.ts`).

## Pull requests

Please run `npm run lint` and `npm run build` before opening a PR, and test
the change in a real Home Assistant dashboard — type checking alone doesn't
catch rendering or interaction issues. See the PR template checklist for
details.
