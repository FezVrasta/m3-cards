---
title: M3 Climate Overview Card
type: m3-climate-overview-card
category: climate
display: Climate Overview
summary: Room-by-room temperature/humidity, grouped by area
table_order: 2
---

A compact overview of every temperature/humidity sensor, grouped by room:
one tile per room (temperature + humidity merged), a horizontal comparison
scale with a dot per room, and a header chip pointing out whichever room
deviates furthest from the comfortable range.

<details>
<summary>Configuration, examples & options</summary>

<img src="docs/images/climate-overview-card.png" alt="Climate Overview Card" width="440">

```yaml
type: custom:m3-climate-overview-card
auto_discover: true
```

### Entity source and room grouping

- **`auto_discover: true`** (default): finds every `sensor` entity with
  `device_class: temperature` or `humidity`. Sensors assigned to a Home
  Assistant **area** are grouped into that area's tile (using the area's
  own name/icon); sensors without an area but sharing a **device** (e.g. a
  combo temp+humidity sensor) are grouped by device instead; anything left
  over becomes its own tile, named from its (cleaned-up) entity name.
  Rooms without a temperature sensor are skipped — humidity alone doesn't
  make a room. Filter with `include_area` / `exclude_area` /
  `include_entities` / `exclude_entities` / `include_labels` /
  `exclude_labels` / `include_state` / `exclude_state`.
- **`rooms`**: a manual list (`name`, `icon`, `temperature_entity`,
  `humidity_entity`, `climate_entity`, `color`) instead of auto-discovery —
  set this to build the overview by hand. `color` overrides the
  temperature-stage color that tile would otherwise get from
  `temp_thresholds`.
- **`mode`**: which entities auto-discovery reports on and represents each
  room with. `temperature` (default) is dedicated temperature sensors only —
  a room with none is skipped. `thermostat` reports on both, preferring the
  thermostat's own reading where a room has no dedicated sensor (or where the
  thermostat fronts several physical devices). `thermostat_only` skips any
  room without a `climate` entity. Manual `rooms` gain a matching optional
  `climate_entity`.

`max_visible` caps how many rooms show at once, with the rest behind a
"show more" toggle at the bottom of the grid — useful once auto-discovery
finds more rooms than comfortably fit.

`name_strip` cleans up names picked up from a device/entity rather than an
area (default strips "Temperature"/"Temperatur" suffixes and
"Thermometer N - "/"Thermostat " prefixes) — e.g. "Thermometer 6 -
Arbeitszimmer" becomes "Arbeitszimmer". Since most real setups have areas
only partially configured, this frequently produces more tiles than
distinct rooms (one per un-grouped device) — narrow it down with
`exclude_entities` or switch to a manual `rooms` list for a clean result.

### Color stages, comparison scale, outlier chip

Each tile's temperature is colored by `temp_thresholds` (four boundaries →
five stages: cold/cool/comfortable/warm/hot); humidity turns the warning
color outside `humidity_range`. The comparison scale (`show_scale`) plots
every room's temperature as a dot along the same color gradient, with
room-name labels alternating above/below (dots-only with a tooltip above 8
rooms, or always with `show_scale_labels: false`); it hides itself with
fewer than 2 rooms. The outlier chip (`show_outlier_chip`) highlights
whichever single room sits furthest outside the comfortable band —
coldest on the cold side, warmest on the hot side — and disappears once
every room is comfortable.

`show_trend` adds a small arrow when a room's temperature changed by more
than 0.5 K in the last hour (fetched via the History API, refreshed every
15 minutes). `show_mold_warning` adds a warning icon on tiles above 65%
humidity **and** below 18°C.

### Mold-risk notifications

The editor's "Mold-risk notifications" panel creates (or updates) a Home
Assistant automation that sends a digest notification listing every room
currently over 65% humidity **and** below 18°C — the same rule as
`show_mold_warning`, and independent of whether that icon is switched on
(it only affects the tile, not the notification). Only rooms with both a
temperature and a humidity sensor are covered; the automation stays quiet
when none qualify.

`notify_enabled: true` is the master switch. `notify_service` picks one or
more `notify.*` targets from the live service registry. `notify_mode`
(`daily`, the default, or `weekly`, with `notify_weekday`) and `notify_time`
set the schedule. `notify_title` / `notify_message` override the built-in
wording, with `{anzahl}` (room count) and `{liste}` (comma-separated room
list) available as placeholders.

This is set up from the editor, not YAML: pressing the button (or toggling
the switch on) writes the automation and its id (`notify_automation_id`)
back into the card config, so pressing it again after adding rooms updates
the same automation instead of creating a duplicate. Toggling the switch
off pauses the automation rather than deleting it.

### Opening the thermostat instead of the graph

A tap on a room opens that sensor's own dialog, which is its history graph.
`tile_tap_action: thermostat` opens the room's thermostat instead — the suite's
own `m3-climate-card-mini`, floating over the card, adjustable there and then.

```yaml
type: custom:m3-climate-overview-card
tile_tap_action: thermostat
```

The thermostat is found by looking for a `climate` entity in the same Home
Assistant area as the room. Rooms are usually derived from an area, so that is
right far more often than not — but a room grouped by *device* has no area to
look in, and there `climate_entity` names it outright:

```yaml
rooms:
  - name: Living room
    temperature_entity: sensor.living_room_temperature
    climate_entity: climate.living_room
```

A room with no thermostat keeps the old behaviour and opens the graph. A tap
that opens nothing would be worse than one that opens the wrong thing.

