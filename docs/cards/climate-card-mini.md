---
title: M3 Climate Card Mini
type: m3-climate-card-mini
category: climate
display: Climate Mini
summary: Compact climate variant for narrow layouts
table_order: 1
---

A compact companion card to the full climate card: icon tile + on/off
button on top, name + "current temperature · mode" below that, and a
minus/setpoint/plus stepper at the bottom whose middle segment carries the
target temperature in the active mode's colour. No preset, sensor, or
mode-row support — in exchange, two tiles comfortably fit side by side on a
phone screen. It carries the same two-strength action-glow frame as the full
card (see above), which reads especially well at this size: a row of minis
shows which rooms are heating without any of them spelling it out in text.

<details>
<summary>Configuration, examples & options</summary>

<img src="docs/images/climate-card-mini.png" alt="Climate Card Mini showing the dimmed action-glow frame" width="440">

```yaml
type: custom:m3-climate-card-mini
entity: climate.bedroom
name: Bedroom
glass_background: true
mode_colors:
  heat: "#e57368"
  cool: "#6ba7dc"
```

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | **Required** | `climate.*` entity |
| `name` | string | entity `friendly_name` | Displayed name |
| `icon` | string | `mdi:radiator` (heating only) / `mdi:air-conditioner` | Icon in the icon tile |
| `glass_background` | boolean | `true` | Frosted glass background (off for solid themes) |
| `show_action_glow` | boolean | `true` | Squared-off glow frame around the card: full strength while `hvac_action` reports heating (warm) or cooling (blue), dimmed while `heat`/`cool` is selected but the equipment is idle. Entities that report no `hvac_action` get the full frame from their mode alone |
| `animations` | boolean | `true` | Transitions for icon tile/on-off button/stepper; `false` disables them |
| `unavailable_style` | `dimmed` \| `normal` \| `hidden` | `dimmed` | Display when the entity is `unavailable`/`unknown` |
| `radius` | number (px) | `28` | Card corner radius (editor offers Square/Slightly rounded/Round/Custom) |
| `corners` | object | – | Optional per-corner override: `top_left`, `top_right`, `bottom_right`, `bottom_left` (px) |
| `mode_colors` | object | see [default mode colors](#default-mode-colors) | Color override per HVAC mode |
| `icon_active_color` | string | current mode's color | Icon color when heating/cooling is active (not "off") |
| `icon_inactive_color` | string | `mode_colors.off` | Icon color in the "off" state |
| `power_active_color` | string | current mode's color | On/off button color when active |
| `power_inactive_color` | string | `mode_colors.off` | On/off button color in the "off" state |
| `plus_active_color` | string | current mode's color | Plus button color when active |
| `plus_inactive_color` | string | `mode_colors.off` | Plus button color in the "off" state |
| `minus_active_color` | string | `var(--primary-text-color)` | Minus button color when active |
| `minus_inactive_color` | string | `var(--primary-text-color)` | Minus button color in the "off" state |

Icon, on/off button, and plus color follow `mode_colors` by default
(including "off"), so they can already be adjusted just via
`mode_colors.off`; minus stays neutral by default. `icon_active_color` /
`icon_inactive_color` / `power_active_color` / `power_inactive_color` /
`plus_active_color` / `plus_inactive_color` / `minus_active_color` /
`minus_inactive_color` additionally allow a fully independent color per
element and state.

The on/off button calls `homeassistant.toggle` on the entity. Tapping the
icon tile, the name/status, or the target-temperature display opens the
more-info dialog.

</details>
