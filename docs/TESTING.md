# Test-Matrix

Manuelle QA-Checkliste für die M3-Card-Suite. Es gibt keine automatisierten UI-Tests
(Lit-Komponenten mit `hass`/WebSocket-Abhängigkeiten lassen sich nur mit
unverhältnismäßigem Aufwand sinnvoll unit-testen) — vor jedem Release wird stattdessen
diese Liste live in einer echten Home-Assistant-Instanz durchgegangen.

`npx tsc --noEmit` und `npm run build` müssen davor beide sauber durchlaufen; das
ersetzt aber keinen manuellen Durchlauf, da beide nichts über Laufzeitverhalten,
WebSocket-Antworten oder visuelles Rendering aussagen.

## Voraussetzungen

- Eine HA-Testinstanz mit: mindestens einer `climate`-Entität, einem `light` mit
  `brightness`-Unterstützung, mehreren `sensor.battery`-artigen Entitäten (für
  Auto-Discovery), Energy-Dashboard-Konfiguration mit Solar/Grid/Battery-Quellen,
  sowie ein paar Power-Sensoren (`device_class: power`) für Power-List/Summary/
  Top-Consumers.
- Zugriff auf HA-Dev-Tools → Zustände (zum gezielten Setzen von `unavailable`/
  `unknown`) und auf die Browser-Konsole (für Fehler-Checks).
- Ein Handy oder ein per DevTools emuliertes Touch-Gerät für alle Drag-Interaktionen
  (Wave-Slider, Wischen) — Maus-Events allein decken `touch-action`-Konflikte nicht ab.

## Cross-Cutting-Checkliste (für jede der 29 Karten)

Diese Punkte gelten kartenübergreifend, weil sie über gemeinsame `shared/*`-Module
implementiert sind. Ein Fehlschlag hier betrifft potenziell alle Karten gleichzeitig.

| # | Test | Schritte | Erwartung |
|---|------|----------|-----------|
| C1 | Fehlende Entität | `entity` (bzw. `grid_entity` o. Ä.) auf eine nicht existierende Entity-ID setzen | Karte zeigt einen Platzhalter-Hinweis statt Absturz/leerer Fläche; keine Konsolenfehler |
| C2 | Entität `unavailable`/`unknown` | Betroffene Entität in Dev-Tools auf `unavailable` setzen | Karte zeigt „–“/gedimmten Zustand statt `NaN`, `undefined` oder falscher Zahl |
| C3 | Leere/minimale Config | Nur Pflichtfelder setzen, alles andere weglassen | Karte rendert mit sinnvollen Defaults, kein Crash |
| C4 | Legacy-Config-Migration | Alte Config mit `animations: true` (bzw. `false`) statt `animation` laden | Nach dem Laden: `animation` ist `"auto"`/`"off"`, `animations` ist entfernt, `card_version` ist gesetzt (per Konsole: `document.querySelector('...').constructor` → `_config` prüfen) |
| C5 | Sichtbarer Editor | Karte im Dashboard-Editor öffnen | Alle Abschnitte (inkl. „Erscheinungsbild“) klappen auf, keine leeren/kaputten `ha-form`-Felder |
| C6 | Editor-Live-Update | Im Editor einen Wert ändern (z. B. Name, Farbe) | Kartenvorschau aktualisiert sich sofort, ohne Reload |
| C7 | Eckenradius-Presets | Editor → Erscheinungsbild → Radius-Preset wechseln (Standard/Eckig/Rund/Benutzerdefiniert) | Kartenform ändert sich sichtbar; bei „Benutzerdefiniert“ erscheinen 4 Eckenfelder |
| C8 | Glass/Solid-Hintergrund | `glass_background: false` setzen | Karte wechselt von transparent/geblurrt zu solidem `card-background-color` |
| C9 | Tastatur-Fokus | Mit der Maus wegklicken, dann Tab drücken, bis die Karte erreicht ist | Sichtbarer Fokusring auf jedem klickbaren Element (Header, Zeilen, Buttons) |
| C10 | Tastatur-Aktivierung | Auf einem fokussierten klickbaren Element Enter bzw. Leertaste drücken | Löst dieselbe Aktion wie ein Klick aus (i. d. R. More-Info-Dialog) |
| C11 | `prefers-reduced-motion` | Chrome DevTools → Rendering → „Emulate CSS prefers-reduced-motion: reduce“ aktivieren, Karte neu laden | Keine Wachstums-/Wellen-/Rotations-Animationen; Werte erscheinen sofort in Endposition |
| C12 | `animation: "off"` | In der Config explizit `animation: "off"` setzen (ohne Reduced-Motion) | Gleiches Verhalten wie C11 |
| C13 | Sprachumschaltung | HA-Profil-Sprache zwischen Deutsch und Englisch wechseln | Alle Karten-Texte (inkl. Editor-Labels) wechseln vollständig, keine deutschen Reste im Englischen oder umgekehrt |
| C14 | Grid-Optionen (Sections-Dashboard) | Karte auf einem Sections-Dashboard platzieren, Größe ändern | Karte skaliert sinnvoll, `getGridOptions` liefert plausible Min/Max-Werte |
| C15 | Konsole sauber | Nach jedem der obigen Schritte | `read_console_messages`/DevTools zeigen keine Fehler mit `m3-cards.js` als Quelle |

