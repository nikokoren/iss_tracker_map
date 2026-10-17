# Captured payloads

What the render check feeds the views. Nothing here is made up; each file is a real response or
real positions in the same shape.

| File | Source | Captured |
| --- | --- | --- |
| `north-pacific.json` | the plugin's polling URL (`src/settings.yml`), as returned | 2026-10-17 15:29 UTC |
| `manitoba.json` | the polling URL, as returned | 2026-10-17 15:31 UTC |
| `clayton-us.json` | the polling URL, as returned | 2026-10-17 15:36 UTC |
| `dateline-east.json` | wheretheiss.at, `/v1/satellites/25544/positions`, timestamp 1792249973 (179.95°E) | 2026-10-17 |
| `dateline-west.json` | the same, timestamp 1792249983 (179.62°W) | 2026-10-17 |
| `south-indian-ocean.json` | the same, timestamp 1792248023 (51.5°S, the orbit's southern limit) | 2026-10-17 |

The polling URL's own source is wheretheiss.at (its `src` field). The last three use that API's
latitude, longitude, altitude and velocity in the polling URL's field names; their `place` is
empty because the polling URL names places itself, so the views show coordinates instead, a
state they handle anyway.

None has an ISS event (`special_event.has_event` was false in every capture), so the event
state of the pill is not covered.
