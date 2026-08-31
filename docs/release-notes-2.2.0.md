# M3 Cards 2.2.0

**Upgrading:** no configuration option was removed or renamed and no default in
`const.ts` changed, so existing configs load unchanged. One thing looks
different without having been asked for: the light card printed its brightness
twice and now prints it once. See "Behaviour changes" at the end.

The new-cards release. Six of them: a clock that costs almost nothing to run, a
card that turns a state into a sentence, headings for the space between cards,
one card per room that works out its own contents, a (de)humidifier card that
does not insist your device is a humidifier entity, and a calendar with an
agenda and a month grid. The suite now registers 35 cards, and five shared
modules came out of building them.

### Added

- **M3 Humidifier Card** (`m3-humidifier-card`) — target humidity, mode, fan
  speed and a device's extras in one card. Home Assistant's own humidifier card
  cannot set a fan speed, so the usual answer is a second card beside it.

  It does not insist that `entity` is a `humidifier`: plenty of dehumidifiers
  are a switch plus a number plus a sensor, and `current_entity`,
  `target_entity` and `action_entity` say where the readings come from. Modes
  come from `available_modes`, a `select`, or an explicit list; the fan row
  reads presets, percentages or a select's options. `layout` orders the four
  blocks and hides the ones left out.

- **M3 Calendar Card** (`m3-calendar-card`) — an agenda and a month grid for
  any number of calendars. Events come from `calendar.get_events`, since the
  entity attributes carry only the next one. Multi-day events appear under every
  day they touch with "day 2 of 3", a running event is badged, and a calendar
  that cannot be reached is named rather than silently dropped.

- **M3 Room Card** (`m3-room-card`) — one card per area. Point it at a Home
  Assistant area and it works out the rest: which kinds of device are in the
  room, what each is doing, the climate readings, and whether anyone is in
  there. Nine categories are built in, `extra_domains` adds more, and a tile
  appears only for a category that actually has an entity in the room.

  The badge under each tile is the point of it: with several devices it counts
  them (`2/4`), with one it says what that device is doing — the fan's step,
  the thermostat's target, the media title, the blind's position.

  Entities Home Assistant marks as configuration or diagnostic are left out,
  and that single filter is what makes the switch category usable: on the
  author's install a living room holds 32 switches, of which 2 are things a
  person would call a switch.

  A tile holding several devices opens a picker on tap rather than switching all
  of them, because a room's four lights are four decisions, not one. "All off"
  and "All on" are there for when it really is one. Individual devices can be
  excluded in the editor — that is where a plug's indicator light goes when its
  integration fails to mark it as diagnostic.

  `collapsible: true` folds the card down to its header, keeping the subtitle,
  because "occupied · 3 devices on" is exactly what a folded room still needs to
  say. The state persists per browser, or across devices in an `input_boolean`.

- **M3 Heading Card** (`m3-heading-card`) — section headings for the space
  between cards, in four variants: a plain icon and title, one with a count chip
  and an action button, a divider rule with a small-caps label, and a
  collapsible one that folds away the cards below it. It draws no card of its
  own — no frame, no glass, no shadow — so it reads as a label for what follows
  rather than as another tile.

  Collapsing hides the sibling cards in the browser and writes nothing to the
  dashboard configuration, so it is a view state and not an edit. That depends
  on Home Assistant's own DOM, so every step is a check rather than an
  assumption, and an unrecognised layout falls back to the plain variant: an
  arrow that visibly does nothing is worse than no arrow.

- **M3 Status Card** (`m3-status-card`) — shows a value large and with meaning:
  a number, a piece of text, or a yes/no state, from any entity. The mapping in
  between is the point: a `states` rule list turns `off` into a red "No" with a
  cross, or a number under 20 into a warning colour, with no template sensor
  doing the work. Five presets (`yes_no`, `on_off`, `ok_problem`,
  `open_closed`, `traffic`) supply ready-made rule lists in the dashboard's own
  language, and a card's own rules are tried first, so a preset can be adjusted
  without being replaced.

  One value gets the large hero treatment, several get a grid or a row list. A
  `toggle` tap switches the shown state over at once instead of waiting for
  Home Assistant to confirm, so a "medication given" card cannot be tapped
  twice by someone who thinks the first tap missed. An optional trend chip
  compares against the same entity 24 hours ago, with `trend_inverted` for the
  values where falling is the win.

- **M3 Clock Card** (`m3-clock-card`) — a clock in five styles: rounded tiles,
  digits inside lobed shapes, lockscreen typography, an organic analogue dial,
  and a sixty-segment ring. It reads no entity, so it works on any dashboard
  without setting anything up; the optional alarm, sun, day-progress and
  second-time-zone extras are the only parts that need one.

  The card only redraws while it is on screen — a clock on a wall tablet would
  otherwise animate for weeks to an empty room — and styles with nothing moving
  between whole seconds drop to a timer that wakes on the minute. Measured on a
  35-card dashboard: **12 renders in 12 seconds** against roughly 1440 frames,
  and zero ticks while scrolled out of view.