### Tap, hold and the popup

`tap_action` / `hold_action` / `double_tap_action` take the standard Lovelace
action config (`toggle`, `more-info`, `perform-action`, `navigate`, `url`,
`none`) plus one extra kind — `popup` — which opens a dialog over the card,
controlled by `popup.mode`:

- **`default-grid`** (default): this same card again, re-scoped to the tapped
  room (by area if discovered, by its entity list if manual). `popup.*`
  narrows the scope further — `title`, `sort`, `show_header`, plus the usual
  filter fields (`exclude_entities`, `exclude_labels`, …), inherited from the
  outer card unless `inherit_filters: false`.
- **`default-detail`**: Home Assistant's own more-info dialog for the tapped
  room — no card of ours involved.
- **`custom`**: an arbitrary Lovelace card built from `popup.card`. Any string
  value inside it may reference `[[area_id]]`, `[[device_id]]`,
  `[[entity_id]]`, `[[name]]`, `[[temperature_entity]]`,
  `[[humidity_entity]]`, resolved against the tapped room before the card is
  built.

`hold_action` defaults to `popup`, `tap_action` to `more-info`. Setting
`tap_action` explicitly takes over from `tile_tap_action: thermostat`, which
only supplies the *default* tap.

```yaml
type: custom:m3-climate-overview-card
hold_action:
  action: popup
popup:
  mode: default-grid
  sort: name
```

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `auto_discover` | boolean | `true` | Automatic discovery of temperature/humidity sensors |
| `mode` | `temperature` \| `thermostat` \| `thermostat_only` | `temperature` | Which entities auto-discovery reports on |
| `include_area` / `exclude_area` | list\<string\> | – | Area filter for auto-discovery |
| `include_entities` / `exclude_entities` | list\<string\> | – | Entity filter for auto-discovery |
| `include_labels` / `exclude_labels` | list\<string\> | – | Label filter for auto-discovery |
| `include_state` / `exclude_state` | list\<string\> | – | Filter by the sensor's current state (e.g. `unavailable`) |
| `rooms` | list (`name`, `icon`, `temperature_entity`, `humidity_entity`, `climate_entity`, `color`) | – | Manual room list instead of auto-discovery; `color` overrides the computed temperature-stage color |
| `name_strip` | list\<string\> | see above | Name suffixes/prefixes to remove from auto-discovered names |
| `name` / `icon` | string | "Climate" / `mdi:thermometer` | Header |
| `show_header` | boolean | `true` | Card header |
| `tile_tap_action` | `history` \| `thermostat` | `history` | Default tap behaviour, superseded by an explicit `tap_action` |
| `tap_action` / `hold_action` / `double_tap_action` | action config | more-info / popup / none | Tap/hold/double-tap actions; adds a `popup` action kind |
| `popup` | object (`mode`, `title`, `sort`, `show_header`, `card`, filter fields) | – | Popup shown by the `popup` action — see above |
| `max_visible` | number | `0` (all) | Rooms shown at once, rest behind "show more" |
| `sort` | `area` \| `temp_desc` \| `temp_asc` \| `name` | `area` | Tile order |
| `show_scale` | boolean | `true` | Comparison scale below the tile grid |
| `show_scale_labels` | boolean | `true` | Room-name labels on the comparison scale; off leaves only the dots |
| `show_outlier_chip` | boolean | `true` | Header chip for the most conspicuous room |
| `show_trend` | boolean | `false` | Arrow for a >0.5 K change in the last hour |
| `show_mold_warning` | boolean | `false` | Warning icon above 65% humidity and below 18°C |
| `notify_enabled` | boolean | `false` | Master switch for the mold-risk digest automation — see above |
| `notify_service` | list\<string\> | – | `notify.*` targets for the digest |
| `notify_mode` | `daily` \| `weekly` | `daily` | How often the digest runs |
| `notify_time` | string (`HH:MM:SS`) | `09:00:00` | Time of day the digest runs |
| `notify_weekday` | string | `mon` | Weekday for `notify_mode: weekly` |
| `notify_title` / `notify_message` | string | built-in wording | Custom notification text, with `{anzahl}`/`{liste}` placeholders |
| `notify_automation_id` | string | auto-generated | Id of the created automation; managed by the editor, not meant to be set by hand |
| `temp_thresholds` | object (`cold`/`cool`/`comfortable`/`warm`) | `19`/`20.5`/`23.5`/`25` | Boundaries between the five color stages |
| `humidity_range` | `[number, number]` | `[35, 65]` | Comfort band; outside it uses the warning color |
| `scale_min` / `scale_max` | number | automatic from the readings | Fixed comparison-scale range |
| `cold_color` / `cool_color` / `comfortable_color` / `warm_color` / `hot_color` | string | blue/teal/green/amber/red | Temperature stage colors |
| `humidity_warn_color` | string | amber | Humidity color outside `humidity_range` |
| `tile_tint_opacity` | number | `12` | Strength of the tile background tint |
| `accent_color` | string | theme default | Header icon accent |
| `accent_opacity` | number | `12` | Strength of the header icon well tint |
| `text_color` / `secondary_text_color` | string | theme default | Room names/values vs. secondary text |
| `card_background` | string | glass/solid background | Card background |
| `animation` | `auto` \| `on` \| `off` | `auto` | Comparison-scale dot animation; `auto`/`on` respect `prefers-reduced-motion` |
| `glass_background` | boolean | `true` | Frosted glass background |
| `radius` / `corners` | number / object | `28` | Corner radius, optional per corner |

</details>
