# Akzentfarben im hellen Theme

Vorarbeit für 2.0.1. Hält fest, was gemessen wurde, welche Entscheidung ansteht
und was danach zu tun ist — damit die Analyse nicht bei jedem Anlauf neu
beginnt.

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

Kartenflächen und getönte Flächen sind mit 2.0 behoben (`glassBackground` und
`tintBackground` mischen nicht mehr gegen `transparent`, sondern in die
Kartenfläche). Offen sind die Stellen, an denen der Akzent als **Vordergrund**
dient.

## Umfang

| Art | Stellen |
|---|---:|
| `color: var(--*-accent)` | 51 |
| `color: var(--leak-alarm)`, `--nas-status`, `--cv-*`, … | 46 |
| Inline gesetzt, `color: ${row.color}` | 58 |
| **Summe** | **≈ 155** |

Verteilt über 17+ Karten.

Nach WCAG-Größenklasse (Stichprobe über die 51 `-accent`-Stellen): 5 groß
(3:1 genügt), 13 klein (4,5:1 nötig), 32 ohne Größenangabe im selben
Regelblock. Die Mehrheit ist also **kleiner** Text — Chips und Labels mit
9–15px.

## Zwei Wege

### A — Kontrastgesteuerte Kompensation *(empfohlen)*

Den Akzent zur Laufzeit Richtung Textfarbe ziehen, bis der Zielkontrast
erreicht ist. Selbstkorrigierend in beiden Themes, weil HA `--primary-text-color`
themerichtig liefert: im Hellen dunkelt es ab, im Dunklen hellt es auf.

**Ein fester Prozentsatz reicht nicht.** Der nötige Anteil hängt an der
Eigenhelligkeit der Farbe und schwankt zwischen 64 % und 99 % für 3:1
beziehungsweise 47 % und 81 % für 4,5:1. Es braucht dieselbe Bisektion wie
`ensureInkContrast` in `m3-media-card.ts`.

Ergebnis bei 4,5:1 (Auszug):

| Farbe | Original | angepasst | Sättigung |
|---|---|---|---|
| `media` | `#a58fe8` | `#796ba6` | 0,66 → 0,25 |
| `solar` | `#f0a24a` | `#976a38` | 0,85 → 0,46 |
| `cover` | `#9fd6bf` | `#5f796e` | 0,40 → 0,12 |

Der Sättigungsverlust wirkt zunächst wie ein Mangel, ist aber genau das
Material-3-Modell: „on-container"-Farben sind dort per Definition tiefe,
gedämpfte Varianten des Akzents. Ein Blick in eine beliebige M3-App im hellen
Modus bestätigt das.

**Vorteil:** funktioniert mit *jeder* Farbe — auch mit den über `accent_color`
vom Nutzer gesetzten, die eine gepflegte Palette nie abdecken könnte.

### B — Zweite Palette für den hellen Modus

Zu jeder Palettenfarbe eine dunklere Variante von Hand wählen, umgeschaltet
über `prefers-color-scheme`. Gestalterisch feiner steuerbar, aber doppelte
Pflege — und **greift nicht bei benutzerdefinierten Farben**, die in diesem
Projekt bei jeder Karte konfigurierbar sind.

## Vorgehen, wenn A gewählt wird

1. `readableOn(colorCss, ziel)` in `src/shared/color-config.ts`, gebaut wie
   `ensureInkContrast` — Bisektion Richtung `--primary-text-color`, bis der
   Zielkontrast steht. Zielwert 4,5:1, für nachweislich große Elemente 3:1.
2. Für jede Akzentvariable eine Vordergrund-Schwester erzeugen. `buildCssVars`
   ist der gemeinsame Punkt: alle 24 Karten laufen darüber.
3. Die 51 `color: var(--*-accent)` auf die neue Variable umstellen. Flächen
   (`background`, `fill`, `stroke`) behalten den reinen Akzent — die Trennung
   Fläche/Vordergrund ist der Kern der Änderung.
4. Die 46 sonstigen Farbvariablen und die 58 inline gesetzten Farben nachziehen.
5. Die rund 160 CSS-Literale, die weiterhin gegen `transparent` mischen,
   angleichen.
6. Durchgang über alle 29 Karten in beiden Themes.

## Was schon erledigt ist

- `glassBackground` (2.0): Kartenfläche statt Textfarbe als Schleier
- `tintBackground` (2.0): getönte Flächen mischen in die Kartenfläche
- `ensureInkContrast` (2.0, Media Card): die Bisektion existiert bereits und
  kann als Vorlage dienen