## M3 Climate Card

| Test | Schritte | Erwartung |
|---|---|---|
| HVAC-Modi | Jeden verfügbaren Modus-Pill antippen | `climate.set_hvac_mode` wird korrekt aufgerufen, Pill-Farbe wechselt |
| Zieltemperatur | Plus/Minus antippen, danach direkt auf die Anzeige tippen | Stepper ändert Temperatur in `target_temp_step`-Schritten; Tippen auf die Anzeige öffnet More-Info |
| Presets (Pill-Style) | `preset_style: "pill"`, Preset wechseln | Zusätzlicher Pill erscheint, Klick zyklet durch `preset_modes` |
| Presets (Chip-Style) | `preset_style: "chip"` | Chip statt Pill, gleiche Funktion |
| Sensor-Chips | `show_sensors: true`, externe `temperature_sensor`/`humidity_sensor` konfigurieren | Chips zeigen externen statt internen Wert |
| Temp-Chip-Platzierung | `temperature_chip_placement: "header"` vs. `"info_row"` | Chip wandert sichtbar zwischen Header und Info-Zeile |
| Batterie-Warnchip | `battery_sensor` unter `battery_threshold` setzen | Warn-Chip erscheint im Header |
| `hidden_modes` | Einen Modus in `hidden_modes` eintragen, der aber in `hvac_modes` der Entität steckt | Pill für diesen Modus wird nicht gerendert |
| `unavailable_style: "hidden"` | Entität auf `unavailable`, Style auf `hidden` | Karte verschwindet komplett (kein leeres Gerüst) |
| Mode-Farben-Override | `mode_colors.heat` auf eigene Farbe setzen | Pill/Header-Akzent für „heat“ übernimmt die Farbe |

## M3 Climate Card Mini

| Test | Schritte | Erwartung |
|---|---|---|
| Power-Button | Antippen bei `off`/aktivem Modus | Schaltet zwischen `off` und letztem aktiven Modus, Radius morpht rund↔eckig |
| Icon/Text-Klick | Auf Icon-Swatch bzw. Namens-Block tippen | Öffnet More-Info (nicht den Power-Toggle) |
| Stepper | Plus/Minus/Wert-Anzeige antippen | Wie bei der großen Karte; Wert-Anzeige öffnet More-Info |
| Kompaktes Layout | Karte auf sehr schmaler Spaltenbreite (Handy) platzieren | Kein Text-Overflow, Buttons bleiben antippbar (min. 40×40px) |

## M3 Button Card

