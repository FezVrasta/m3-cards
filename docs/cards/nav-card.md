---
title: M3 Nav Card
type: m3-nav-card
category: layout
display: Nav
summary: A bottom or top navigation bar for the dashboard, in five variants
table_order: 11
---

A navigation bar rather than a data card: it links to the views of the
dashboard it lives on. Five variants cover the usual places a bar goes —
`header`/`footer` dock to the top or bottom of the view, `segmented` sits
inline in the card flow as a pill group, `floating` detaches into a rounded
bar over the content, and `sheet` is `floating` plus a drawer that pulls up
over it for extra shortcuts.

Adding the card with no configuration fills it in from the dashboard it was
added to: the first few views become entries, a few more go behind an
optional round action button, and the rest are left for the editor.

<details>
<summary>Configuration, examples & options</summary>

<img src="docs/images/nav-card.png" alt="Nav Card" width="500">
<img src="docs/images/nav-card-sheet-list.png" alt="Nav Card sheet, list style" width="500">
<img src="docs/images/nav-card-sheet-grid.png" alt="Nav Card sheet, grid style" width="500">

```yaml
type: custom:m3-nav-card
style: footer
items:
  - path: /lovelace/home
    icon: mdi:home
    name: Home
  - path: /lovelace/climate
    icon: mdi:thermostat
    name: Climate
  - path: /lovelace/lights
    icon: mdi:lightbulb-group
    name: Lights
```

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `style` | string | `footer` | `header`, `footer`, `segmented`, `floating`, or `sheet` |
| `position` | string | `bottom` | Which edge a docked variant attaches to (ignored by `segmented`) |
| `items` | list | – | The bar's entries — each with `path`, `icon`, `name`, and optional actions, badge and submenu |
| `desktop` / `mobile` | object | – | Override style, width and labels separately per width, split at `breakpoint` |
| `sheet_items`, `sheet_cards` | list | – | Shortcut tiles and/or nested Lovelace cards inside the drawer (`style: sheet` only) |
| `label_visibility` | string | `always` | `always`, `active_only`, `inactive_only`, or `never` |
| `label_position` | string | `below` | Text relative to the icon: `below`, `above`, `left`, `right` |
| `active_style` | string | – | How the current entry's marker is drawn |
| `action_button` | object | – | A round button beside the bar, with its own tap action or a speed-dial menu |
| `size` | number | `1` | Proportional scale for every measurement, `0.7`–`1.5` |
| `accent_color` | string | dashboard accent | Chrome color; a data-card hue would fight the bar's role as pure navigation frame |

The full option list — badges, submenus, page transitions, gestures, glass
background — is exposed through the visual editor.

</details>
