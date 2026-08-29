## Achtung beim Update

Keine Konfigurationsoption wurde entfernt oder umbenannt — bestehende Configs laden unverändert. Diese Punkte ändern aber das Verhalten, ohne dass man etwas anpasst:

- **Media Card**: Die rechte Zeitangabe zeigt die **Restzeit mit Minuszeichen** statt der Gesamtdauer (`time_display: total` stellt es zurück), führende Tracknummern verschwinden aus dem Titel (`strip_track_number: false`), und bei Playern mit `BROWSE_MEDIA` erscheint die Bibliothekszeile — **die Karte wird dadurch höher** und kann Layouts verschieben (`show_browser: false`).
- **Button Card mit `show_slider: true`**: Ein Tap setzt jetzt den Wert an der getippten Position, statt zu schalten. Zum Schalten dient das Icon, dessen Standardaktion im Slider-Modus auf den Domänen-Toggle wechselt (`icon_tap_action: more-info` stellt More-Info zurück). Karten **ohne** `show_slider` sind nicht betroffen.

## Neu

Sechs neue Karten — die Suite wächst von 23 auf 29.

**M3 Cover Card** (`custom:m3-cover-card`) — Rollladen- und Abdeckungssteuerung, die sich an die Fähigkeiten der Entität anpasst: Position, Lamellen-Neigung oder nur Auf/Zu, je nach `supported_features`. Einzel- und Gruppenmodus. Für Geräte ohne eigene Cover-Entität — etwa FingerBot-Antriebe an getrennten Schaltern — gibt es den `switch_pair`-Modus mit Auf-/Ab-/(optional) Stopp-Schalter; wo das Gerät keine Rückmeldung liefert, zeigt ein kurzes Tastenfeedback den ausgelösten Befehl.

**M3 Leak Card** (`custom:m3-leak-card`) — Überblick über Feuchte- und Leck-Sensoren mit den Zuständen OK, Alarm und „veraltet" (kein aktuelles Update). Optionaler Absperr-Knopf, der die Domäne der Absperr-Entität erkennt (`valve` / `switch` / `cover`), auf Wunsch mit Bestätigung. Optionale Benachrichtigung bei Wasseralarm.

**M3 Waste Card** (`custom:m3-waste-card`) — Abfuhrtermine als Hero mit „nächste Abfuhr in N Tagen", einer Zeitleiste über die nächsten zwei Wochen und einer Zeile je Tonne. Info- und Erinnerungsmodus, Hero-Icon einzeln oder mehrfach („N Tonnen"). Optionale Erinnerung zum Rausstellen zur eingestellten Uhrzeit. Erwartet Sensoren mit den Tagen bis zur Abfuhr, etwa aus der Integration Waste Collection Schedule.

**M3 Occupancy Card** (`custom:m3-occupancy-card`) — Belegung nach Räumen statt nach einzelnen Sensoren. Fasst Präsenz- und Bewegungssensoren je Raum zusammen, zeigt „X von Y Räumen belegt" und je Raum „belegt/frei seit …". Automatische Erkennung über Bereiche oder eine manuelle Sensorliste.

**M3 Time Card** (`custom:m3-time-card`) — Bearbeitet `input_datetime`-Helfer im Designsystem des Projekts, wahlweise als Stepper-Felder oder Scroll-Räder.

**M3 Todo Card** (`custom:m3-todo-card`) — Einkaufs- und Aufgabenlisten als Ersatz für HAs eingebaute `todo-list`-Karte. Einträge landen wahlweise oben oder unten (`add_position`), Dubletten werden abgefangen: statt einer zweiten identischen Zeile pulst der vorhandene Eintrag kurz auf. Schnellwahl-Chips speisen sich aus einer festen Liste, aus zuvor abgehakten Einträgen oder aus den M3 Supply Cards des Dashboards — der knappste Vorrat zuerst. Langes Drücken öffnet eine Zeile zum Umbenennen oder Löschen.

Dazu eine gemeinsame Benachrichtigungs-Infrastruktur für Occupancy-, Leak- und Waste-Karte: ein Panel im Editor mit Dienst-Auswahl, optionalem Titel und Text. Es legt eine — standardmäßig deaktivierte — Automatisierung an.

## Die Media Card, überarbeitet