| Test | Schritte | Erwartung |
|---|---|---|
| Tap/Hold/Double-Tap-Actions | Alle drei `*_action`-Varianten konfigurieren (z. B. `toggle`, `more-info`, `navigate`) | Jede Geste löst die konfigurierte Aktion aus, keine Überschneidung |
| Icon-Tap-Action separat | `icon_tap_action` abweichend von `tap_action` setzen | Klick auf das Icon löst die eigene Aktion aus, Klick auf die restliche Karte die Haupt-Aktion |
| Slider-Modus | `show_slider: true` an einem `light`/`cover` mit Helligkeit/Position | Ziehen auf der Karte ändert den Wert live (optimistisch), `touch-action: none` verhindert Seiten-Scroll beim Wischen auf dem Handy |
| `state_colors` | Für einen benutzerdefinierten State (z. B. `media_player`-State) Farbe setzen | Icon-Hintergrund übernimmt die State-spezifische Farbe |
| `invert_colors` | Aktivieren bei einem `off`-Zustand | Aktiv-/Inaktiv-Farblogik dreht sich sichtbar um |
| Vertikales Layout | `vertical: true` | Icon über Text statt daneben, zentriert |
| Nested-ARIA-Grenzfall | Screenreader/Tab-Test bei aktivem `icon_tap_action` | Icon-Bereich ist bewusst *nicht* separat fokussierbar (vermeidet verschachtelte `role="button"`); Haupt-Tap-Ziel bleibt vollständig erreichbar |

## M3 Progress Card

| Test | Schritte | Erwartung |
|---|---|---|
| Status-Übergänge | Entität durch `running_states`/`preparing_states`/`done_states` durchschalten | Wellenfarbe/Text wechseln passend zum Status |
| `percentage_entity` getrennt von `entity` | Separate Prozent-Quelle konfigurieren | Fortschritt folgt der separaten Entität, Status weiter der Haupt-Entität |
| `hide_when_ready` | Status auf „ready“, Option aktiv | Karte blendet sich aus (Grid-Size 0) statt leer zu bleiben |
| `wave_style: "flat"` | Umschalten | Keine Wellenanimation, gerader Balken |
| Reduced-Motion-Sonderfall | `_reducedMotion` per OS/Browser aktivieren bei `wave_style: "wavy"` | Welle wird trotzdem flach gerendert (eigene Prüfung, nicht nur `shouldAnimate`) |

## M3 Energy Card

| Test | Schritte | Erwartung |
|---|---|---|
| `mode: consumption`, `period: day/hour/month` | Alle drei Perioden durchklicken | Balken, Achsenbeschriftung und Summen wechseln korrekt; keine hängenden Ladezustände |
| `mode: solar` | Mit `forecast_entity` | Balken zeigen Ist-Werte + gestrichelten Forecast-Rest korrekt übereinander |
| History-Fallback | Eine Entität ohne Long-Term-Statistics verwenden | Karte lädt trotzdem (über History-API), keine Fehlermeldung |
| Monats-Hochrechnung | `period: month`, `show_projection: true` | Hochrechnung erscheint plausibel (nicht negativ/riesig) |
| Vergleichs-Chip | `show_comparison: true`, `higher_is_better` in beide Richtungen testen | Farbe (besser/schlechter) und Pfeilrichtung stimmen zur Einstellung |
| Balken-Tap | Auf einen einzelnen Balken tippen | Value-Bubble mit exaktem Wert erscheint über dem Balken |
| Lade-Zustand | Periode wechseln, währenddessen beobachten | `.bars-row.loading`-Dimmung kurz sichtbar, dann normale Deckkraft |

## M3 Gauge Card

| Test | Schritte | Erwartung |
|---|---|---|
| `source: energy` | Mit Energy-Dashboard-Grid-Import/Export | A/B-Segmente summieren sich korrekt zu 100 % |
| `source: entities` | Zwei beliebige `sensor`-Entitäten mit unterschiedlichen Einheiten | Angezeigte Einheit folgt der tatsächlichen Entity-Einheit, kein hartkodiertes „kWh“ |
| Eine Entität `unavailable` | Nur `value_a_entity` auf `unavailable` | Segment A zeigt 0 statt Absturz, B bleibt korrekt |
| Lerp-Animation | Wert live ändern (Dev-Tools → Zustand setzen) | Zeiger/Segmente gleiten sanft zum neuen Wert statt zu springen |