- **M3 Climate Overview — `tile_tap_action: thermostat`.** A tap on a room
  opened the sensor's dialog, which is its history graph; it can now open that
  room's thermostat instead — `m3-climate-card-mini`, floating over the card and
  adjustable there. The thermostat is found in the room's own Home Assistant
  area, or on the device the room's sensors sit on when the room has no area at
  all, which is how a thermostat reporting its own room temperature is found.
  `climate_entity` names it per room and overrides both. A room with no
  thermostat keeps the graph rather than going dead. Asked for on Reddit; the
  default is unchanged.

- **M3 Leak Card — `max_visible`.** The same "show N more" toggle the power
  list, battery, NAS, updates and occupancy cards already had; the leak card
  only had the all-or-nothing `collapse_ok`. The limit steps aside during an
  alarm, because whichever sensor is wet has to be on screen without another
  tap.

- **Three shared modules**, each pulled out of a card rather than written
  alongside it:
  - `src/shared/shapes.ts` — the lobed-shape generator behind the clock's
    styles. Material 3 Expressive's cookie, clover, flower and scallop shapes
    are one curve with different settings, so one generator covers the family.
  - `src/shared/actions.ts` — the seven-branch tap/hold action handler, moved
    out of the button card so the status card's `toggle` and `call-service` use
    the same code rather than a second copy.
  - `src/shared/collapse-state.ts` — the fold-state rule, shared by the heading
    and room cards so the two cannot drift apart.

### Fixed

- **M3 Cost Card sent a wildly wrong number to your phone.** Its notification
  multiplied `states(entity)` by the price, and for a counter that state is the
  *meter reading*: on the author's install the card said 112.66 € for August
  while its own notification said 26,844.38 €. The automation now reads the same
  statistics the card reads, so the two cannot disagree. **An automation created
  before this fix keeps its old template** — open the card's notification
  settings and save again.

- **M3 Light Card showed the brightness twice.** The percentage stood under the
  lamp's name and again above the slider handle. The subtitle is the live one —
  it already follows the value while the handle is being dragged — and it is
  what every other card puts in that spot, so the label on the slider is gone.

- **`tintOn` on a dark surface** returned a CSS `color-mix` string rather than a
  colour. `tintInk` feeds that back in as the surface to measure ink against,
  and an unparseable surface means the ink comes back unchanged — so `tintInk`
  has been a silent no-op in every dark theme since it was written. Benign
  until now, because a light accent on its own dark tint contrasts well by
  accident.

### Behaviour changes

No configuration option was removed or renamed and no default in `const.ts`
changed, so existing configs load unchanged. One point changes what you
**see**:

- **M3 Light Card** shows the brightness percentage once, under the lamp's
  name. The second copy above the slider handle is gone.

---

**Deutsche Fassung**

Das Release der neuen Karten. Sechs davon: eine Uhr, die im Betrieb fast nichts
kostet, eine Karte, die aus einem Zustand einen Satz macht, Überschriften für
den Raum zwischen den Karten, eine Karte je Raum, die ihren Inhalt selbst
herausfindet, eine Karte für Be- und Entfeuchter, die nicht voraussetzt, dass
das Gerät eine humidifier-Entität ist, und ein Kalender mit Agenda und
Monatsraster. Die Suite registriert jetzt 35 Karten, und beim Bau sind fünf
gemeinsam genutzte Module entstanden.

### Neu

- **M3 Humidifier Card** (`m3-humidifier-card`) — Zielfeuchte, Modus,
  Lüfterstufe und die Zusatzfunktionen eines Geräts in einer Karte. Die
  eingebaute humidifier-Karte kann keine Lüftergeschwindigkeit, deshalb steht
  sonst eine zweite Karte daneben.

  Sie setzt nicht voraus, dass `entity` eine `humidifier`-Entität ist: Viele
  Entfeuchter sind ein Schalter plus `number` plus `sensor`, und
  `current_entity`, `target_entity` und `action_entity` sagen, woher die Werte
  kommen. Modi kommen aus `available_modes`, einem `select` oder einer eigenen
  Liste; die Lüfterzeile liest Presets, Prozentwerte oder die Optionen eines
  select. `layout` ordnet die vier Blöcke und blendet weggelassene aus.

- **M3 Calendar Card** (`m3-calendar-card`) — Agenda und Monatsraster für
  beliebig viele Kalender. Die Termine kommen über `calendar.get_events`, weil
  die Attribute der Entität nur den nächsten tragen. Mehrtägige Termine
  erscheinen an jedem betroffenen Tag mit „Tag 2 von 3", ein laufender bekommt
  ein Abzeichen, und ein nicht erreichbarer Kalender wird benannt statt
  stillschweigend weggelassen.

