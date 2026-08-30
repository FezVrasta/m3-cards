# Akzentfarben im hellen Theme

Was das Problem war, wie es gelöst wurde und woran man erkennt, dass es gelöst
bleibt. Geschrieben nach der Umsetzung in 2.0.1 — die Fassung davor hielt nur
die Messung und zwei Vorschläge fest.

## Das Problem

Die Palette in `src/shared/tokens.ts` ist für dunkle Hintergründe entworfen.
Gemessen als WCAG-Kontrast gegen eine helle Kartenfläche (`#fafafa`) und eine
dunkle (`#1c1c1c`):

| Farbe | Hex | auf hell | auf dunkel |
|---|---|---:|---:|
| `off` | `#888780` | 3,45:1 | 4,73:1 |
| `heat` | `#e57368` | 2,88:1 | 5,67:1 |
| `cool` | `#6ba7dc` | 2,46:1 | 6,64:1 |
| `dryAuto` | `#5dcaa5` | 1,92:1 | 8,49:1 |
| `fan` | `#b8c4c9` | 1,71:1 | 9,56:1 |
| `solar` | `#f0a24a` | 2,02:1 | 8,09:1 |
| `grid` | `#8f79e0` | 3,36:1 | 4,85:1 |
| `home` | `#85b7eb` | 2,02:1 | 8,09:1 |
| `ok` | `#81c784` | 1,93:1 | 8,47:1 |
| `light` | `#f0c46e` | 1,57:1 | 10,41:1 |
| `media` | `#a58fe8` | 2,61:1 | 6,24:1 |
| `cover` | `#9fd6bf` | 1,57:1 | 10,42:1 |
| Light-Card-Akzent | `#ffc773` | 1,47:1 | 11,09:1 |

**Alle 13 fallen im hellen Theme unter 4,5:1. Im dunklen besteht jede.** Das
ist keine Eigenart einzelner Karten, sondern die Palette selbst.

Ein fester Mischungsanteil kann das nicht beheben: Wie weit eine Farbe
verschoben werden muss, hängt an ihrer Eigenhelligkeit und schwankt über die
Palette zwischen 64 % und 99 % für 3:1 beziehungsweise 47 % und 81 % für 4,5:1.
Die Korrektur wird deshalb vom Zielkontrast gesteuert, nicht von einem
Prozentwert — was zugleich für die Farben funktioniert, die Nutzer über
`accent_color` selbst setzen.

## Die Lösung

Vier Helfer in `src/shared/`, für vier verschiedene Aufgaben. Der wiederkehrende
Fehler in diesem Projekt war, sie zu verwechseln.

| Helfer | wofür | Ziel |
|---|---|---|
| `foregroundColor(host, farbe)` | Akzent als Text **auf der Karte** | 4,5:1 |
| `foregroundOn(farbe, fläche, ziel, host)` | Text oder Icon auf **einer anderen Fläche** | 3:1 |
| `tintOn(host, farbe, …)` | gemischte Fläche (Chip, Icon-Feld, Balken) | Dunkel-Parität |
| `fillColor(host, farbe)` | **volltonige** Datenfläche | 3:1 |

Drei Entscheidungen dahinter, die sich nicht ineinander überführen lassen:

**Helligkeit ändern, nicht Richtung Schwarz blenden.** Der erste Anlauf erreichte
die Zielwerte durch Blenden gegen Schwarz. Rechnerisch korrekt, gestalterisch
falsch: `#85b7eb` landete auf `#537293`, einem Graublau mit 28 % Sättigung. Das
ganze helle Theme wirkte ausgewaschen — und genau so wurde es gemeldet. `vividOn`
hält den Farbton, hebt die Sättigung um 25 % und nimmt den Kontrast allein aus
der Helligkeit: dieselbe Farbe wird `#0b6ed5` mit 90 %.