## M3 Energy Flow Card

| Test | Schritte | Erwartung |
|---|---|---|
| `source: energy` vs. `entities` | Beide Quellmodi konfigurieren | Gleiches Diagramm-Layout, Werte stimmen mit der jeweiligen Quelle überein |
| `show_battery: "auto"` | Mit und ohne konfigurierte Batterie testen | Batterie-Knoten erscheint nur, wenn eine Battery-Quelle vorhanden ist |
| Flow-Punkte-Animation | Reduced-Motion aktivieren | Punkte-Animation (`.flow-dots`) wird komplett weggelassen (nicht nur pausiert) |
| `flow_speed` | `slow`/`normal`/`fast` durchschalten | Sichtbar unterschiedliche Punktgeschwindigkeit |
| Autarkie-Balken | `show_self_sufficiency: true` bei 0 % und 100 % Grenzfällen | Balkenbreite clamped korrekt auf 0–100 %, kein Überlauf |

## M3 Counter Card

| Test | Schritte | Erwartung |
|---|---|---|
| Ziffern-Roll-Animation | Entitätswert live ändern | Betroffene Ziffern rollen einzeln, unveränderte Ziffern bleiben stehen |
| `digits: "auto"` vs. fest | Beide testen mit unterschiedlich langen Werten | „auto“ passt Ziffernanzahl dynamisch an, fester Wert schneidet/padded konsistent |
| Leistungs-Chip + Schwellwerte | `power_entity` + `power_thresholds` mit mehreren Stufen | Chip-Farbe wechselt an den konfigurierten Schwellen |
| Ticker | `daily_entity` + `show_ticker: true` | „+X heute“-Zeile erscheint, Format nutzt korrekte Einheit |
| Reduced-Motion | Aktivieren, Wert ändern | Ziffern springen direkt zum neuen Wert, keine Roll-Animation |

## M3 Power List Card

| Test | Schritte | Erwartung |
|---|---|---|
| Auto-Discovery | `auto_discover: true` ohne `entities` | Alle passenden `power`-Sensoren erscheinen, sortiert nach `sort` |
| `include_area`/`include_label`/`exclude_entities` | Je einzeln testen | Filterung greift korrekt, ausgeschlossene Entität bleibt versteckt (auch im „mehr anzeigen“) |
| Erzeuger vs. Verbraucher | Eine Entität als `type: "producer"` markieren | Eigene Sektion/Farbe, wird nicht mit Verbrauchern vermischt |
| `threshold` + Idle-Toggle | Werte unter Threshold + `show_idle_toggle: true` | „N weitere“-Button klappt versteckte Zeilen mit FLIP-Animation auf/zu |
| `max_visible` | Mit mehr Entitäten als `max_visible` | Nur die Top-N sichtbar, Rest hinter Toggle |
| Manuelle Entity-Reihenfolge | `sort: "config"` mit expliziter `entities`-Liste | Zeilenreihenfolge entspricht exakt der Config-Reihenfolge |

## M3 Power Summary Card

| Test | Schritte | Erwartung |
|---|---|---|
| `grid_sign: "negative_is_export"` vs. `"positive_is_export"` | Beide mit demselben Sensor testen | Import/Export-Anzeige bleibt inhaltlich korrekt trotz invertiertem Vorzeichen |
| `consumption_entity` fehlt | Weglassen | Verbrauch wird aus `grid_import + solar` berechnet, kein Fehler |
| Split-Bar | `show_split_bar: true` bei Netzbezug 0 kW | Balken zeigt sinnvollen Leerzustand, nicht NaN-Breite |
| Metrik-Klick | Auf eine `metrics`-Kachel tippen | Öffnet More-Info der zugehörigen Entität |
| Autarkie bei Export | Zeitpunkt mit Solarüberschuss/Export | Autarkie-Anzeige zeigt 100 % bzw. sinnvollen Wert, kein negativer Prozentwert |

## M3 Top Consumers Card

