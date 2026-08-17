# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
Versionierung folgt [SemVer](https://semver.org/lang/de/).

## [1.6.1]

### Behoben
- **M3 Power List Card**: Mit gesetztem `max_visible` wurden alle
  ausgeblendeten Geräte als inaktiv behandelt — auch die, die gerade
  Strom verbrauchen und nur wegen des Limits nach unten gerutscht sind.
  Sie erschienen im Aufklappbereich ausgegraut mit durchgestrichenem
  Stecker-Symbol, und der Zähler am Umschalter zählte sie als „inaktive
  Geräte" mit. Aktive Geräte behalten jetzt auch im Aufklappbereich ihre
  normale Darstellung (Geräte-Icon, Balken, Akzentfarbe) und stehen dort
  oben, die tatsächlich inaktiven darunter. Der Umschalter heißt in
  diesem Fall „N weitere Geräte anzeigen" statt „N inaktive Geräte
  anzeigen"; ohne `max_visible` bleibt der bisherige Text.
- **M3 Power List Card**: Die Balkenlängen richten sich jetzt nach dem
  stärksten Verbraucher insgesamt statt nur nach dem stärksten der
  sichtbaren Zeilen — dadurch bleiben aufgeklappte Zeilen vergleichbar,
  und bei Sortierung nach Name oder aufsteigender Leistung kann der
  größte Verbraucher nicht mehr aus der Skala fallen.

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
