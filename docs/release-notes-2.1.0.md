# M3 Cards 2.1.0

**Upgrading:** no configuration option was removed or renamed and no default
in `const.ts` changed, so existing configs load unchanged — but the light theme
looks noticeably different, on purpose. See "Behaviour changes" at the end.
Everything below was measured on a live 35-card dashboard in both themes.

The light theme release. Accent colours are now corrected at render time
against the surface they are actually drawn on, so the palette reads as
deliberate rather than washed out. Alongside that: a large rendering-cost
reduction, a masonry layout fix, and calendar support for the waste card.

### Added

- **M3 Waste Card — `calendar_entity`.** Read the schedule from a calendar
  whose events name the bin, instead of (or alongside) one day-count sensor per
  bin. Streams from both sources are merged; a sensor wins over a calendar entry
  with the same name.
- **Contrast tooling.** `npm run test:contrast` unit-tests the colour maths, and
  `test/contrast-audit.js` measures the *rendered* page — paste it into the
  browser console on a dashboard and run it once per theme. See
  `docs/TESTING.md`.

### Fixed

- **Accent colours in a light theme.** The 2.0 known issue is resolved. The
  palette is built for dark backgrounds — all thirteen colours fall below 4.5:1
  on a light card and all thirteen pass on a dark one — so accents used as text
  or as a data fill are now moved to their target contrast at render time. The
  correction keeps the hue and lifts the saturation rather than blending toward
  black: `#85b7eb` becomes `#0b6ed5`, not a grey-blue. Measured on a live
  35-card dashboard, the light theme now reports three findings and the dark
  theme four, and all three of the light ones appear in the dark list too —
  they are long-standing design choices, not theme faults.
- **Content on tinted surfaces.** Chips, icon wells, expand toggles and count
  badges took their colour from the card while sitting on a tint of the same
  hue, which rendered `#81c784` on `#9cdc9f` — 1.26:1. Ink is now measured
  against the surface it actually sits on.
- **Tints no longer mix toward `transparent`.** 146 surfaces mixed into
  whatever was behind the card, which through a glass card is the dashboard
  wallpaper, so the same 8% wash looked different depending on the picture
  underneath. They mix into the card surface now. Gradients and deliberate
  overlays are unchanged.
- **M3 Button Card and M3 Climate Card Mini in a masonry view.** Both make
  their card a size container so paddings can scale with height, then took
  `height: 100%`. A masonry column imposes no height, the percentage fell back
  to `auto`, and `auto` on a size-contained box is zero: the button card
  rendered a squashed 37px of content inside a 0px card, and the climate-mini
  card disappeared entirely. Sections views were never affected.
- **M3 Occupancy Card — `max_visible`.** The option had no effect; the list now
  caps at the given number with the rest behind a toggle.

### Performance

- **Cards no longer re-render on unrelated state changes.** Home Assistant
  hands every card a fresh `hass` object whenever anything in the system
  changes, so one chatty power sensor re-rendered every card on the dashboard.
  Every card now declares what it reads. Cards that discover their entities by
  scanning also watch for the entity count changing, so a newly added sensor is
  still picked up.
- **M3 Power Summary — count-up animation.** The value lerp wrote to reactive
  state on every animation frame although the reading is rounded before it is
  shown, so most frames re-rendered identical text.
- Measured together on the same 35-card dashboard, 20 seconds:
  **370 renders → 12.**

### Behaviour changes

No configuration option was removed or renamed, and no default in `const.ts`
changed — existing configs load unchanged. These change what you *see*:

- **Every card in a light theme.** Accent-coloured text and data fills are
  distinctly darker and more saturated than in 2.0. This is the fix, not a side
  effect, but it is a visible change.
- **Every card.** Tinted inner fills are opaque now rather than letting the
  wallpaper through. The card itself stays translucent.
- **M3 Climate Card Mini** has a minimum height of 112px. A tile configured
  smaller than that is raised to it. 112px is the smallest height at which the
  compact layout fits without clipping, so a tile below it was cutting off its
  own content already.

---

**Deutsche Fassung**

Das Release für das helle Theme. Akzentfarben werden jetzt beim Rendern gegen
die Fläche korrigiert, auf der sie tatsächlich liegen — die Palette wirkt
dadurch gewollt statt ausgewaschen. Dazu: deutlich weniger Renderaufwand, ein
Layout-Fehler in der Masonry-Ansicht und Kalender-Unterstützung für die
Abfallkarte.

### Neu

- **M3 Waste Card — `calendar_entity`.** Abfuhrtermine aus einem Kalender
  lesen, dessen Einträge die Tonne benennen — statt oder zusätzlich zu je einem
  Tageszähler-Sensor pro Tonne. Beide Quellen werden zusammengeführt; bei
  gleichem Namen gewinnt der Sensor.