| Test | Schritte | Erwartung |
|---|---|---|
| Zeiträume | `today`/`yesterday`/`week`/`month` durchklicken | Ranking und Summen aktualisieren sich korrekt pro Zeitraum |
| `rest_mode: "collapse"` | Mehr Geräte als `top_count` | „N weitere“-Button mit FLIP-Animation beim Auf-/Zuklappen |
| `unit_mode: "cost"` | Mit `price_source` konfiguriert | Ranking sortiert nach Kosten statt kWh, Währungsformat korrekt |
| `name_strip` | Entitätsnamen mit Suffix wie „ Steckdose“ | Suffix wird im Zeilennamen entfernt |
| Statistics-Cache | Zwei Top-Consumers-Karten mit identischer Config auf einem Dashboard | Nur eine WS-Anfrage im Netzwerk-Tab pro Zeitfenster (Cache-Dedup), beide Karten zeigen trotzdem korrekte Daten |

## M3 Cost Card

| Test | Schritte | Erwartung |
|---|---|---|
| `price_source: energy_dashboard/input_number/fixed` | Alle drei testen | Jede Quelle liefert einen plausiblen Tarif-Wert in der Tarif-Zeile |
| `price_entity` auf `unavailable` | Bei `price_source: "input_number"` | Tarif-Zeile zeigt „–“, **nicht** „NaN“ |
| Perioden-Navigation | Vor/Zurück-Buttons am Rand des verfügbaren Zeitraums | „Weiter“-Button deaktiviert sich korrekt an der Gegenwart (`atPresent`) |
| Budget-Überschreitung | `budget` unter den erwarteten Monatswert setzen | Hochrechnung/Anzeige markiert Budget-Überschreitung visuell |
| Balken-Tap | Einzelnen Tagesbalken antippen | Value-Bubble mit Betrag + Währungssymbol erscheint |
| `period: "day"` | Umschalten | Balkendiagramm wird ausgeblendet (`showBars = false`), nur Tageswert sichtbar |

## M3 Light Card

| Test | Schritte | Erwartung |
|---|---|---|
| Wave-Slider Drag (Maus) | Mit der Maus auf dem Slider ziehen | Helligkeit folgt optimistisch, `light.turn_on` mit `brightness_pct` wird gedrosselt (~200 ms) aufgerufen |
| Wave-Slider Drag (Touch, echtes Handy) | Auf dem Handy in HA öffnen, auf dem Slider vertikal wischen | Kein Seiten-Scroll während des Ziehens (`touch-action: none` greift) |
| Tastatur-Steuerung | Slider fokussieren, Pfeiltasten / Shift+Pfeiltasten | ±5 % bzw. ±1 % Helligkeit pro Tastendruck |
| Power-Button | Bei `on`/`off` antippen | Schaltet Licht, Button-Radius morpht |
| Ohne Helligkeitsunterstützung | Entität ohne `brightness` in `supported_color_modes` | Wave-Slider wird nicht gerendert, nur Header + Power-Button |
| Entität `unavailable` während Drag | Während des Ziehens Entität extern auf `unavailable` setzen | Kein Absturz, Drag-Session bricht sauber ab |

## M3 Battery Card

| Test | Schritte | Erwartung |
|---|---|---|
| Auto-Discovery-Anzahl | `auto_discover: true`, Konsole/Editor prüfen | Anzahl gefundener Batterie-Entities plausibel (`device_class: battery` + `%`-Sensoren) |
| Namens-Override in Auto-Discover-Modus | `entities: [{entity: ..., name: "Custom"}]` **zusätzlich zu** `auto_discover: true` | Eintrag wirkt als Override (Name/Icon), ersetzt nicht die automatische Liste |
| `name_strip` | Entität mit „ Battery Level“-Suffix | Suffix verschwindet aus der Zeilenbeschriftung |
| Stufenfarben | Werte in critical/low/medium/ok-Bereiche verschieben | Balkenfarbe und Textfarbe wechseln an den `thresholds`-Grenzen |
| Sortierung | Mehrere Entitäten mit unterschiedlichen Werten + eine `unavailable` | `unavailable` immer zuerst, danach aufsteigend nach Wert |
| `max_visible` + Erweitern-Button | Mehr Entitäten als `max_visible` | „N weitere anzeigen“/„Einklappen“ toggelt kompakte Zusatzzeilen mit FLIP-Animation |
| Manuelle Ausschlüsse | `exclude_entities` mit einer Entity-ID aus der Auto-Discovery | Diese Entität erscheint nirgends, auch nicht hinter dem Erweitern-Button |

