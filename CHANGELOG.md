# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
Versionierung folgt [SemVer](https://semver.org/lang/de/).

## [1.9.0]

### Neu
- **M3 Supply Card** (`custom:m3-supply-card`): Vorratsverwaltung für
  Verbrauchsmaterial. Ein Vorrat steht groß als Hero mit einem Punkt je
  verbleibender Einheit (ab 40 Stück ein Balken), Stepper mit Wiederholung
  beim Halten und ein „Packung nachgefüllt"-Knopf; weitere Vorräte folgen als
  Zeilen mit Füllstandsbalken, ein Tap macht sie zum Hero. Zustandsfarben und
  Schwellwerte sind pro Artikel einstellbar.
- Reichweiten-Schätzung aus der Historie des Helfers. Geteilt wird durch den
  Zeitraum, den die Daten tatsächlich abdecken, nicht durch das angefragte
  Fenster — der Recorder bewahrt standardmäßig nur 10 Tage auf, sonst
  verspräche die Karte die dreifache Reichweite. Eine Schätzung erscheint erst
  nach mindestens 3 Verbrauchsereignissen und 2 Tagen Beobachtung; wer sofort
  eine Zahl will, setzt `usage_per_week`.
- Benachrichtigung, wenn ein Vorrat zur Neige geht: als Abend-Digest mit allen
  Vorräten in einer Nachricht, wöchentlich oder sofort beim Unterschreiten.
  Auslöse-Niveau wählbar zwischen leer, kritisch und knapp, jeweils über die
  Schwellwerte des einzelnen Artikels. Über `notify_items` lässt sich die
  Meldung auf einzelne Vorräte begrenzen statt auf alle der Karte.
- Anbindung an die To-do-Listen von Home Assistant: ein Chip im Hero schreibt
  den Vorrat auf die Einkaufsliste, `auto_add_to_list` erledigt es ungefragt
  in der Automatisierung — inklusive Dublettenprüfung, damit eine tägliche
  Erinnerung die Liste nicht vollschreibt.

## [1.8.2]

### Behoben
- **Alle Karten mit Benachrichtigung** (Updates, Akku, Steckdosen, NAS): Die
  vom Editor erzeugte Automatisierung stürzte ab, sobald man sie im
  Automatisierungs-Menü von Hand ausführte — also genau bei dem Versuch, das
  Ankommen der Push zu testen. „Ausführen“ überspringt den Auslöser und
  startet die Aktionen ohne Auslöser-Kontext; jede Textvorlage las aber
  `trigger.to_state` und lief in einen `UndefinedError`, ohne dass eine
  Benachrichtigung rausging. Die Vorlagen greifen jetzt auf `s` zu — beim
  echten Auslöser die auslösende Entität, beim Handstart eine
  Beispiel-Entität. Bevorzugt wird eine, auf die die Bedingung gerade
  zutrifft, damit der Test die echte Formulierung mit echten Werten zeigt
  statt eines Geräts, dem nichts fehlt.
- **Versionsstempel**: `CARD_VERSION` stand seit dem ersten Release auf
  `1.0.0`. Die Konsolen-Zeile jeder Karte (`M3-BATTERY-CARD v1.0.0`) nannte
  damit eine Version, die es nie gab — ausgerechnet die Angabe, nach der man
  bei einer Fehlermeldung als Erstes fragt. Steht jetzt auf `1.8.2`.
- **Versionsstempel in der Konfiguration**: `stampVersion()` lief im
  `setConfig()` der Karte und beschrieb damit nur die Kopie im
  Arbeitsspeicher — gespeichert wurde der Stempel nie, kein einziges
  `card_version` landete je in einem Dashboard. Gestempelt wird jetzt beim
  Verlassen des Editors, also auf dem einzigen Weg, auf dem eine
  Konfiguration tatsächlich geschrieben wird.

- **M3 NAS Card**: Die Benachrichtigung ging nie raus — bei keinem Auslöser.
  Die Namenstabelle wurde als roher JSON-Text in `variables` geschrieben;
  Home Assistant reicht so etwas als Zeichenkette weiter, und der Zugriff
  `nas_names.get(...)` scheiterte an „NodeStrClass object has no attribute
  'get'“. In `{{ }}` gefasst rendert HA sie zu einem echten Dictionary.
- **M3 Updates Card**: Meldung und Liste sagten „Update“ doppelt („AdGuard
  Home Update: Update auf 6.2.1 verfügbar“, Zeile „M3 Cards Update“). Der
  `friendly_name` einer Update-Entität endet auf das Wort, das die Karte mit
  Überschrift und Versionsspalte ohnehin sagt. Add-ons und Integrationen
  liefern ein sauberes `title`-Attribut, HACS-Einträge nicht — dort wird die
  Endung jetzt abgeschnitten. Betrifft Einzelmeldung, Sammelmeldung, die
  Update-Liste und die Liste der nicht erreichbaren Komponenten, die einen
  Namen ab sofort alle gleich bilden.

## [1.8.1]

### Geändert
- Nur Dokumentation, keine Änderung am ausgelieferten `m3-cards.js` — das
  Bundle ist byte-identisch mit v1.8.0.
- Neues Übersichtsbild mit allen 22 Karten; das bisherige zeigte noch die
  ersten achtzehn.
- Eigene Screenshots für die M3 Updates Card, die M3 NAS Card und die
  M3 System Card in ihren jeweiligen Abschnitten.
- Die Bildunterschrift des Übersichtsbilds behauptete, alle Namen seien
  generische Demo-Daten. Das stimmte für die Aufnahme nicht; sie nennt jetzt
  die Karten, die für das Bild simulierte Zustände zeigen.

Grund für das Release: HACS rendert das README des veröffentlichten Stands,
nicht das des Standard-Branches. Die Bilder wurden nach dem Tag v1.8.0
ergänzt und waren dort deshalb nicht sichtbar.

## [1.8.0]

### Hinzugefügt
- **Neue Karte: M3 Updates Card** (`custom:m3-updates-card`). Übersicht aller
  verfügbaren Updates in einer Kachel.
  - **Header** in der gemeinsamen Designsprache der Listen-Karten: Icon
    links, Kartenname als Titel, Status als Untertitel („Alles aktuell“ /
    „{n} Updates verfügbar“ / „{name} wird installiert“) und ein Zähler-Chip
    rechts.
  - **Kern-Boxen** für Core, Betriebssystem und Supervisor mit
    `{installed} → {latest}`, MAJOR-Badge und Install-Button. Die
    MAJOR-Erkennung versteht beide Versionsschemata: bei
    HA-Kalenderversionen (`2026.8.1`) zählt der Wechsel von Jahr oder Monat,
    bei SemVer (`5.8.0`) die erste Zahl.
  - **Bestätigungsschritt** vor Kern-Updates (`require_confirm`, Standard an).
    Der Button entschärft sich nach fünf Sekunden von selbst — auf einem
    Wandtablet soll kein scharfer „startet-HA-neu“-Button liegenbleiben.
  - **Gruppierung über die Integration** statt über den `entity_id`-Namen. Bei
    eingebundener zweiter Instanz hätte eine Namensregel zwei
    ununterscheidbare Core-Boxen erzeugt; die zweite Instanz bekommt jetzt
    eine eigene Gruppe. Reihenfolge und Sichtbarkeit der Gruppen sind im
    Editor per Pfeiltasten bzw. `include_types` einstellbar.
  - **Backup-Chip** im Header (`backup_entity`), grün bis `backup_warn_days`,
    danach orange, ohne Zeitstempel rot.
  - **Übersprungene Updates** stehen gedimmt am Ende mit eigenem Button zum
    Wiederanzeigen — und zählen nicht mehr als „aktuell“.
  - **Aufklappbereich** für bereits aktuelle Komponenten, `max_visible` für
    die Update-Liste selbst.
  - **Benachrichtigung** sofort, täglich oder wöchentlich, mit denselben
    Freitextfeldern wie die übrigen Karten.
  - **Verbindungsverlust** während eines Core-Updates wird als solcher
    angezeigt statt als eingefrorenes Banner.
  - Nicht erreichbare Update-Entities zählen nicht als „aktuell“ und lassen
    sich unter den erreichbaren Komponenten aufklappen — mit Gruppe statt
    Version, damit sichtbar wird, welche Integration gerade nichts liefert.
- **Neue Karten: M3 NAS Card und M3 System Card** (`custom:m3-nas-card`,
  `custom:m3-system-card`). Speicherbelegung pro Volume mit Balken, darunter
  CPU, RAM, Temperatur und Netzwerk als Statuskacheln, dazu der Zustand der
  Syncthing-Ordner. Beide teilen sich eine Implementierung und unterscheiden
  sich nur in der Datenquelle: Glances für ein NAS, System Monitor für die
  eigene Instanz.
  - Entitäten werden über den `translation_key` der Entity-Registry erkannt,
    nicht über den Anzeigenamen — den übersetzt Home Assistant, eine
    Namensregel funktioniert nur in einer Sprache.
  - Fehlt ein Prozent-Sensor (System Monitor liefert `disk_use_percent`
    standardmäßig deaktiviert), wird die Belegung aus „belegt“ und „frei“
    berechnet, statt das Volume wegzulassen.
  - Laufwerkssensoren haben Vorrang vor SoC-Thermals — sonst zeigt die Karte
    49 °C, während die Platten bei 32 °C liegen.
  - Mount-Pfade werden gekürzt (`/rootfs` entfällt, UUID-Volumes werden zu
    „Volume a1b2c3d4“), `mount_names` überschreibt das.
  - **Benachrichtigungen** für Sync-Fehler (inklusive `pull_errors`, die auch
    bei Zustand `idle` auftreten), volle Platten und ausbleibende Daten.
    Pausierte Ordner lösen bewusst nichts aus.
- **Eigene Benachrichtigungstexte.** Jedes Benachrichtigungs-Panel hat jetzt
  zwei Freitextfelder für Titel und Nachricht. Leer lassen behält den
  bisherigen Text, sodass sich für bestehende Konfigurationen nichts ändert.
  Platzhalter in geschweiften Klammern werden beim Anlegen der
  Automatisierung durch die passende Vorlage ersetzt; welche es gibt, steht
  je Karte direkt unter den Feldern:
  - Energy: `{wert}`, `{einheit}`, `{zeitraum}`
  - Cost: `{betrag}`, `{waehrung}`, `{budget}`, `{zeitraum}`
  - Battery: `{anzahl}`, `{liste}`, `{geraet}`, `{wert}`
  - Progress: `{geraet}`
  - Power List: `{geraet}`, `{watt}`, `{stunden}`
  - Climate Overview / Top Consumers: `{anzahl}`, `{liste}`
  - Aquarium: `{tage}`
  Emoji sind möglich. Unbekannte Platzhalter bleiben sichtbar stehen, statt
  stillschweigend zu verschwinden — ein Tippfehler fällt so in der Nachricht
  auf, statt eine Lücke zu hinterlassen.

### Behoben
- **M3 Climate Overview Card**: Die Namen an der Vergleichsskala waren
  entweder alle weg oder unlesbar übereinander. Bis acht Räume wurde jeder
  Name gezeichnet — mittig auf seinem Punkt, ohne Prüfung, ob daneben schon
  einer steht; ab neun Räumen fiel die Beschriftung komplett weg. Liegen
  Räume dicht beieinander, überlagerten sich die Namen zu Buchstabensalat.
  Jetzt werden die Namen kollisionsfrei auf zwei Reihen verteilt: kältester
  und wärmster Raum zuerst, damit die Enden der Skala nie ihren Namen
  verlieren, der Rest von links nach rechts, solange Platz ist. Namen am
  Rand rutschen nach innen statt aus der Karte zu ragen. Neue Option
  `show_scale_labels`, falls nur die Punkte gewünscht sind.

## [1.7.0]

### Hinzugefügt
- **Benachrichtigungen direkt aus dem Kachel-Editor.** Acht Karten können
  jetzt eine echte Home-Assistant-Automatisierung anlegen, die auch
  benachrichtigt, wenn kein Dashboard geöffnet ist. Jede hat im Editor einen
  Abschnitt „Benachrichtigung" mit Ein/Aus-Schalter (standardmäßig aus),
  Empfängerauswahl aus den eigenen `notify.*`-Diensten und einer Statuszeile,
  die den tatsächlichen Zustand der Automatisierung anzeigt:
  - **M3 Battery Card** — schwache Batterien; täglich oder wöchentlich als
    Sammelnachricht, oder sofort beim Unterschreiten. Freier Schwellwert
    (Standard 1 %), plus `notify_exclude_entities`, um einzelne Geräte
    stummzuschalten, ohne sie aus der Kachel zu entfernen.
  - **M3 Energy Card** — Tagesertrag bzw. Monatsabschluss.
  - **M3 Cost Card** — Warnung bei fast erreichtem Budget (Standard 90 %)
    und Monatsabschluss.
  - **M3 Progress Card** — „Gerät ist fertig", ausgelöst nur beim echten
    Übergang von einem Lauf- in einen Fertig-Zustand.
  - **M3 Power List Card** — „Gerät läuft seit N Stunden", mit Schwellwert,
    Dauer und Ausschlussliste für Dauerläufer.
  - **M3 Climate Overview Card** — täglicher Digest zum Schimmelrisiko,
    exakt nach derselben Regel wie das Warnsymbol der Kachel.
  - **M3 Top Consumers Card** — Wochenrangliste, sofern die Verbraucher über
    wöchentliche `utility_meter`-Helfer laufen (siehe Einschränkung unten).
  - **M3 Aquarium Card** — die bestehende Reinigungs-Erinnerung nutzt jetzt
    dieselbe Basis und denselben Schalter.

### Geändert
- Die Benachrichtigungs-Mechanik liegt jetzt in einem gemeinsamen Modul
  (`shared/notify-editor.ts`) statt je Karte dupliziert zu sein.
- Das Empfängerfeld hieß „Benachrichtigung an", was sich im Deutschen wie
  ein Ein-Schalter liest. Es heißt jetzt „Empfänger".

### Behoben
- **M3 Power List Card**: Mit gesetztem `max_visible` wurden alle
  ausgeblendeten Geräte als inaktiv behandelt — auch die, die gerade Strom
  verbrauchen und nur wegen des Limits nach unten gerutscht sind. Sie
  erschienen ausgegraut mit durchgestrichenem Stecker-Symbol, und der Zähler
  am Umschalter zählte sie als „inaktive Geräte" mit. Aktive Geräte behalten
  jetzt auch aufgeklappt ihre normale Darstellung und stehen dort oben; der
  Umschalter heißt in dem Fall „N weitere Geräte anzeigen".
- **M3 Power List Card**: Die Balkenlängen richten sich jetzt nach dem
  stärksten Verbraucher insgesamt statt nur nach dem der sichtbaren Zeilen —
  bei Sortierung nach Name oder aufsteigender Leistung konnte der größte
  Verbraucher sonst aus der Skala fallen.
- **M3 Battery Card**: `notify_service` war als Konfigurationsfeld
  deklariert, wurde aber nirgends ausgewertet und hatte keine Wirkung.
- Automatisierungs-IDs wurden aus dem Kartennamen abgeleitet, wodurch zwei
  gleichnamige Karten dieselbe Automatisierung überschrieben. Sie werden
  jetzt einmalig erzeugt und in der Kartenkonfiguration abgelegt; bestehende
  Automatisierungen werden dabei übernommen, nicht verwaist.
- **M3 Energy Card**: Der Meldungstext behauptete „Heute verbraucht", sobald
  die Karte nicht ausdrücklich im Solar-Modus lief — falsch für den
  häufigen Fall, eine Standard-Karte auf einen Erzeugungszähler zu richten.
  Der Text ist jetzt neutral („Heute:"), im Solar-Modus weiterhin „Heute
  erzeugt:".

### Einschränkungen
Ein Jinja-Template in einer Automatisierung kann die Langzeitstatistik nicht
lesen — nur den aktuellen Zustand einer Entität. Energy, Cost und Top
Consumers beziehen ihre Zahlen aber genau daher. Diese drei funktionieren
deshalb nur, wenn eine Entität den Periodenwert bereits als Zustand hält,
also ein periodengebundener `utility_meter`. Ist das nicht der Fall, bleibt
der Schalter gesperrt und der Editor nennt den Grund, statt eine
Automatisierung zu erzeugen, die plausible, aber falsche Zahlen meldet.

## [1.6.0]

### Hinzugefügt
- **M3 Aquarium Card**: Reinigungs-Erinnerung direkt aus dem Kachel-Editor.
  Im Abschnitt „Wartung → Erinnerung“ lassen sich ein oder mehrere
  Benachrichtigungsziele (aus den eigenen `notify.*`-Diensten) und eine
  tägliche Prüfzeit wählen; ein Klick auf „Erinnerung einrichten“ legt eine
  echte Home-Assistant-Automatisierung an, die auch dann benachrichtigt,
  wenn kein Dashboard geöffnet ist. Fehlt ein Intervall-Helfer, wird er
  automatisch mit angelegt. Erneutes Klicken aktualisiert dieselbe
  Automatisierung, statt Duplikate zu erzeugen.
- **M3 Aquarium Card**: neue Option `cleaning_interval_entity` — ein
  `input_number`-Helfer als Reinigungsintervall. Hat Vorrang vor der festen
  Zahl und wird von Kachel-Chip und Erinnerungs-Automatisierung gemeinsam
  gelesen, sodass beide nicht auseinanderlaufen können.

## [1.5.0]

### Hinzugefügt
- **M3 Aquarium Card** (`custom:m3-aquarium-card`) — neue Karte:
  Geräte-Raster (Taglicht, Nachtlicht, Pumpe, Heizer, CO2 + beliebig
  viele weitere Geräte), Tagesbogen-Beleuchtungsplan (manuelle
  Phasenliste oder `schedule`-Helfer), optionale Kamera als Standbild,
  Banner oder echter Live-Stream, Status-Chips (Temperaturabweichung,
  Heizer ohne Leistung, Wasserstand, pH/TDS, fällige Reinigung) und
  vollständiger visueller Editor.
- **M3 Climate Overview Card**: individuelle Farbe pro Raum
  (`rooms[].color`) — überschreibt die automatische Temperatur-Einfärbung
  für einzelne Thermometer, statt nur die fünf globalen Farbstufen zu
  nutzen.
- **Farbstärke-Regler**: jede Karte, die eine Akzent-/Themenfarbe als
  Hintergrund-Tönung verwendet, hat jetzt einen 0–100-Regler direkt neben
  der Farbauswahl im Editor, der steuert, wie kräftig diese Farbe den
  Hintergrund einfärbt (ersetzt die bisher fest einprogrammierten
  Prozentwerte). Unveränderte Karten sehen dabei exakt wie vorher aus —
  der Regler startet immer beim bisherigen Standardwert.
- Deutsche Farbnamen (`grau`, `rot`, `blau`, `grün`, `gelb`, `lila`/
  `violett`, `rosa`, `braun`, `schwarz`, `weiß`, `türkis`, `hellblau`,
  `hellgrün`, `dunkelgrau`) werden jetzt in jedem Farbfeld erkannt, nicht
  nur die englischen Namen.

### Behoben
- **M3 Climate Overview Card**: die Editor-Option „Akzentfarbe“ hatte
  keinerlei Effekt — sie wurde beim Rendern der Karte nie ausgelesen.
  Färbt jetzt korrekt das Header-Icon ein.
- Ein deutscher Farbname wie `grau` in einem Farbfeld ergab bisher keine
  gültige CSS-Farbe und ließ den betroffenen Hintergrund komplett
  durchsichtig werden, statt eine sichtbare Fehlermeldung oder zumindest
  eine erkennbare Farbe zu liefern (siehe „Hinzugefügt“ oben).
- Energie-Statistiken (u.a. Energy-, Cost-, Power-Karten): ein negativer
  „Change“-Wert für einen Zeitraum wird jetzt auf 0 begrenzt, statt
  Balken/Durchschnitte/Summen zu verfälschen — trat vereinzelt auf, wenn
  der Recorder beim Neuladen einer Entität genau an einer Tagesgrenze die
  Kontinuität der Langzeitstatistik verliert und den Wert nach einem
  Zähler-Reset fälschlich als Abnahme statt als neuen Zyklus verbucht.

## [1.4.0]

### Hinzugefügt
- **M3 Counter Card**: neuer Editor-Abschnitt „Kalibrierung“ für
  `utility_meter`-Entitäten — Zählerstand direkt aus dem Dashboard-Editor
  auf einen neuen Wert setzen (z.B. um ihn an einen analogen Zähler
  anzugleichen), ohne Umweg über die Entwicklerwerkzeuge. Erscheint
  automatisch nur bei passenden Entitäten, die Statistik-Historie bleibt
  unangetastet.

### Geändert
- **M3 Energy Card**: die Monatsansicht zeigt jetzt immer alle 12 Monate
  (mit Null für Monate vor Erstellung der Entität) statt bei fehlender
  Historie komplett zu blockieren — verhält sich damit wie länger
  bestehende Zähler.
- **M3 Energy Card**: der Monats-Durchschnitt wird nur noch über Monate mit
  echten Daten gemittelt, statt durch Platzhalter-Nullen vor Erstellung der
  Entität verwässert zu werden.

## [1.3.0]

### Hinzugefügt
- **M3 Energy Card**: neue Option `unit`, um die angezeigte Einheit zu
  überschreiben — nötig für abgeleitete Zähler (z.B. Utility-Meter-Helfer),
  die keine eigene `unit_of_measurement` melden und sonst pauschal "kWh"
  anzeigen würden.

## [1.2.0]

### Hinzugefügt
- **M3 Cost Card**: neuer Preis-Einheit-Modus `custom` — frei definierbare
  Einheit (z.B. "€/m³") plus ein Mengen-Umrechnungsfaktor, damit die Karte
  auch für Wasser, Gas oder beliebige andere Zähler funktioniert, nicht nur
  für kWh-Strompreise.

## [1.1.0]

### Hinzugefügt
- **M3 Climate Overview Card** — raumweise Übersicht aller Temperatur-/
  Feuchte-Sensoren, automatisch gruppiert nach Bereich (Fallback: Gerät
  oder Entity-Name), mit Farbstufen, Vergleichsskala, Hinweis-Chip für
  den auffälligsten Raum sowie optionalen Trendpfeilen und
  Schimmel-Warnungen.
- **M3 Light Card**: echte Farbtemperatur-Steuerung (Presets + Slider),
  HS-Farbrad mit Palette, Szenen-Zeile und Gruppenmitglieder-Liste für
  Licht-Gruppen — inkl. vollständiger Editor-Unterstützung.
- **M3 Energy Flow Card**: Batterie-Knoten im Fluss-Diagramm, `battery_color`
  und `show_battery` sind jetzt tatsächlich wirksam.

### Geändert
- M3 Climate Card und M3 Energy Flow Card nutzen jetzt das gemeinsame
  Erscheinungsbild-Panel im Editor (Eckenradius-Presets, Ecken einzeln).
- Englisches README ist jetzt Standard, Deutsch liegt unter `README.de.md`.

## [1.0.0] — Erste Veröffentlichung (Beta)

Erste öffentliche Version.
