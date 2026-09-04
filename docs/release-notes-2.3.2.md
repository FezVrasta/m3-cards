# M3 Cards 2.3.2

Editor tidying for the nav card, following 2.3.1.

**Upgrading:** nothing renamed, nothing removed. If you had a pull-up sheet with
entries behind a round button, opening its editor once moves them into the
drawer's tiles — the same entries, in the place that can edit them.

### Fixed

- **The round button's section still appeared on a pull-up sheet.** 2.3.1 stopped
  the card drawing one there — a sheet has a drawer instead — but the editor went
  on offering it, headed "Round button's menu" on a variant that has no round
  button. Editor and card agree again: only the floating bar has one. A sheet's
  menu entries fold into the drawer's own tiles, where they can be renamed and
  reordered; they were already drawn there, but lived in a part of the config the
  editor no longer showed.

### Changed

- **The round button and its menu moved from Appearance to Entries**, directly
  under the list. They hold the same kind of thing the bar does, and moving a
  page from the bar into the menu or back meant working across two panels.

### Behoben

- **Der Abschnitt des runden Knopfes erschien weiterhin beim Pull-up-Sheet.**
  Seit 2.3.1 zeichnet die Karte dort keinen mehr — ein Sheet hat stattdessen
  eine Schublade —, der Editor bot ihn aber weiter an, überschrieben mit „Menü
  des runden Knopfes" bei einer Variante ohne runden Knopf. Editor und Karte
  sind wieder einer Meinung: nur die schwebende Leiste hat einen. Die
  Menüeinträge eines Sheets gehen in die Kacheln der Schublade über, wo sie sich
  umbenennen und umsortieren lassen — gezeichnet wurden sie dort ohnehin schon,
  sie steckten nur in einem Teil der Konfiguration, den der Editor nicht mehr
  anzeigte.

### Geändert

- **Der runde Knopf und sein Menü sind von „Darstellung" zu „Einträge"
  gewandert**, direkt unter die Liste. Sie enthalten dieselbe Art von Dingen wie
  die Leiste, und eine Seite von der Leiste ins Menü zu schieben oder zurück
  hieß bisher, zwischen zwei Bereichen zu wechseln.