- **M3 Room Card** (`m3-room-card`) — eine Karte je Bereich. Man gibt ihr einen
  Bereich aus Home Assistant, den Rest findet sie selbst: welche Gerätearten im
  Raum hängen, was jede davon tut, die Klimawerte und ob jemand da ist. Neun
  Kategorien sind eingebaut, `extra_domains` ergänzt weitere, und eine Kachel
  erscheint nur für eine Kategorie, die im Raum tatsächlich eine Entität hat.

  Der Text unter der Kachel ist der eigentliche Punkt: Bei mehreren Geräten
  zählt er (`2/4`), bei einem sagt er, was dieses Gerät tut — die Stufe des
  Lüfters, die Zieltemperatur, den Medientitel, die Rollo-Position.

  Entitäten, die Home Assistant als Konfiguration oder Diagnose markiert,
  bleiben draußen, und erst dieser eine Filter macht die Schalter-Kategorie
  brauchbar: Im Wohnzimmer der Testinstallation liegen 32 Schalter, von denen 2
  das sind, was ein Mensch einen Schalter nennt.

  Eine Kachel mit mehreren Geräten öffnet beim Tap eine Auswahl, statt alle
  umzuschalten — die vier Lampen eines Raums sind vier Entscheidungen, nicht
  eine. „Alles aus" und „Alle an" stehen für die Fälle bereit, in denen es doch
  nur eine ist. Einzelne Geräte lassen sich im Editor abwählen; dort landet die
  Status-LED einer Steckdose, wenn ihre Integration sie nicht als Diagnose
  markiert.

  `collapsible: true` klappt die Karte auf ihre Kopfzeile zusammen, der
  Untertitel bleibt stehen — denn „belegt · 3 Geräte aktiv" ist genau das, was
  ein eingeklappter Raum noch sagen muss. Der Zustand bleibt je Browser
  erhalten oder geräteübergreifend in einem `input_boolean`.

- **M3 Heading Card** (`m3-heading-card`) — Abschnitts-Überschriften für den
  Raum zwischen den Karten, in vier Varianten: schlicht mit Icon und Titel, mit
  Zähler-Chip und Aktions-Button, als Trennstrich mit Label in Versalien und
  aufklappbar mit Einklappen der Karten darunter. Sie zeichnet keine eigene
  Karte — kein Rahmen, kein Glas, kein Schatten —, damit sie als Beschriftung
  für das Folgende gelesen wird und nicht als weitere Kachel.

  Das Einklappen blendet die Geschwisterkarten im Browser aus und schreibt
  nichts in die Dashboard-Konfiguration; es ist ein Anzeigezustand, keine
  Bearbeitung. Das hängt vom DOM von Home Assistant ab, deshalb ist jeder
  Schritt eine Prüfung und keine Annahme, und ein unbekanntes Layout fällt auf
  die schlichte Variante zurück: Ein Pfeil, der sichtbar nichts tut, ist
  schlimmer als gar keiner.

- **M3 Status Card** (`m3-status-card`) — zeigt einen Wert groß und mit
  Bedeutung: eine Zahl, einen Text oder einen Ja/Nein-Zustand, aus beliebigen
  Entitäten. Der eigentliche Punkt ist die Zuordnung dazwischen: Eine
  `states`-Regelliste macht aus `off` ein rotes „Nein" mit Kreuz oder aus einer
  Zahl unter 20 eine Warnfarbe — ohne Template-Sensor. Fünf Vorlagen
  (`yes_no`, `on_off`, `ok_problem`, `open_closed`, `traffic`) liefern fertige
  Regellisten in der Sprache des Dashboards, und eigene Regeln werden zuerst
  geprüft: Eine Vorlage lässt sich anpassen, ohne sie zu ersetzen.

  Ein Wert bekommt die große Hero-Darstellung, mehrere ein Raster oder eine
  Zeilenliste. Ein `toggle`-Tap schaltet die Anzeige sofort um, statt auf die
  Bestätigung von Home Assistant zu warten — so tippt niemand ein zweites Mal,
  weil der erste Tap scheinbar nichts getan hat. Ein optionaler Trend-Chip
  vergleicht mit derselben Entität vor 24 Stunden, mit `trend_inverted` für die
  Werte, bei denen Fallen der Gewinn ist.