**Bibliothek und Warteschlange.** Meldet der Player `BROWSE_MEDIA`, öffnet eine Zeile am Fuß der Karte den Medienbrowser von Home Assistant: Breadcrumb-Navigation, Vorschaubild oder Icon je Zeile, Ordner zum Hineinnavigieren, abspielbare Einträge per Tap. Ein zweiter Reiter zeigt die Warteschlange, sofern die Integration eine liefert — Cast und Spotify tun das nicht und bekommen den Reiter gar nicht erst, statt ihn leer anzuzeigen.

**Metadaten und Chips.** Titel über zwei Zeilen, Interpretenzeile mit Radio-Fallback über `media_channel`, dritte Zeile mit Album und Jahr. Darunter Chips für Ausgabegerät und Quelle. Führende Tracknummern verschwinden aus dem Titel (`07 - Enjoy the Silence` → `Enjoy the Silence`), ohne Titel wie `1979` oder `365 Dreams` anzutasten. Player ohne Metadaten — etwa ein Chromecast mit dem Default Media Receiver — greifen auf den Dateipfad zurück.

**Fortschritt.** Wellen-Indikator, der beim Pausieren flach ausläuft, sodass der Balken selbst den Wiedergabezustand trägt. Streams ohne Dauer zeigen ein wanderndes Segment und einen „Live"-Chip. Restzeit mit Minuszeichen, umschaltbar über `time_display`. Spulen per Ziehen.

**Transportleiste.** Reihenfolge Shuffle · Zurück · Play/Pause · Vor · Repeat. Der Play-Knopf ist der Zustandsanzeiger: Kreis pausiert, Squircle beim Abspielen, mit überblendendem Symbol. Repeat läuft dreistufig (aus → alle → einer). Knöpfe erscheinen weiterhin nur, wenn der Player das Feature meldet.

**Akzentfarbe aus dem Cover.** Bisher der Durchschnitt aller Pixel — also Hintergrund plus Motiv addiert, meist ein entsättigter Braunton. Jetzt wird die dominante gesättigte Farbe gewählt und auf lesbaren Kontrast gebracht. Ein Cover, das vorher ein praktisch unsichtbares Symbol ergab, liefert nun ein klar erkennbares Violett.

## Leistung

Zwei Animationen bauten bei **jedem Einzelbild die komplette Karte neu auf**, statt nur den animierten Pfad zu zeichnen. Bei der Light Card erzeugte eine einzige Instanz mit eingeschalteter Lampe **1820 Renders in 15 Sekunden** — 73 % eines Dashboards mit 35 Karten. Nach der Korrektur sind es 9. Die Media Card hatte dieselbe Ursache im Fortschrittsbalken.

Zusätzlich filtern 15 der 29 Karten jetzt überflüssige Neuzeichnungen: Home Assistant reicht jedem Element bei **jeder** Zustandsänderung im gesamten System ein neues `hass`-Objekt, sodass bisher jede Karte bei jedem fremden Sensor neu rendert. Umgestellte Karten zeichnen nur noch, wenn eine ihrer eigenen Entitäten sich ändert.

## Weitere Änderungen

- **M3 Button Card**: Der Slider übernimmt jetzt auch beim Tippen, nicht nur beim Ziehen, und bleibt bei ausgeschaltetem Licht bedienbar.
- Drags auf Slidern und Rädern werden von Swipe-Plugins des Dashboards abgeschirmt, damit ein seitlicher Wisch nicht die Ansicht wechselt.
- **M3 Counter Card**: Optionale Korrektur des Zählerstands direkt im Header.
- Alle Icon-Knöpfe der Media Card haben jetzt lokalisierte Beschriftungen für Screenreader.
- README von Grund auf neu strukturiert: ein Katalog nach Themenbereichen, je Karte Code, Erklärung und ein eigenes Bild.

Die vollständige Liste steht in [CHANGELOG.md](CHANGELOG.md).

---

## Before you update

No configuration option was removed or renamed — existing configs load unchanged. These do change behaviour without any edit on your side:

- **Media card**: the right-hand time shows **remaining, with a minus sign**, rather than the total length (`time_display: total` restores it), leading track numbers drop out of titles (`strip_track_number: false`), and players reporting `BROWSE_MEDIA` gain the library row — which makes **the card taller** and may reflow a dashboard (`show_browser: false`).
- **Button card with `show_slider: true`**: a tap now sets the value at the pressed position instead of toggling. Toggling moves to the icon, whose default action in slider mode becomes the domain's toggle (`icon_tap_action: more-info` restores more-info). Cards **without** `show_slider` are unaffected.

## New

Six new cards — the suite grows from 23 to 29.

