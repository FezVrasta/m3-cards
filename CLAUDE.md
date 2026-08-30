# m3-cards

Material 3 Lovelace cards for Home Assistant. TypeScript + Lit, no
button-card and no card-mod. One bundle, `dist/m3-cards.js`, registering 33
cards.

**Read `docs/HANDOVER.md` before starting work.** It carries the current state,
the decisions that should not be re-litigated, and the traps that have already
cost time.

## Working here

- `npm run build` — production bundle. `npm run lint` is `tsc --noEmit`.
- `npm run test:contrast` unit-tests the colour maths;
  `test/contrast-audit.js` measures the rendered page and is pasted into the
  browser console, once per theme.
- Communication with the author is in German. Code, comments, commit messages
  and the changelog are in English; the changelog and release notes carry the
  English text first, then a German version.
- Commit locally and stop. Nothing is pushed, tagged or released without being
  asked — the author tests by hand first.

## Conventions

- Icons are always `ha-icon`, never inline SVG. Dark-on-accent ink is `#1c1c1c`.
- Colours go through `shared/color-config.ts`. The helpers are not
  interchangeable: `foregroundColor` for accent-as-text on the card,
  `foregroundOn` for text on another surface, `tintOn` for a mixed fill,
  `fillColor` for a solid data fill, `tintInk` for ink on a tint, `inkOn` to
  pick between dark ink and white on a solid fill.
- Every card implements `shouldUpdate`. Use `hassChangeMatters` unless the card
  discovers its own entities, in which case use `discoveryChangeMatters` — and
  if you write one by hand, it must let a `themes` change through, or an
  off-screen card keeps the old theme's colours.
- Per-card numbers live in `const.ts`, which derives them from the scale in
  `shared/tokens.ts`.