## M3 Media Card

| Test | Schritte | Erwartung |
|---|---|---|
| Feature-Erkennung | Player ohne `PREVIOUS_TRACK`/`NEXT_TRACK` (Chromecast mit lokaler Datei) gegen einen mit (derselbe Player über Spotify) | Fehlende Knöpfe fehlen ganz, kein ausgegrauter Platzhalter; über Spotify erscheinen sie |
| Play/Pause-Morph | Zwischen Wiedergabe und Pause umschalten | Fläche morpht Kreis ↔ Squircle, Symbol blendet über, kein Layout-Sprung |
| Ohne Pause-Feature | Player, der nur `STOP` meldet | Stopp-Symbol statt Pause, Aufruf geht an `media_stop` |
| Repeat dreistufig | Repeat mehrfach tippen | aus → alle → einer → aus, bei „einer" das `repeat-once`-Symbol |
| Fortschrittswelle | Wiedergabe pausieren | Welle ebbt animiert auf eine gerade Linie ab, springt nicht |
| Live-Stream | Radio-Stream ohne `media_duration` | Wanderndes Wellensegment, „Live"-Chip statt Restzeit |
| Restzeit | `time_display` umschalten | `remaining` zeigt `-2:21`, `total` die Gesamtdauer |
| Spulen | Auf dem Fortschritt ziehen | Zeitangabe links folgt dem Griff, nicht dem Player; höchstens ein `media_seek` je 200 ms |
| Ohne Metadaten | Chromecast mit lokaler Datei (Default Media Receiver) | Interpret/Album/Titel aus dem Pfad abgeleitet, Interpret nicht doppelt im Titel |
| Tracknummer | Titel `07 - Enjoy the Silence` und `365 Dreams - My Way` | Erster gekürzt, zweiter unangetastet |
| Cover-Farbe | Dunkles Cover mit kleinem farbigem Motiv | Akzent nimmt die Motivfarbe an, Symbol auf gefüllter Fläche bleibt lesbar |
| Ohne Cover | Player ohne `entity_picture` | Verlaufsfläche mit Album-/Noten-Symbol, keine leere Kachel |
| Bibliothek | Zeile aufklappen, zwei Ebenen tief navigieren, Breadcrumb zurück | Skeletons beim Laden, Breadcrumb stimmt, Zurück funktioniert |
| Bibliothek: große Ebene | Ordner mit >100 Einträgen öffnen | 100 Zeilen plus Hinweis „… und N weitere", Oberfläche bleibt flüssig |
| Bibliothek: abspielen | Abspielbaren Eintrag antippen | Wiedergabe startet, Karte übernimmt den neuen Titel |
| Warteschlange | Player mit und ohne Queue | Mit: zweiter Reiter und „Als Nächstes: …"; ohne: kein leerer Reiter, Zeile liest „Bibliothek durchsuchen" |
| `show_browser: false` | Option setzen | Bereich verschwindet vollständig |

## M3 Weather Card

| Test | Schritte | Erwartung |
|---|---|---|
| Vorhersagearten | Entität nur mit täglicher bzw. nur mit stündlicher Vorhersage | Kurve rendert oder fällt sauber weg, kein leerer Bereich |
| Sonnenmarker | `sun.sun` beobachten | Auf-/Untergangsmarker sitzen an der richtigen Stelle der Zeitachse |
| Niederschlagsbalken | Vorhersage ohne Niederschlagsdaten | Balkenreihe entfällt, Kurve bleibt |

## M3 Presence Card

| Test | Schritte | Erwartung |
|---|---|---|
| Auto-Discovery | Ohne `entities` konfigurieren | Alle `person`-Entitäten erscheinen |
| Ohne Bild | Person ohne `entity_picture` | Initialen statt Avatar |
| Kartenintegration | `show_map: true` | Karte lädt, keine Konsolenfehler bei fehlenden Koordinaten |