**Tönungen treffen ihr Ziel, Vordergrund überschreitet es.** `toneAt` setzt die
Helligkeit so, dass der Kontrast *auf* dem Zielwert landet; `vividOn` sucht die
am wenigsten veränderte Farbe, die ihn *überschreitet*. Nimmt man `vividOn` für
eine Tönung, kommt ein ohnehin kontrastreicher Akzent in voller Stärke zurück —
das Icon-Feld wird volltonfarben und das gleichfarbige Icon darauf unsichtbar.

**Flächen bekommen die Dunkel-Parität, nicht einen erfundenen Wert.** Zielwert
einer Tönung ist der Kontrast, den dieselbe Farbe bei demselben Prozentsatz auf
einer dunklen Referenzfläche ohnehin erreicht. Das skaliert von selbst — eine
8-%-Chip-Tönung bleibt zart, ein 30-%-Datenbalken wird deutlich — und ist im
dunklen Theme wirkungslos.

Für *volltonige* Flächen gilt das nicht: Ein heller Akzent auf dunklem Grund ist
von Natur aus kontraststark (`#89CFF0` auf `#1c1c1c` sind 10,7:1), und das auf
Fast-Weiß zu verlangen hieße, einen fast schwarzen Balken zu zeichnen. Dort gilt
der WCAG-Wert für grafische Objekte, 3:1 — bequem über den rund 2:1 der
getönten Balken, damit die Hervorhebung eine Hervorhebung bleibt.

## Die zwei Fallen

**Vordergrund muss gegen die Fläche gemessen werden, auf der er wirklich sitzt.**
Solange die Tönungen blass waren, fiel nicht auf, dass Chips ihre Textfarbe von
der *Karte* nahmen. Mit farbigen Tönungen ergab das `#81c784` auf `#9cdc9f` —
1,26:1, unsichtbar. Betroffen war jedes Bauteil, das Fläche und Inhalt zugleich
trägt: Icon-Felder, Chips, Aufklapp-Umschalter, Zähler-Badges. Der Unterschied
ist auch dann relevant, wenn er klein aussieht: eine gegen die Karte auf 4,5:1
korrigierte Farbe landet auf einer Listenzeile bei 4,10:1.

**Ein `var()` als Farbe macht jede Korrektur still wirkungslos.** `parseColor`
kann es nicht auflösen, die Helfer geben die Eingabe unverändert zurück, und es
sieht aus wie „hier war nichts zu tun". Daran lag es, dass in der Abfallkarte
die hervorgehobene Zeile korrekt war und die drei darunter bei 1,34:1 blieben.
`resolveVarCss(host, …)` löst jetzt vorab auf — deshalb nehmen `tintOn`,
`fillColor` und `tintInk` einen Host entgegen, und `foregroundOn` einen
optionalen.

## Was bewusst offen bleibt

Nach der Umstellung meldet der Audit (siehe `docs/TESTING.md`) **hell 3, dunkel
4**, und alle drei hellen Funde stehen auch in der dunklen Liste. Sie sind damit
keine Theme-Fehler, sondern langjährige Entscheidungen:

- weiße Initialen auf dem grünen Präsenz-Avatar (2,01:1)
- der bewusst gedämpfte „Unverändert"-Knopf der Zeitkarte
- der rote Zählwert der Supply-Karte im dunklen Theme (3,04:1)

Ebenfalls absichtlich unberührt: 15 `color-mix(…, transparent)` in Gradienten,
`white`/`black`-Überlagerungen und zwei Textfarben mit reduzierter Deckkraft.
Dort *ist* Transparenz der Zweck. Die übrigen 146 mischen inzwischen in die
Kartenfläche, hängen also nicht mehr davon ab, was durch das Glas hinter der
Karte durchscheint.

Die Karten-Editoren (`src/m3-*-editor.ts`) mischen weiterhin gegen `transparent`.
Sie rendern im Konfigurationsdialog, nicht in einer `ha-card`; dort wäre
`--ha-card-background` die falsche Bezugsfläche.
