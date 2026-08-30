# Handover — where the work stands

Written at the end of the session that built the 2.2 cards. Read this first;
it is meant to replace re-reading the diff.

**State in one line:** 2.1.0 is released; four new cards, several shared
modules and a handful of additions to existing cards sit unreleased on `main`,
deployed to the author's Home Assistant and tested there, not pushed.

---

## 1. What exists that the 2.1.0 tag does not have

Four new cards, all with editors, README sections in both languages, and
entries in `docs/TESTING.md`:

| Card | What it is | Notes |
| --- | --- | --- |
| `m3-clock-card` | A clock in five styles | Reads no entity. Redraws only while on screen |
| `m3-status-card` | One value large: number, text, or yes/no | The `states` rule list is the point of it |
| `m3-heading-card` | Section headings between cards | Draws no card of its own |
| `m3-room-card` | One card per HA area, everything discovered | The biggest of the four |

The climate overview card also gained `tile_tap_action: thermostat` — a tap on
a room opens that room's thermostat (`m3-climate-card-mini`, floating over the
card) instead of the sensor's history graph. Asked for on Reddit. The default
is unchanged, and a room with no thermostat falls back to the graph.

Four new shared modules:

- `shared/shapes.ts` — the lobed-shape generator (cookie, clover, flower,
  scallop). Any card can use it, not just the clock.
- `shared/visible-ticker.ts` — a repeating callback gated on
  IntersectionObserver + `document.hidden`, with frame/second/minute cadences.
- `shared/actions.ts` — the seven-branch tap-action handler. The button card
  still has its own copy; it should adopt this next time it is touched.
- `shared/collapse-state.ts` — "is it folded, and where is that kept", shared
  by the heading and room cards.

`shared/ha-registry.ts` gained `areaEntityIds` / `areaInfo` / `listAreas`,
which read `hass.areas` / `hass.devices` / `hass.entities` directly. Those are
already in memory in a modern frontend, so area discovery costs no websocket
round-trip and can run in the render path. It is memoised against the registry
object, the same trick `stateCount` uses.

**Version numbers are still 2.1.0 everywhere** (`package.json`, the card-count
sentence in both READMEs, `docs/TESTING.md`). That is deliberate — they get
bumped at release. The suite now registers 33 cards; the docs still say 30.

---

## 2. Decisions worth not re-litigating

**The four colour helpers are not interchangeable** (`shared/color-config.ts`).
`foregroundColor` is accent-as-text-on-the-card, `foregroundOn` is text on
*another* surface, `tintOn` is a mixed fill, `fillColor` is a solid data fill,
`tintInk` is ink on a tint, `inkOn` picks between the house dark ink and white
on a solid fill. Picking the wrong one produces contrast bugs that pass a
casual look. `docs/light-theme-colors.md` has the reasoning.

**Room card: `entity_category` is the filter that makes it usable.** A smart
plug contributes a child lock, an indicator light and a power-on behaviour, all
in the `switch` domain. Without dropping config/diagnostic entities the
author's living room reports 32 switches instead of 2.

**Room card: a tile with several devices opens a picker, it does not toggle
them all.** Four lights are four decisions. `category_tap: toggle` restores the
old behaviour; a tile with one device still toggles directly.

**Room card: no guessing at naming conventions.** A single-device tile shows
that device's name. Stripping the room name out of it is `strip_area_name`, and
it is **off by default** — it only helps if the device happens to be named after
its room. `categories[].name` sets the label outright and always wins. This was
a direct correction from the author; do not re-enable it by default.

**Heading card: collapsing hides sibling cards in the DOM**, writing nothing to
the Lovelace config. The alternatives (rewriting the config on every tap, a
`conditional` round every card, a container card) are each rejected for a
reason stated in `README.md` and in the card's own comments. An unrecognised
DOM shape falls back to the plain variant rather than showing an arrow that
does nothing.

**Changelogs and release notes: English first, then German.** Standing rule
since 2.1.

**Nothing is pushed or released without being asked.** The author tests by hand
first.

---

## 3. Traps that cost real time in this session

