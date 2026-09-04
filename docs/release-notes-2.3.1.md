# M3 Cards 2.3.1

A hotfix for the nav card. Everything here was found within hours of 2.3.0
by someone building their first navigation bar, and every one of it sat in
the way of doing exactly that.

**Upgrading:** nothing was renamed or removed, so existing configs load
unchanged. One thing looks different without having been asked for: a nav card
you add from now on starts as a floating bar rather than a docked footer. Cards
already on a dashboard are untouched.

### Fixed

- **The drawer stopped responding after the editor was saved.** A pull-up
  sheet would not open — by tap or by drag — until the page was reloaded.
  Saving re-renders the card and Lit hands the drawer fresh elements, but the
  gesture kept its listeners on the discarded ones, and the code that wires
  them up returned early because a gesture object already existed. Events
  arrived at nodes nobody was listening to. It now compares the grip it is
  bound to against the one on screen, and rebinds when they differ.

- **The target page had to be typed from memory.** Every entry meant recalling
  a path like `/lovelace/garten`. It is a list of this dashboard's own views
  now, labelled "Energie — /lovelace/energie", at all four places a path is
  asked for — entries, submenu entries, drawer tiles, action-menu entries. A
  path the list cannot know is still typeable. Choosing one also fills in the
  name and icon from that view, leaving anything already written alone.

- **The round action button appeared on variants that have no place for it.**
  It is a companion to a detached pill. On `header` and `footer`, which span a
  screen edge, and on `segmented`, which runs in the content flow, it read as a
  stray dot that had fallen off the bar. Those three no longer draw one and the
  editor stops offering it; what it would have held becomes ordinary entries at
  the end of the bar, which already scrolls rather than clipping. On `sheet` the
  entries go into the drawer instead, which is what the drawer is for.

- **The pull-up sheet spanned the whole screen.** Shut it hugged its entries;
  pulled up it snapped to the full width, which on a wide monitor spread its
  tiles across the glass and read as a different object from the one just
  tapped. It keeps the bar's width now, open or shut.

- **A docked bar spilled out of its frame in the editor.** There the bar is
  drawn in the flow, inside a frame the dashboard column sizes — eight entries
  are wider than that, and the bar simply ran out past the dashed edge. It
  scrolls inside the frame, as it already does on screen.

### Changed

- **A new nav card starts as a floating bar with its labels beside the icons**,
  rather than docked with them underneath — the shape a phone's own navigation
  uses. Only what a newly added card starts with changed; an existing card that
  never named a style still falls back to `footer`, so nothing moves on a
  dashboard that was already set up.

- **Every card's reference section folds behind a summary in the README**, not
  only the three adopted in 2.3.0. Each card keeps its description and its
  screenshot visible; the YAML, the sub-sections and the options table collapse.
  Those three cards were also missing from the card index entirely.

### Behoben

- **Die Schublade reagierte nach dem Speichern des Editors nicht mehr.** Ein
  Pull-up-Sheet ließ sich weder antippen noch hochziehen, bis die Seite neu
  geladen wurde. Beim Speichern zeichnet Lit die Karte neu und gibt der
  Schublade frische Elemente; die Geste behielt ihre Lauscher auf den
  weggeworfenen, und die Stelle, die sie anhängt, stieg vorzeitig aus, weil ja
  schon eine Geste existierte. Die Ereignisse kamen bei Knoten an, an denen
  niemand horchte. Die Karte vergleicht jetzt den Griff, an dem sie hängt, mit
  dem gerade gezeichneten, und bindet sich bei Abweichung neu.

- **Die Zielseite musste aus dem Gedächtnis getippt werden.** Jeder Eintrag
  hieß, einen Pfad wie `/lovelace/garten` zu erinnern. Jetzt ist es eine Liste
  der Ansichten dieses Dashboards, beschriftet als „Energie —
  /lovelace/energie", an allen vier Stellen, an denen ein Pfad gefragt wird —
  Einträge, Untermenü, Schubladen-Kacheln, Aktionsmenü. Ein Pfad, den die Liste
  nicht kennen kann, lässt sich weiterhin eintippen. Die Auswahl füllt zudem
  Beschriftung und Icon aus der Ansicht, ohne bereits Geschriebenes anzutasten.

- **Der runde Aktionsknopf erschien bei Varianten, die keinen Platz dafür
  haben.** Er ist der Begleiter einer freistehenden Pille. Bei `header` und
  `footer`, die an einer Bildschirmkante liegen, und bei `segmented`, das im
  Fluss der Seite steht, wirkte er wie ein Punkt, der von der Leiste abgefallen
  ist. Diese drei zeichnen ihn nicht mehr, und der Editor bietet ihn dort nicht
  an; was er enthalten hätte, wird zu normalen Einträgen am Ende der Leiste,
  die bei Überlauf ohnehin scrollt. Beim `sheet` wandern die Einträge
  stattdessen in die Schublade — wofür sie da ist.

- **Das Pull-up-Sheet spannte über den ganzen Bildschirm.** Zugeklappt
  schmiegte es sich an seine Einträge, hochgezogen sprang es auf die volle
  Breite und verteilte seine Kacheln auf einem breiten Monitor über die ganze
  Fläche — als wäre es ein anderes Ding als das eben angetippte. Es behält
  jetzt die Breite der Leiste, auf wie zu.

- **Eine angedockte Leiste lief im Editor aus ihrem Rahmen.** Dort wird sie im
  Fluss gezeichnet, in einem Rahmen, dessen Breite die Dashboard-Spalte
  bestimmt — acht Einträge sind breiter als das, und die Leiste lief schlicht
  über die gestrichelte Kante hinaus. Sie scrollt jetzt innerhalb des Rahmens,
  so wie sie es am Bildschirm längst tut.

### Geändert

- **Eine neu eingefügte Nav-Karte startet als schwebende Leiste mit den
  Beschriftungen neben den Icons** statt angedockt mit Text darunter — die
  Form, die die Navigation eines Telefons selbst verwendet. Geändert hat sich
  nur, womit eine **neue** Karte beginnt; eine bestehende ohne ausdrückliche
  Variante fällt weiterhin auf `footer` zurück, damit auf einem eingerichteten
  Dashboard nichts verrutscht.

- **Im README klappt der Referenzteil jeder Karte hinter eine Zusammenfassung**,
  nicht nur bei den drei aus 2.3.0 übernommenen. Beschreibung und Screenshot
  bleiben sichtbar; YAML, Unterabschnitte und Optionstabelle klappen weg. Jene
  drei Karten fehlten außerdem vollständig im Kartenverzeichnis.