- **Werkzeuge für Kontrastprüfung.** `npm run test:contrast` testet die
  Farbmathematik, `test/contrast-audit.js` misst die *gerenderte* Seite — in die
  Browser-Konsole eines Dashboards einfügen und je Theme einmal ausführen.
  Siehe `docs/TESTING.md`.

### Behoben

- **Akzentfarben im hellen Theme.** Die bekannte Einschränkung aus 2.0 ist
  erledigt. Die Palette ist für dunkle Hintergründe gebaut — alle dreizehn
  Farben fallen auf heller Karte unter 4,5:1 und bestehen auf dunkler — deshalb
  werden Akzente als Text oder als Datenfläche jetzt zur Laufzeit auf ihren
  Zielkontrast gezogen. Die Korrektur hält den Farbton und hebt die Sättigung,
  statt Richtung Schwarz zu blenden: `#85b7eb` wird `#0b6ed5`, kein Graublau.
  Auf einem Dashboard mit 35 Karten gemessen meldet das helle Theme jetzt drei
  Funde, das dunkle vier — und alle drei hellen stehen auch in der dunklen
  Liste. Es sind also langjährige Gestaltungsentscheidungen, keine
  Theme-Fehler.
- **Inhalt auf getönten Flächen.** Chips, Icon-Felder, Aufklapp-Umschalter und
  Zähler-Badges nahmen ihre Farbe von der Karte, saßen aber auf einer Tönung
  desselben Farbtons — das ergab `#81c784` auf `#9cdc9f`, also 1,26:1. Die
  Schrift wird jetzt gegen die Fläche gemessen, auf der sie wirklich liegt.
- **Tönungen mischen nicht mehr gegen `transparent`.** 146 Flächen mischten
  gegen das, was hinter der Karte lag — durch eine Glaskarte also gegen die
  Hintergrundtapete, sodass derselbe 8-%-Schleier je nach Bild anders aussah.
  Sie mischen jetzt in die Kartenfläche. Gradienten und bewusste Überlagerungen
  bleiben unverändert.
- **M3 Button Card und M3 Climate Card Mini in der Masonry-Ansicht.** Beide
  machen ihre Karte zum Größen-Container, damit Polster mit der Höhe skalieren
  können, und nahmen dann `height: 100%`. Eine Masonry-Spalte gibt keine Höhe
  vor, der Prozentwert fiel auf `auto` zurück, und `auto` ist auf einem
  größen-kontenierten Element null: Die Button-Karte zeigte 37 px gequetschten
  Inhalt in einer 0-px-Karte, die Mini-Klimakarte verschwand ganz.
  Sections-Ansichten waren nie betroffen.
- **M3 Occupancy Card — `max_visible`.** Die Option hatte keine Wirkung; die
  Liste wird jetzt bei der angegebenen Zahl gekappt, der Rest liegt hinter
  einem Umschalter.

### Geschwindigkeit

- **Karten rendern nicht mehr bei fremden Zustandsänderungen.** Home Assistant
  übergibt jeder Karte ein frisches `hass`-Objekt, sobald sich irgendwo im
  System etwas ändert — ein einzelner geschwätziger Stromsensor rendert so das
  ganze Dashboard neu. Jede Karte deklariert jetzt, was sie liest. Karten, die
  ihre Entitäten selbst suchen, beobachten zusätzlich die Anzahl der Entitäten,
  damit ein neu hinzugefügter Sensor weiterhin gefunden wird.
- **M3 Power Summary — Zähl-Animation.** Die Interpolation schrieb pro
  Animationsframe in reaktiven Zustand, obwohl der Wert vor der Anzeige
  gerundet wird — die meisten Frames rendern also identischen Text.
- Zusammen gemessen, dasselbe Dashboard mit 35 Karten, 20 Sekunden:
  **370 Renders → 12.**

### Achtung beim Update

Keine Konfigurationsoption wurde entfernt oder umbenannt, kein Standardwert in
`const.ts` hat sich geändert — bestehende Configs laden unverändert. Diese
Punkte ändern aber, was man **sieht**:

- **Alle Karten im hellen Theme.** Akzentfarbener Text und Datenflächen sind
  deutlich dunkler und gesättigter als in 2.0. Das ist die Behebung, kein
  Nebeneffekt — aber eine sichtbare Änderung.
- **Alle Karten.** Getönte Innenflächen sind jetzt deckend, statt die Tapete
  durchscheinen zu lassen. Die Karte selbst bleibt durchscheinend.
- **M3 Climate Card Mini** hat eine Mindesthöhe von 112 px. Eine kleiner
  konfigurierte Kachel wird darauf angehoben. 112 px ist die kleinste Höhe, bei
  der das kompakte Layout ohne Abschneiden passt — eine kleinere Kachel schnitt
  ihren Inhalt vorher bereits ab.