## M3 Climate Overview Card

| Test | Schritte | Erwartung |
|---|---|---|
| Bereichserkennung | `auto_discover: true` ohne Räume | Räume aus HA-Bereichen, Temperatur und Feuchte je Raum |
| Raum ohne Feuchtesensor | Raum mit nur Temperatur | Feuchtewert entfällt, Zeile bleibt intakt |
| Trend | Verlauf abwarten | Trendpfeil erscheint erst mit ausreichend Historie |

## M3 Aquarium Card

| Test | Schritte | Erwartung |
|---|---|---|
| Fehlende Slots | Nur `water_temperature_entity` gesetzt | Übrige Kacheln entfallen, kein Platzhalter mit „–" |
| Kamera | `camera_entity` gesetzt, Banner aufklappen | Bild lädt, Aufklappanimation ruckelt nicht |
| Reinigungsintervall | Datum in Vergangenheit und Zukunft | Fälligkeit korrekt, Zustandsfarbe wechselt |

## M3 Updates Card

| Test | Schritte | Erwartung |
|---|---|---|
| Ohne Updates | Alle `update.*` auf „aktuell" | Ruhezustand statt leerer Liste |
| Installation | Update auslösen | Knopf morpht in den Busy-Zustand, Fortschritt sichtbar |
| Backup-Warnung | Letztes Backup älter als `backup_warn_days` | Warnhinweis erscheint |

## M3 NAS Card

| Test | Schritte | Erwartung |
|---|---|---|
| Offline | NAS-Entitäten auf `unavailable` | Offline-Zustand nach `offline_minutes`, keine `NaN`-Werte |
| Schwellwerte | Disk-/Temperaturwerte über Warn- und Kritisch-Schwelle | Farbwechsel an beiden Schwellen |

## M3 System Card

| Test | Schritte | Erwartung |
|---|---|---|
| Reines Rendering | Karte platzieren | Rendert ohne `hass`-Zustand, keine Konsolenfehler |

## M3 Supply Card

| Test | Schritte | Erwartung |
|---|---|---|
| Hero-Wechsel | Zeile antippen | Angetippter Vorrat wird zum Hero, Animation sauber |
| Punkte vs. Balken | Vorrat unter und über 40 Einheiten | Unter 40 ein Punkt je Einheit, darüber ein Balken |
| Stepper-Wiederholung | +/- gedrückt halten | Wert läuft weiter, stoppt beim Loslassen |
| Nachfüllen | „Packung nachgefüllt" antippen | Zähler springt um die Packungsgröße |

## M3 Todo Card

| Test | Schritte | Erwartung |
|---|---|---|
| Hinzufügen | Eintrag oben und unten (`add_position`) | Landet an der konfigurierten Stelle |
| Duplikat | Vorhandenen Eintrag erneut eingeben | Bestehender Eintrag pulst, keine zweite Zeile |
| Abhaken | Häkchen antippen | Morph vom Ring zum gefüllten Squircle |
| Schnellwahl-Chips | Quelle auf Supply-Karten stellen | Knappster Vorrat zuerst als Chip |
| Umbenennen/Löschen | Zeile lange drücken | Dialog erscheint, beide Aktionen wirken |

## M3 Time Card

| Test | Schritte | Erwartung |
|---|---|---|
| Darstellungsvarianten | Stepper und Scroll-Räder durchschalten | Beide bedienbar, gleicher Wert |
| Rad-Drag vs. Swipe | Auf einem Dashboard mit Swipe-Plugin am Rad ziehen | Ansicht wechselt nicht |
| 12-Stunden-Format | HA-Locale auf 12h stellen | AM/PM korrekt, ARIA-Bereich passend |
| Übernehmen-Knopf | Sichtbarkeit umschalten | Wert wird sofort bzw. erst beim Übernehmen geschrieben |

## M3 Occupancy Card

