# M3 Cards 2.3.0

**Upgrading:** no configuration option was removed or renamed, so existing
configs load unchanged. Two things look different without having been asked
for: the room card's accent now follows the theme instead of a fixed blue, and
a water or gas meter's monthly figure was a thousandth of the truth and is now
right. See "Behaviour changes" at the end.

The navigation release. `m3-nav-card` is the new card — a dashboard navigation
bar in five variants, configurable to the level of the community's Navbar Card
but in this suite's design language. Around it, three older cards grew up: the
button card learned the shape language a phone's quick settings use, the room
card learned to hold arbitrary Lovelace cards instead of only what it can
discover by itself, and every colour field in every card can now be handed back
to the theme.

Three more cards arrived from an unexpected direction: Fabian Wendel
([UHaFnir](https://github.com/UHaFnir/m3-cards)) forked the suite, built
**Lights Overview**, **Chip Buttons** and **Group Card** in its design
language, improved the weather card, and found two performance faults in
code that was already here. All of it is in this release. The suite now
registers 39 cards.

### Added
- **M3 Nav Card** (`m3-nav-card`) — a navigation bar for the dashboard, in five
  variants. `header` and `footer` dock to a screen edge, `segmented` is an
  inline pill group that scrolls with the page, `floating` detaches into a
  rounded bar, and `sheet` adds a drawer that pulls up over the view. The four
  docked variants take no row of the grid: their slot collapses and they
  position themselves against the screen.

  Per-entry badges take a template, an entity's state, or a count of entities
  that are on — hidden automatically at 0, off, empty or unavailable. Popup
  submenus grow out of the button that opened them. Tap, hold and double-tap
  each get an action, and the phone gives a short buzz to confirm one.

  Desktop and mobile have separate layouts, and the bar picks between them by
  measuring **its own width**, not the window's. Put it in a narrow column on a
  wide screen and it knows it is narrow — the usual approach, which asks how
  wide the screen is, would lay out a cramped bar as though it had the whole
  display.

  `name`, `icon`, `color`, `hidden`, `disabled` and the badge accept a template,
  so you can compute what an entry shows instead of fixing it in the config. The
  card registers each template with Home Assistant, which sends a fresh value
  whenever any entity the template mentions changes — a badge updates by itself,
  with no polling. Only fields that really contain a template are registered,
  and two entries using the same one share a single registration.

  The sheet is dragged, and the interesting part is not the drag but the
  conflict with the content scrolling inside it: the content scrolls normally,
  and the sheet only takes over once the content is already at the top and the
  finger is going down. Let go and it settles to whichever open or closed
  position is nearest — unless you flicked it, in which case it goes the way it
  was thrown, wherever it happened to be.

- **Three cards from a fork** — **M3 Lights Overview**
  (`m3-lights-overview-card`), **M3 Chip Buttons** (`m3-chip-buttons-card`) and
  **M3 Group Card** (`m3-group-card`), built by Fabian Wendel
  ([UHaFnir](https://github.com/UHaFnir/m3-cards)) and adopted here.

  **Lights Overview** groups every light by area and gives each room a tile
  that switches it — or lists the lights themselves, optionally with the ones
  that are on first. Two independent filters decide what a room *shows* and
  what a tap actually *switches*. A lamp on a smart plug is a `switch` rather
  than a `light`, so `include_domains` widens the sweep, and a tap switches
  through the generic service so those plugs really do turn on.

  **Chip Buttons** is a row of compact pills bound to entities, each able to
  show its state, take the entity's own colour, hold a fixed one, or render
  read-only as a label. The row scrolls sideways and its edges fade on
  whichever side still has chips behind it.

  **Group Card** puts several cards on one surface with a shared background and
  radius, so related cards read as one block instead of separate tiles.

- **Weather card: the header and the chart switch independently.** A card can
  be just the current conditions, just the forecast chart, or both. The hourly
  strip gained icons, temperatures, hour labels and a temperature axis, each
  switchable. Icon, temperature and hour now share one rhythm and the strip
  sits square in the card — it measures its own width, draws every 2nd, 3rd or
  4th hour, and cuts the row back to a whole number of those steps so it ends
  flush at both edges. Also from UHaFnir's fork.


- **Nav card: the marker and the page move together.** `marker_motion: slide`
  moves a single shape between entries instead of fading one out and another in
  — except on arrival, where the marker is simply already where it belongs.
  `page_transition` cross-fades the whole view when a navigation starts from the
  bar; `page_transition: up` is Material's fade-through and the setting worth
  having, because a plain cross-fade between two pages that share a wallpaper
  and a bar is invisible. `page_transition_ms` defaults to 180 ms rather than
  the browser's 250, which reads as slow for a change the reader just asked for.

- **Nav card: the bar can be shaped to taste.** `label_position` puts an entry's
  text below, above, right or left of its icon — the horizontal placements also
  widen the active pill so it wraps icon and text together. `label_size` sets
  the text size, with a larger default beside an icon than under one, where
  11 px is Material's figure for the secondary half of a stacked pair.
  `pill_size` scales the marker on its own, `inactive_only` is the missing
  inverse of `active_only` for labels and icons, and `edge_distance` sets how
  far a docked bar keeps from its screen edge — added on top of the device's
  safe area rather than replacing it, so no value can push the bar onto the
  gesture bar.

- **Nav card: the action button can open a menu.** Give `action_button` a `menu`
  and tapping it raises a stack of labelled pills out of the button, each with
  its own text, icon, colour and action, while the button itself morphs into the
  close control.

- **Button card: `shape_by_state`, `icon_off` and `icon_fill`** — the shape
  language a phone's quick settings use. With `shape_by_state` the outline
  follows the entity: a capsule while it is off, the configured corner radius
  while it is on, and the icon well going from a circle to a rounded square with
  it. `icon_off` gives a second icon for while the entity is off, since many
  symbols have a struck-through twin that reads as "not on" before any colour
  does. `icon_fill: solid` turns the active pairing inside out — the well takes
  the accent and the glyph is darkened against it, instead of a pale wash of the
  accent carrying an accent-coloured glyph.

- **Room card: `mode` and `cards`** — a room card can now hold Lovelace cards of
  its own. `auto` is what it has always done, discovering the area's devices and
  drawing a tile per category; `manual` draws none of that and leaves the body
  to the cards you put there. Two per row by default.

- **Room card editor: the nested cards are editable in the UI**, and each one
  opens its own editor. Not a hand-picked handful of fields — the card class is
  asked for its editor, the same contract Home Assistant itself uses, so a
  nested button card offers exactly what a button card offers. Entities can be
  added from a picker, reordered and removed.

- **Room card: `power_entities` and `door_entities`.** A room's consumption is
  usually the sum of its plugs, and the card could previously name only one
  sensor; `power_entities` adds several together, chosen from a picker. Doors
  get counted apart from windows and get a chip of their own, because a door
  standing open and a window standing open are different facts and a card that
  adds them together answers neither.

- **Room card: `scroll_on_expand`, `scroll_duration` and `collapse_memory`.** A
  collapsed card near the bottom of a view opens downwards, past the edge of the
  screen, so the thing you just asked to see is the thing you cannot see; it now
  scrolls itself into view, keeping clear of anything docked over the bottom of
  the window — a navigation bar from this suite included. `collapse_memory`
  decides how long the fold is remembered: on the device for good, as before, or
  only until the app is next started, so every start opens on the overview.

- **Every colour field can take the theme's colour, and now says so.** A card's
  colour has always accepted `primary`, which resolves to the theme's accent —
  under Material You, the tone generated from the wallpaper. It was a token you
  had to know; every colour row in every editor now offers it as a button.

- **Four shared modules** came out of the nav card and are available to the
  rest: `template-sub.ts` (one `render_template` subscription per unique
  template, ref-counted and shared between fields), `sheet-gesture.ts` (pointer
  drag with a velocity estimate and snap points), `tap-hold.ts` (tap, hold and
  double-tap told apart from each other and from a drag) and `card-helpers.ts`
  (hosting arbitrary Lovelace cards, with the two lifecycle rules that are easy
  to get wrong).

### Fixed

Thirty-six fixes, most of them the nav card being taken apart on a real phone.
The ones worth naming:

- **The active entry was one navigation behind.** The bar read the path when it
  was built, not when it painted, so it marked the page you had just left.

- **Tapping an entry could flash the page next to it.** Two separate causes: a
  dashboard swipe plugin decided on `touchend` from state it had gathered
  before the shield went up, and a cached view came back with the marker on the
  entry you had left for — with the correction animated, which made it a visible
  slide rather than an invisible one.

- **A docked bar spanned its own grid column, not the view**, and stopped short
  of both screen edges. The ancestor walk that finds the view was twelve levels
  deep, and every level of a Lovelace view crosses a shadow boundary.

- **`max_width: fit` never capped anything.** `min()` with a keyword is invalid
  at computed-value time, so the whole declaration was dropped.

- **The button card's corners barely moved until the end.** A browser clamps an
  over-large `border-radius` when painting but interpolates the number it was
  given, so animating from 999 px looked motionless for most of its duration.

- **A manual room card always read "all off".** The summary counted the area
  registry's entities, but manual mode exists precisely for rooms whose devices
  the registry does not know about.

- **A water or gas meter's month was off by a factor of a thousand.**
  Statistics were requested in m³ for the volume device classes while the value
  was labelled with the entity's own unit, so a litre meter's month read a
  thousandth of the truth — and the daily chart, which asks for no unit at all,
  disagreed with it.

- **`static_color` made a button card look switched off**, and the room card's
  accent was a fixed blue no theme could reach.

### Behaviour changes

No configuration option was removed or renamed, so existing configs load
unchanged. Three points change what you **see**:

- **M3 Room Card** takes its accent from the theme instead of the suite's fixed
  blue. Set `accent_color` to keep a colour of your own.
- **M3 Energy Card** shows the true figure for a water or gas meter over a month
  or a year. If yours read impossibly low, it was this, and the number will jump
  by a factor of a thousand.
- The suite registers **39 cards**.

---

**Deutsche Fassung**

Das Release der Navigation. `m3-nav-card` ist die neue Karte — eine
Navigationsleiste fürs Dashboard in fünf Varianten, einstellbar bis auf das
Niveau der Navbar Card aus der Community, aber in der Designsprache dieser
Sammlung. Drumherum sind drei ältere Karten erwachsen geworden: die Button-Karte
beherrscht die Formensprache der Schnelleinstellungen eines Telefons, die
Raumkarte kann beliebige Lovelace-Karten aufnehmen statt nur das, was sie selbst
findet, und jedes Farbfeld jeder Karte lässt sich an das Theme zurückgeben.

Drei weitere Karten kamen aus unerwarteter Richtung: Fabian Wendel
([UHaFnir](https://github.com/UHaFnir/m3-cards)) hat die Sammlung geforkt,
**Lights Overview**, **Chip Buttons** und **Group Card** in ihrer
Designsprache gebaut, die Wetterkarte erweitert und zwei Performance-Fehler
in Code gefunden, der hier schon lag. Alles davon steckt in dieser Version.
Die Sammlung registriert jetzt 39 Karten.

### Neu
- **M3 Nav-Karte** (`m3-nav-card`) — eine Navigationsleiste fürs Dashboard in
  fünf Varianten. `header` und `footer` docken an einen Bildschirmrand,
  `segmented` ist eine Pillengruppe im Fluss der Seite, `floating` löst sich zu
  einer abgerundeten Leiste, und `sheet` ergänzt eine Schublade, die sich über
  die Ansicht ziehen lässt. Die vier angedockten Varianten belegen keine Zeile
  im Raster: ihr Platz fällt zusammen, sie stellen sich selbst an den Bildschirm.

  Abzeichen je Eintrag nehmen eine Vorlage, den Zustand einer Entität oder die
  Anzahl eingeschalteter Entitäten — bei 0, aus, leer oder nicht verfügbar
  automatisch ausgeblendet. Aufklappmenüs wachsen aus dem Knopf, der sie
  geöffnet hat. Tippen, Halten und Doppeltippen bekommen je eine Aktion, und
  das Telefon bestätigt sie mit einem kurzen Vibrieren.

  Desktop und Handy haben getrennte Layouts, und die Leiste entscheidet anhand
  **ihrer eigenen Breite**, nicht der des Fensters. Liegt sie auf einem breiten
  Bildschirm in einer schmalen Spalte, weiß sie, dass sie schmal ist — der
  übliche Weg, der nach der Bildschirmbreite fragt, würde eine eingezwängte
  Leiste behandeln, als hätte sie den ganzen Bildschirm.

  `name`, `icon`, `color`, `hidden`, `disabled` und das Abzeichen nehmen eine
  Vorlage, man kann also berechnen, was ein Eintrag anzeigt, statt es fest
  einzutragen. Die Karte meldet jede Vorlage bei Home Assistant an, und das
  schickt einen neuen Wert, sobald sich eine darin vorkommende Entität ändert —
  ein Abzeichen aktualisiert sich von selbst, ohne Nachfragen. Angemeldet werden
  nur Felder, die wirklich eine Vorlage enthalten, und zwei Einträge mit
  derselben Vorlage teilen sich eine Anmeldung.

  Die Schublade wird gezogen, und das Interessante daran ist nicht das Ziehen,
  sondern der Konflikt mit dem Scrollen ihres Inhalts: der Inhalt scrollt ganz
  normal, und die Schublade übernimmt erst, wenn er schon oben steht und der
  Finger nach unten geht. Lässt man los, geht sie in die nächstgelegene Lage,
  offen oder zu — außer beim Schnippen, dann fliegt sie in die geworfene
  Richtung, gleich wo sie gerade stand.

- **Drei Karten aus einem Fork** — **M3 Lights Overview**
  (`m3-lights-overview-card`), **M3 Chip Buttons** (`m3-chip-buttons-card`) und
  **M3 Group Card** (`m3-group-card`), gebaut von Fabian Wendel
  ([UHaFnir](https://github.com/UHaFnir/m3-cards)) und hier übernommen.

  **Lights Overview** fasst alle Leuchten nach Bereich zusammen und gibt jedem
  Raum eine Kachel, die ihn schaltet — oder listet die Leuchten einzeln, auf
  Wunsch die eingeschalteten zuerst. Zwei getrennte Filter entscheiden, was ein
  Raum *zeigt* und was ein Tippen *schaltet*. Eine Lampe an einer Funksteckdose
  ist ein `switch` und kein `light`, deshalb erweitert `include_domains` die
  Suche, und ein Tippen schaltet über den allgemeinen Dienst — die Steckdose
  geht also wirklich an.

  **Chip Buttons** ist eine Reihe kompakter Pillen an Entitäten: je Pille
  wahlweise mit Zustand, in der Farbe der Entität, in einer festen Farbe, oder
  als reine Anzeige ohne Knopffunktion. Die Reihe scrollt seitlich und blendet
  ihre Kante auf der Seite aus, hinter der noch Pillen liegen.

  **Group Card** legt mehrere Karten auf eine gemeinsame Fläche mit einem
  Hintergrund und einer Rundung, damit Zusammengehöriges als ein Block gelesen
  wird statt als einzelne Kacheln.

- **Wetterkarte: Kopfbereich und Diagramm schalten unabhängig voneinander.**
  Eine Karte kann nur die aktuellen Werte zeigen, nur das Vorhersagediagramm
  oder beides. Die Stundenleiste hat Icons, Temperaturen, Uhrzeiten und eine
  Temperaturachse bekommen, jedes einzeln schaltbar. Icon, Temperatur und
  Uhrzeit teilen sich jetzt einen Takt, und die Leiste sitzt bündig in der
  Kachel — sie misst ihre eigene Breite, zeichnet jede 2., 3. oder 4. Stunde
  und kürzt die Reihe auf ein Vielfaches dieses Schritts, damit sie links wie
  rechts abschließt. Ebenfalls aus UHaFnirs Fork.


- **Nav-Karte: Markierung und Seite bewegen sich gemeinsam.**
  `marker_motion: slide` schiebt eine einzige Form zwischen den Einträgen, statt
  eine aus- und eine einzublenden — außer beim Ankommen, da steht die Markierung
  einfach schon richtig. `page_transition` blendet beim Wechsel aus der Leiste
  die ganze Ansicht über; `page_transition: up` ist Materials Fade-Through und
  die Einstellung, die sich lohnt, denn eine reine Überblendung zwischen zwei
  Seiten mit gleichem Hintergrundbild und gleicher Leiste sieht man nicht.
  `page_transition_ms` steht auf 180 ms statt der 250 des Browsers, die für eine
  gerade angeforderte Änderung träge wirken.

- **Nav-Karte: Die Leiste lässt sich formen.** `label_position` setzt den Text
  eines Eintrags unter, über, rechts oder links neben sein Icon — die
  waagerechten Varianten verbreitern auch die aktive Pille, sodass sie Icon und
  Text zusammen umfasst. `label_size` bestimmt die Textgröße, mit größerem
  Standardwert neben einem Icon als darunter, wo 11 px Materials Maß für die
  zweite Hälfte eines gestapelten Paars sind. `pill_size` skaliert die
  Markierung für sich, `inactive_only` ist die fehlende Umkehrung von
  `active_only` für Text und Icons, und `edge_distance` legt fest, wie weit eine
  angedockte Leiste vom Bildschirmrand wegrückt — additiv zum Sicherheitsbereich
  des Geräts, damit kein Wert die Leiste auf den Gestenbalken schieben kann.

- **Nav-Karte: Der Aktionsknopf kann ein Menü öffnen.** Bekommt `action_button`
  ein `menu`, hebt ein Tipp einen Stapel beschrifteter Pillen aus dem Knopf,
  jede mit eigenem Text, Icon, Farbe und Aktion, während der Knopf selbst zum
  Schließen-Knopf wird.

- **Button-Karte: `shape_by_state`, `icon_off` und `icon_fill`** — die
  Formensprache der Schnelleinstellungen eines Telefons. Mit `shape_by_state`
  folgt die Kontur der Entität: eine Kapsel im ausgeschalteten Zustand, der
  eingestellte Eckenradius im eingeschalteten, und das Icon-Feld wandert
  mit — vom Kreis zum abgerundeten Quadrat. `icon_off` gibt ein zweites Icon für
  den ausgeschalteten Zustand, denn viele Symbole haben einen durchgestrichenen
  Zwilling, und der sagt „nicht an", bevor es irgendeine Farbe tut.
  `icon_fill: solid` dreht die aktive Paarung um: das Feld nimmt die Akzentfarbe
  und das Symbol wird dagegen abgedunkelt, statt eines blassen Hauchs der
  Akzentfarbe mit akzentfarbenem Symbol darauf.

- **Raumkarte: `mode` und `cards`** — eine Raumkarte kann jetzt eigene
  Lovelace-Karten aufnehmen. `auto` ist, was sie immer getan hat: die Geräte des
  Bereichs finden und je Kategorie eine Kachel zeichnen. `manual` zeichnet davon
  nichts und überlässt den Rumpf den Karten, die man hineinlegt. Standardmäßig
  zwei pro Reihe.

- **Raumkarten-Editor: Die eingebetteten Karten sind in der Oberfläche
  bearbeitbar**, und jede öffnet ihren eigenen Editor. Keine handverlesene
  Auswahl an Feldern — die Kartenklasse wird nach ihrem Editor gefragt, nach
  demselben Vertrag, den Home Assistant selbst benutzt. Eine eingebettete
  Button-Karte bietet also genau das, was eine Button-Karte bietet. Entitäten
  lassen sich aus einer Auswahl hinzufügen, umsortieren und entfernen.

- **Raumkarte: `power_entities` und `door_entities`.** Der Verbrauch eines Raums
  ist meist die Summe seiner Steckdosen, und die Karte konnte bisher nur einen
  Sensor benennen; `power_entities` addiert mehrere, ausgewählt aus einer
  Entitätenliste. Türen werden getrennt von Fenstern gezählt und bekommen einen
  eigenen Chip — eine offene Tür und ein offenes Fenster sind verschiedene
  Tatsachen, und eine Karte, die beides zusammenzählt, beantwortet keine davon.

- **Raumkarte: `scroll_on_expand`, `scroll_duration` und `collapse_memory`.**
  Eine eingeklappte Karte am unteren Rand öffnet sich nach unten aus dem Bild
  heraus; ausgerechnet das, was man sehen wollte, sieht man dann nicht. Sie holt
  sich jetzt selbst ins Sichtfeld und lässt dabei Platz für alles, was unten am
  Fensterrand klebt — auch für eine Navigationsleiste aus dieser Sammlung.
  `collapse_memory` entscheidet, wie lange der Zustand gemerkt wird: dauerhaft
  auf dem Gerät wie bisher, oder nur bis zum nächsten Start der App, sodass
  jeder Start mit der Übersicht beginnt.

- **Jedes Farbfeld kann die Themefarbe übernehmen — und sagt das jetzt auch.**
  Die Farbe einer Karte akzeptiert seit jeher `primary`, was die Akzentfarbe des
  Themes auflöst — unter Material You der aus dem Hintergrundbild erzeugte Ton.
  Das war ein Schlüsselwort, das man kennen musste; jede Farbzeile in jedem
  Editor bietet es jetzt als Knopf an.

- **Vier gemeinsam genutzte Module** sind bei der Nav-Karte entstanden und
  stehen dem Rest zur Verfügung: `template-sub.ts` (ein
  `render_template`-Abonnement je eindeutiger Vorlage, mit Referenzzählung und
  von mehreren Feldern geteilt), `sheet-gesture.ts` (Zeigerbewegung mit
  Geschwindigkeitsschätzung und Rastpunkten), `tap-hold.ts` (Tippen, Halten und
  Doppeltippen voneinander und vom Ziehen unterschieden) und `card-helpers.ts`
  (Einbetten beliebiger Lovelace-Karten, mit den beiden Lebenszyklus-Regeln, die
  man leicht falsch macht).

### Behoben

Sechsunddreißig Korrekturen, die meisten davon die Nav-Karte, an einem echten
Telefon auseinandergenommen. Die nennenswerten:

- **Der aktive Eintrag hinkte einen Schritt hinterher.** Die Leiste las den Pfad
  beim Bauen statt beim Zeichnen und markierte so die gerade verlassene Seite.

- **Ein Tipp auf einen Eintrag konnte kurz die Nachbarseite aufblitzen lassen.**
  Zwei getrennte Ursachen: ein Wisch-Plugin des Dashboards entschied beim
  `touchend` anhand von Zuständen, die es vor dem Schutzschild gesammelt hatte,
  und eine zwischengespeicherte Ansicht kam mit der Markierung auf dem Eintrag
  zurück, den man verlassen hatte — wobei die Korrektur *animiert* war und
  dadurch als sichtbares Gleiten erschien statt als unsichtbare Richtigstellung.

- **Eine angedockte Leiste war so breit wie ihre Rasterspalte, nicht wie die
  Ansicht**, und schloss links und rechts nicht ab. Der Weg nach oben durch die
  Vorfahren war zwölf Ebenen tief, und in einer Lovelace-Ansicht überquert jede
  Ebene eine Shadow-Grenze.

- **`max_width: fit` hat die Leiste nie begrenzt.** `min()` mit einem
  Schlüsselwort ist zum Zeitpunkt der Wertberechnung ungültig, also fiel die
  ganze Deklaration weg.

- **Die Ecken der Button-Karte bewegten sich erst ganz am Ende.** Ein Browser
  begrenzt einen zu großen `border-radius` beim Zeichnen, interpoliert aber die
  Zahl, die er bekommen hat — eine Animation von 999 px wirkt deshalb den
  größten Teil ihrer Dauer bewegungslos.

- **Eine manuelle Raumkarte meldete immer „Alles aus".** Die Zusammenfassung
  zählte die Entitäten aus der Bereichsverwaltung — den manuellen Modus gibt es
  aber gerade für Räume, deren Geräte dort nicht eingetragen sind.

- **Der Monatswert eines Wasser- oder Gaszählers lag um den Faktor tausend
  daneben.** Für die Volumen-Geräteklassen wurde die Statistik in m³
  angefordert, beschriftet wurde der Wert aber mit der Einheit der Entität — ein
  Literzähler zeigte also ein Tausendstel, und die Tagesansicht, die gar keine
  Einheit anfordert, widersprach ihm.

- **`static_color` ließ eine Button-Karte ausgeschaltet aussehen**, und der
  Akzent der Raumkarte war ein festes Blau, an das kein Theme herankam.

### Achtung beim Update

Keine Konfigurationsoption wurde entfernt oder umbenannt — bestehende Configs
laden unverändert. Drei Punkte ändern, was man **sieht**:

- **M3 Room Card** nimmt ihren Akzent aus dem Theme statt aus dem festen Blau
  der Sammlung. Wer eine eigene Farbe will, setzt `accent_color`.
- **M3 Energy Card** zeigt für einen Wasser- oder Gaszähler über Monat oder Jahr
  den richtigen Wert. Wenn deiner unmöglich niedrig war, lag es daran, und die
  Zahl springt um den Faktor tausend.
- Die Sammlung registriert **39 Karten**.