**M3 Cover Card** (`custom:m3-cover-card`) — Blind and cover control that adapts to what the entity can do: position, tilt, or just open/close, depending on `supported_features`. Single and group mode. For devices without a cover entity of their own — FingerBot actuators on separate switches, say — there is a `switch_pair` mode with up/down/(optional) stop switches; where the device reports nothing back, a brief button feedback shows which command was sent.

**M3 Leak Card** (`custom:m3-leak-card`) — An overview of moisture and leak sensors with OK, alarm and "stale" states (no recent update). Optional shut-off button that detects the domain of the shut-off entity (`valve` / `switch` / `cover`), with confirmation if you want it. Optional notification on a water alarm.

**M3 Waste Card** (`custom:m3-waste-card`) — Collection dates as a hero reading "next collection in N days", a timeline across the next two weeks, and a row per bin. Info and reminder modes, with a single hero icon or several ("N bins"). Optional reminder to put the bins out at a set time. Expects sensors carrying the days until collection, for instance from the Waste Collection Schedule integration.

**M3 Occupancy Card** (`custom:m3-occupancy-card`) — Occupancy by room rather than by individual sensor. Groups presence and motion sensors per room, showing "X of Y rooms occupied" and, per room, "occupied/free since …". Detects rooms from HA areas, or takes a manual sensor list.

**M3 Time Card** (`custom:m3-time-card`) — Edits `input_datetime` helpers in the project's design language, either as stepper fields or scroll wheels.

**M3 Todo Card** (`custom:m3-todo-card`) — Shopping and task lists, as a replacement for HA's built-in `todo-list` card. Entries land at the top or the bottom (`add_position`), and duplicates are caught: instead of a second identical row, the existing entry pulses. Quick-add chips draw from a fixed list, from previously completed entries, or from the dashboard's M3 Supply Cards — scarcest supply first. A long press opens a row for renaming or deleting.

Alongside them, shared notification plumbing for the occupancy, leak and waste cards: a panel in the editor with a service picker and an optional title and message. It creates an automation, disabled by default.

## The media card, reworked

**Library and queue.** Where the player reports `BROWSE_MEDIA`, a row at the bottom of the card opens Home Assistant's own media browser: breadcrumb navigation, a thumbnail or icon per row, folders to drill into, playable entries that start on tap. A second tab lists the queue where the integration exposes one — Cast and Spotify do not, and simply do not get that tab rather than showing an empty one.

**Metadata and chips.** Title across two lines, an artist line falling back to `media_channel` for radio, and a third line with album and year. Below them, chips for the output device and the source. Leading track numbers drop out of the title (`07 - Enjoy the Silence` → `Enjoy the Silence`) without touching titles like `1979` or `365 Dreams`. Players that report no metadata — a Chromecast on the Default Media Receiver, for instance — fall back to the file path.

**Progress.** A wave indicator that flattens out when playback pauses, so the bar itself carries the play state. Streams with no duration show a travelling segment and a "Live" chip. Remaining time with a minus sign, switchable via `time_display`. Seeking by dragging.

**Transport bar.** Ordered shuffle · previous · play/pause · next · repeat. The play button is the state indicator: a circle when paused, a squircle while playing, with the glyph cross-fading between them. Repeat cycles through three states (off → all → one). Buttons still appear only when the player reports the matching feature.

**Accent colour from the artwork.** Previously the mean of every pixel — a cover's backdrop and its subject added together, which on most covers is a desaturated brown. Now the dominant saturated colour is picked and brought to a legible contrast. A cover that used to produce an all-but-invisible glyph now yields a clearly readable purple.

## Performance

Two animations rebuilt **the entire card on every frame** instead of redrawing just the animated path. On the light card, a single instance with a light switched on produced **1820 renders in 15 seconds** — 73% of a 35-card dashboard's total. After the fix it is 9. The media card had the same cause in its progress bar.

On top of that, 15 of the 29 cards now filter pointless redraws: Home Assistant hands every element a fresh `hass` object on **every** state change anywhere in the system, so until now each card re-rendered whenever any unrelated sensor moved. Converted cards redraw only when one of their own entities changes.

## Other changes

- **M3 Button Card**: the slider now commits on a tap as well as a drag, and stays usable when a light is off.
- Drags on sliders and wheels are shielded from dashboard swipe plugins, so a sideways flick no longer switches the view.
- **M3 Counter Card**: optional correction of the meter reading directly in the header.
- Every icon button on the media card now carries a localized screen-reader label.
- The README has been restructured from the ground up: a catalogue by topic, with code, an explanation and its own image per card.

The full list is in [CHANGELOG.md](CHANGELOG.md).