- **M3 Clock Card** (`m3-clock-card`) — eine Uhr in fünf Stilen: runde Kacheln,
  Ziffern in gelappten Formen, Sperrbildschirm-Typografie, ein organisches
  analoges Zifferblatt und ein Ring aus sechzig Segmenten. Sie liest keine
  Entität und läuft damit auf jedem Dashboard ohne Einrichtung; nur die
  optionalen Extras — Wecker, Sonne, Tagesfortschritt, Zweitzeitzone —
  brauchen eine.

  Die Karte zeichnet nur neu, solange sie sichtbar ist — eine Uhr auf einem
  Wandtablet würde sonst wochenlang für einen leeren Raum animieren — und Stile
  ohne Bewegung zwischen den Sekunden schalten auf einen Minutentimer um. Auf
  einem Dashboard mit 35 Karten gemessen: **12 Renders in 12 Sekunden** bei
  rund 1440 Frames, und null Ticks außerhalb des Sichtbereichs.

- **M3 Climate Overview — `tile_tap_action: thermostat`.** Ein Tap auf einen
  Raum öffnete den Sensordialog, also dessen Verlaufsgraphen; er kann jetzt
  stattdessen das Thermostat des Raums öffnen — `m3-climate-card-mini`,
  schwebend über der Karte und dort bedienbar. Gefunden wird es im Bereich des
  Raums oder, wenn ein Raum überhaupt keinen Bereich hat, an dem Gerät, an dem
  seine Sensoren hängen — so wird ein Thermostat gefunden, das seine eigene
  Raumtemperatur meldet. `climate_entity` benennt es je Raum und sticht beide
  Automatiken. Ein Raum ohne Thermostat behält den Verlauf, statt tot zu sein.
  Auf Reddit gewünscht; die Vorgabe bleibt unverändert.

- **M3 Leak Card — `max_visible`.** Derselbe „N weitere anzeigen"-Umschalter,
  den Power-List, Batterie, NAS, Updates und Belegung längst haben; die
  Leak-Karte hatte nur das Alles-oder-nichts von `collapse_ok`. Im Alarmfall
  tritt die Begrenzung zurück, denn welcher Sensor nass ist, muss ohne zweiten
  Tap sichtbar sein.

- **Drei gemeinsam genutzte Module**, jedes aus einer Karte herausgelöst statt
  neben ihr geschrieben:
  - `src/shared/shapes.ts` — der Formengenerator hinter den Uhrenstilen.
    Cookie, Kleeblatt, Blüte und Scallop aus Material 3 Expressive sind
    dieselbe Kurve mit anderen Werten, also deckt ein Generator die Familie ab.
  - `src/shared/actions.ts` — der Aktions-Handler mit seinen sieben Zweigen,
    aus der Button-Karte herausgelöst, damit `toggle` und `call-service` der
    Status-Karte denselben Code nutzen statt einer zweiten Kopie.
  - `src/shared/collapse-state.ts` — die Regel für den eingeklappten Zustand,
    gemeinsam genutzt von Heading- und Room-Karte, damit beide nicht
    auseinanderlaufen.

### Behoben

- **M3 Cost Card schickte eine völlig falsche Zahl aufs Handy.** Ihre
  Benachrichtigung multiplizierte `states(entity)` mit dem Preis, und bei einem
  Zähler ist dieser Zustand der *Zählerstand*: Auf der Testinstallation meldete
  die Karte für August 112,66 €, ihre eigene Benachrichtigung 26 844,38 €. Die
  Automation liest jetzt dieselben Statistiken wie die Karte, beide können also
  nicht mehr auseinanderlaufen. **Eine vor dieser Behebung angelegte Automation
  behält ihr altes Template** — die Benachrichtigungs-Einstellungen der Karte
  erneut speichern.

- **M3 Light Card zeigte die Helligkeit doppelt.** Die Prozentangabe stand
  unter dem Namen der Lampe und noch einmal über dem Reglergriff. Die
  Unterzeile ist die lebende Anzeige — sie folgt dem Wert schon während des
  Ziehens — und sie ist das, was jede andere Karte an dieser Stelle zeigt; die
  Marke am Regler ist deshalb entfallen.

- **`tintOn` auf dunkler Fläche** gab einen CSS-`color-mix`-String zurück statt
  einer Farbe. `tintInk` reicht genau das als Bezugsfläche zurück, und eine
  nicht auflösbare Fläche heißt: Die Tinte kommt unverändert zurück — `tintInk`
  war damit in jedem dunklen Theme still wirkungslos, seit es geschrieben
  wurde. Bis jetzt folgenlos, weil ein heller Akzent auf seiner eigenen dunklen
  Tönung zufällig gut kontrastiert.

### Achtung beim Update

Keine Konfigurationsoption wurde entfernt oder umbenannt, kein Standardwert in
`const.ts` hat sich geändert — bestehende Configs laden unverändert. Ein Punkt
ändert aber, was man **sieht**:

- **M3 Light Card** zeigt die Helligkeit einmal, unter dem Namen der Lampe. Die
  zweite Angabe über dem Reglergriff ist entfallen.
