---
title: M3 Weather Card
type: m3-weather-card
category: climate
display: Weather
summary: Temperature curve, precipitation bars, sun markers
table_order: 3
---

A weather card with a header (icon/temperature/condition/chips), a smoothed
temperature curve with gradient fill, hourly precipitation bars, sunrise/
sunset markers on the curve, and an optional daily overview. The header and
chart can be toggled independently (`show_current` / `show_chart`), so the
same card can be trimmed down for a compact mobile layout. At higher `hours`
counts, the icon/temperature strip above the curve automatically thins out
to whichever regular interval (every 2nd, 3rd, ... hour) fits the card's
actual width, keeping hour labels, icons and temperatures aligned to the
same columns.

<details>
<summary>Configuration, examples & options</summary>

<img src="docs/images/weather-card.png" alt="Weather Card" width="440">

```yaml
type: custom:m3-weather-card
entity: weather.forecast_home
```

### Setting up weather data

The card needs some `weather.*` entity — it doesn't generate its own
weather data. If you don't have a `weather` integration set up yet (the
editor shows a matching hint in that case), Home Assistant's built-in
**Met.no** integration works for most locations: free, no API key needed,
automatically uses your Home zone's coordinates.

**Settings → Devices & Services → Add Integration → search for "Met.no" →
confirm the location.** A new `weather.*` entity is then available to pick.

Other weather integrations (OpenWeatherMap, AccuWeather, Pirate Weather,
...) work the same way, but usually require a free API key from the
provider.

The hourly forecast is always loaded; the daily overview only if `days` is
set above 0. Both are fetched via the `weather.get_forecasts` service and
refreshed every 15 minutes. If the weather entity briefly goes
`unavailable` (e.g. a DNS/network hiccup in the integration), the card
keeps showing the last known reading with a "Last known reading · X min
ago" hint instead of going blank — "Unavailable" only appears if no data
was ever received. How many days are actually available depends on the
weather integration (Met.no delivers 6 days max); from 4 days on, the
daily list collapses by default and expands via a button.

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | – (required) | `weather` entity |
| `name` | string | entity's friendly name | Header title |
| `show_current` | boolean | `true` | Icon/temperature/condition header |
| `hours` | number | `12` | Number of hours in the curve |
| `show_chart` | boolean | `true` | Temperature curve + precipitation bars |
| `days` | number | `0` | Number of days in the daily overview (`0` = hidden) |
| `show_days_toggle` | boolean | `true` | Collapsible from 4 days on with a "Show N more" button; `false` = always show all configured days directly |
| `chips` | list (`apparent_temperature`\|`wind_speed`\|`humidity`\|`pressure`\|`uv_index`\|`visibility`) | apparent temp, wind, humidity | Header chips shown |
| `show_sun` | boolean | `true` | Sunrise/sunset markers on the curve (from `sun.sun`) |
| `show_hour_labels` | boolean | `true` | Hour-axis labels above the curve |
| `show_hourly_icons` | boolean | `true` | Weather icons in the hourly strip |
| `show_hourly_temperatures` | boolean | `true` | Temperatures in the hourly strip |
| `show_temp_axis` | boolean | `false` | Overlay temperature y-axis on the curve |
| `accent_color` | string | solar yellow | Curve color |
| `precipitation_color` | string | `#6ba7dc` | Precipitation bar color |
| `gradient_color` | string | same as `accent_color` | Gradient fill under the curve |
| `text_color` / `secondary_text_color` | string | theme default | Temperature/title vs. chips/secondary values |
| `card_background` | string | glass/solid background | Card background |
| `animation` | `auto` \| `on` \| `off` | `auto` | Curve draw-in animation; `auto`/`on` respect `prefers-reduced-motion` |
| `glass_background` | boolean | `true` | Frosted glass background |
| `radius` / `corners` | number / object | `28` | Corner radius, optional per corner |

</details>