| Test | Schritte | Erwartung |
|---|---|---|
| Auto-Discovery | Ohne Sensorliste | Räume aus HA-Bereichen, „X von Y Räumen belegt" |
| Zeitleiste | Sensor auslösen | Streifen aktualisiert sich ohne Wartezeit auf den Minutentakt |
| „belegt seit" | Sensor länger als eine Stunde aktiv | Wechsel von Minuten- auf Stundenangabe |

## M3 Cover Card

| Test | Schritte | Erwartung |
|---|---|---|
| Fähigkeiten | Cover mit Position, mit Lamellen, nur Auf/Zu | Nur die tatsächlich unterstützten Bedienelemente |
| `switch_pair` | FingerBot-artiges Paar ohne Rückmeldung | Tastenfeedback zeigt den ausgelösten Befehl |
| Gruppenmodus | Mehrere Zeilen, davon eine `switch_pair` | Jede Zeile eigenständig bedienbar |
| Drag | Position ziehen | Höchstens ein Aufruf je 200 ms, Wert setzt sich nach dem Loslassen |

## M3 Leak Card

| Test | Schritte | Erwartung |
|---|---|---|
| Alarm | Feuchtesensor auf `on` | Lauter Alarmzustand, Karte hebt sich ab |
| Veraltet | Sensor lange ohne Update | „veraltet"-Zustand statt fälschlich „OK" |
| Absperren | Mit `confirm_shutoff` zweimal tippen | Erster Tap schärft, zweiter löst aus; nach 4 s wieder entschärft |
| Absperr-Domänen | `valve`, `switch` und `cover` als Absperrentität | Jeweils korrekter Dienstaufruf |

## M3 Waste Card

| Test | Schritte | Erwartung |
|---|---|---|
| Hero | Sensor mit 0, 1 und mehreren Tagen | „nächste Abfuhr in N Tagen" korrekt, heute als Sonderfall |
| Mehrere Tonnen am selben Tag | Zwei Sensoren mit gleichem Tag | Hero zeigt „N Tonnen" mit Mehrfach-Icon |
| Zeitleiste | Zwei Wochen Vorschau | Marker an den richtigen Tagen |

## Vor jedem Release

1. Alle Cross-Cutting-Punkte (C1–C15) auf mindestens 3 unterschiedlichen Karten
   durchgehen (eine einfache, eine mit Editor-Unterinhalten wie Battery/Power-List,
   eine mit Animation wie Progress/Light).
2. Jede der 29 Karten mindestens einmal mit einer Minimal-Config und einmal mit
   einer voll ausgereizten Config (alle Farben/Optionen gesetzt) rendern.
3. `CHANGELOG.md` gegen die tatsächlich getesteten Änderungen abgleichen.

## Bekannte Einschränkungen

- **Akzentfarben im hellen Theme:** Werte in der Akzentfarbe (große Zahlen,
  Prozentangaben, Statusfarben) haben im hellen Theme weniger Kontrast als der
  übrige Text. Ursache ist die für dunkle Gründe entworfene Palette, nicht ein
  Fehler einer einzelnen Karte. Beim Durchgang im hellen Theme also nicht als
  Kartenfehler notieren — die Vordergrundfarben werden in 2.0.1 überarbeitet.

- **`m3-climate-card-mini` und `m3-button-card` in HA's Standard-„Masonry“-Ansicht:**
  Beide Karten können in einer Masonry-View (HA's Default-Dashboard-Typ, im
  Unterschied zur „Sections“-Ansicht) auf 0px Höhe kollabieren und unsichtbar
  bleiben. Reproduziert nur in Masonry — in „Sections“-Views (der Typ, den alle
  bisher bekannten produktiven Dashboards verwenden) tritt der Fehler nicht auf.
  Ursache noch nicht gefunden (ein erster Fix-Versuch — `getGridOptions().rows`
  von einer festen Zahl auf `"auto"` umgestellt, konsistent mit allen anderen
  Karten — hat das Problem nicht behoben). Nicht release-blockierend, aber vor
  einem 1.0-Release oder bei Berichten von Masonry-Nutzern erneut aufgreifen.
