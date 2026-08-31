# Handover — where the work stands

Written at the end of the session that built the 2.2 cards. Read this first;
it is meant to replace re-reading the diff.

**State in one line:** 2.2.0 is prepared on `main` — six new cards, five shared
modules, additions to existing cards, changelog and release notes — deployed to
the author's Home Assistant and verified there. Nothing is pushed, tagged or
released. The last released tag is `v2.1.0`. The suite registers 35 cards.

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

**The version is 2.2.0** in `package.json` and `src/const.ts` (`CARD_VERSION`),
the changelog's section is stamped `[2.2.0]`, and `docs/release-notes-2.2.0.md`
is written. The card counts in both READMEs and `docs/TESTING.md` say 33.
Publishing is a GitHub *release* — `.github/workflows/release.yml` triggers on
that event and attaches the built bundle — so the remaining steps are push, tag
`v2.2.0`, and create the release with the notes.

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

**Deploying the bundle.** Every paste-based route into the File editor has
failed at some point — `cmd+a` does not select in that editor, a locked screen
kills synthetic keys, a background window blocks the paste. The route that
works needs no keyboard at all: serve `dist/` on **127.0.0.1** with both
`Access-Control-Allow-Origin: *` and `Access-Control-Allow-Private-Network:
true`, open the File editor at its **ingress URL directly** so the Ace editor is
the top-level document, then `fetch` the file in that page, `editor.setValue`,
`save()`. Verify with FNV-1a over the file fetched back from `/local/`, never by
size, and bump the Lovelace resource `?v=` afterwards. The Mac's LAN IP does not
work — the firewall refuses inbound — but Chrome reaches loopback because it
runs on the same machine.

**Contrast auditing.** `test/contrast-audit.js` composites CSS backgrounds
only, so text over an SVG fill is measured against the wrong thing and reports
a failure that is not one. It must also run on a *settled* theme — measuring
right after a switch returns a mixture of both. Both limits are documented at
the top of the file.

**A card that is scrolled out of view still needs to repaint on a theme
change.** The clock's hand-written `shouldUpdate` omitted `themes` and kept the
old theme's tints. `hassChangeMatters` covers this; a hand-written one must too.

**The browser's tap highlight is a rectangle and ignores the border radius.**
Reported as "a box appears when you press" on the room card's header, and the
clue that solved it was the user's: *it only shows while the finger is down*.
No card in the suite had ever set `-webkit-tap-highlight-color`, so every
tappable element on a touch device got a grey rectangle over its box, sticking
out past the rounded corner — and fighting the press feedback this suite
actually uses, which is the radius morph. Now `transparent` in
`glass-card.ts`'s `:host`, plus the four cards that build their own frame.

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

1. **The author tests the new cards by hand.** Four of the six were built the
   day before and are largely done; the humidifier and calendar cards were built
   the day after and have been exercised only by the author of this file.

   Their test rigs live on the `m3-neu` view of the main dashboard. The
   humidifier rig deliberately uses **no humidifier entity** — an
   `input_boolean`, two `input_select`s, two `input_number`s and one faked
   sensor — because that is the case the card was made open for, and clicking a
   mode pill really does move the helper. The calendar rig uses
   `calendar.m3_testkalender`, **created for this test and to be deleted
   afterwards**, plus a deliberately unreachable third calendar so the warning
   line has something to report.

2. **Screenshots for the humidifier and calendar cards.** Both READMEs carry
   `<!-- TODO: docs/images/... -->` markers. Cut a capture at a *card's edge*,
   never mid-background — see the note under the older screenshots below.
3. ~~**Screenshots for the first four new cards.**~~ Done 2026-08-31. All eight TODO
   markers in the two READMEs are replaced. The images were shot off a
   dedicated `m3-alle` view holding only the new cards, each column one card in
   its variants, with the frontend switched to English and the entity states
   faked so nothing reads "all off".

   Three of the four are stitched from two captures, because a column of five
   clocks does not fit one viewport. All the joins are invisible, and the reason
   is worth remembering: the captures were cut **at a card's edge**, so the seam
   falls in the thin strip between two cards rather than in the middle of the
   wallpaper. The first attempt cut mid-background and left a visible bright line
   at every seam. `dev/` holds no tool for this — the stitching was done with a
   throwaway dependency-free PNG script, since neither Pillow nor ImageMagick is
   installed and installing one for four images was not worth it.

   Deliberately left alone: **`cards-overview.png`**. It still shows the old
   35-card view and predates the light card's duplicate-percentage fix. The
   author's call — it belongs to a later release.
3. **Version bump to 2.2.0** at release: `package.json` and `CARD_VERSION` in
   `src/const.ts`. The card counts in the docs are already right.
4. **Two known cosmetic points**, both raised and deliberately left:
   - In a light theme a grid of status tiles can look uneven — an amber tile
     next to pink ones. That is the dark-parity rule in `tintOn`, not the card.
   - The author's window sensors exist but are assigned to no area, so the room
     card's window chip cannot discover them. `window_entities` is the way
     round it; assigning them in HA is the better fix.
5. **Group B of the old light-theme list** — eight cards that set colours
   outside `buildCssVars`. Largely absorbed by later work, never formally
   closed.
6. ~~**Climate overview, thermostat tap:** a room grouped by device has no area
   to look a thermostat up in.~~ Done. The suggested fix was already in place —
   `resolve()` in `discoverClimateRooms` has always fallen back to the device's
   `area_id`, so a device bucket means neither the entity nor the device has an
   area and there is nothing left to resolve. What was actually missing is the
   case that matters here: a thermostat exposing both its own temperature
   sensor and its `climate` entity. `DiscoveredClimateRoom` now carries
   `deviceId`, `deviceEntityIds` is the device-scoped twin of `areaEntityIds`,
   and `_climateFor` falls back to a `climate` entity on the same device.
   `climate_entity` still overrides everything.
7. **The alarm chip is untested** — no `next_alarm` entity exists on the
   author's instance. It belongs to the **clock** card (`alarm_entity`,
   `_alarmChip`), not the status card, which is what this item claimed until
   2026-08-31. `dev/showcase.js` now fakes `sensor.m3demo_next_alarm` seven
   hours out, which is inside the card's 24 h horizon, so applying the showcase
   exercises the path.