**Contrast auditing.** `test/contrast-audit.js` composites CSS backgrounds
only, so text over an SVG fill is measured against the wrong thing and reports
a failure that is not one. It must also run on a *settled* theme — measuring
right after a switch returns a mixture of both. Both limits are documented at
the top of the file.

**A card that is scrolled out of view still needs to repaint on a theme
change.** The clock's hand-written `shouldUpdate` omitted `themes` and kept the
old theme's tints. `hassChangeMatters` covers this; a hand-written one must too.

**A flex `gap` cannot be animated away with a height.** The room card folded by
animating its body's height while switching `.card-inner`'s gap from 12px to 0,
so the collapsed body would not leave a dead strip. A gap applies between items
whatever their size, so it snapped in one frame and everything below the header
jumped 12px while the box was still full height — reported as "the pills move,
looks buggy". The spacing now lives *inside* the folding box as padding on
`.body-inner`, and the card's gap is 0 at all times.

**A throttled CSS transition freezes at its starting value, and re-setting the
same value does not restart it.** A background tab is enough to trigger it: a
room card folded there stayed open, with `style.height` reading `0px` and the
computed height still the full 147px. `_applyFold` therefore settles the end
state after the animation window, with the transition switched off for that
final write. Worth remembering when a measurement says an animation "did
nothing" — check `document.visibilityState` before suspecting the CSS.

**`grid-template-rows: 1fr → 0fr` does not fold a box whose height comes from
its content.** The flexible track is then sized by its own contents and there
is no free space for the flex fraction to distribute. Measured: 135.605px
"collapsing" to 134.98px. The room card animates a measured pixel height
instead — see `_applyFold`.

**Deploying to the author's HA** is its own small discipline; the notes for it
live in the assistant's memory rather than here, because they are about the
environment, not the code. The short version: paste the bundle into the
`file_editor` add-on, then verify with
`curl http://100.121.168.123:8123/local/m3-cards.js | diff` against `dist/` —
that curl is the only check that cannot lie. Bump the Lovelace resource URL
afterwards, and note that the phone app needs a full restart, not a reload.

---

## 4. Where things are being tested

Dashboard `m3-test` on the author's instance, sections A–H3:

- A–F — status card: text hero, badge (tap it), number with trend, grid, rows,
  unavailable
- G — heading card: all four variants, with a heading after the collapsible one
  that must stay put
- H / H2 — room cards: Wohnzimmer, Arbeitszimmer, Flur, then Schlafzimmer with
  `dot_only` and Waschraum as the empty case
- H3 — room cards with `collapsible: true`
- I — climate overview with `tile_tap_action: thermostat`: two Schlafzimmer
  rooms that have one, and a third that has none so the fallback is visible

`input_boolean.m3_test_schalter` is a scratch helper created for testing the
status card's toggle. It can be deleted.

---

## 5. Open, in rough priority order

1. **The author tests the four cards by hand.** That was the plan for the day
   after this session was written.
2. **Screenshots for all four new cards**, to be taken together at release
   time. The READMEs carry `<!-- TODO: docs/images/... -->` markers where they
   go.
3. **Version bump to 2.2.0** at release: `package.json`, the "30 cards"
   sentence in both READMEs, and `docs/TESTING.md` (33 cards now).
4. **Two known cosmetic points**, both raised and deliberately left:
   - In a light theme a grid of status tiles can look uneven — an amber tile
     next to pink ones. That is the dark-parity rule in `tintOn`, not the card.
   - The author's window sensors exist but are assigned to no area, so the room
     card's window chip cannot discover them. `window_entities` is the way
     round it; assigning them in HA is the better fix.
5. **Group B of the old light-theme list** — eight cards that set colours
   outside `buildCssVars`. Largely absorbed by later work, never formally
   closed.
6. **Climate overview, thermostat tap:** a room grouped by *device* rather than
   by area has no area to look a thermostat up in, so auto-discovery finds
   nothing there. `climate_entity` per room is the answer. If this comes up
   often, `discoverClimateRooms` could resolve the device's area into `areaId`.
7. **The status card's alarm-chip path is untested** — no `next_alarm` entity
   exists on the author's instance.
