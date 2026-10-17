# Captured payloads

What the render check feeds the views. Nothing here is made up; each file is a real response or
real positions in the same shape.

| File | Source | Captured |
| --- | --- | --- |
| `north-pacific.json` | the plugin's polling URL (`src/settings.yml`), as returned | 2026-10-17 15:29 UTC |
| `manitoba.json` | the polling URL, as returned | 2026-10-17 15:31 UTC |
| `clayton-us.json` | the polling URL, as returned | 2026-10-17 15:36 UTC |
| `south-atlantic.json` | the polling URL, as returned | 2026-10-17 16:00 UTC |
| `dateline-east.json` | wheretheiss.at, `/v1/satellites/25544/positions`, timestamp 1792249973 (179.95°E) | 2026-10-17 |
| `dateline-west.json` | the same, timestamp 1792249983 (179.62°W) | 2026-10-17 |
| `south-indian-ocean.json` | the same, timestamp 1792248023 (51.5°S, the orbit's southern limit) | 2026-10-17 |

The polling URL's own source is wheretheiss.at (its `src` field). The last three use that API's
latitude, longitude, altitude and velocity in the polling URL's field names; their `place` is
empty because the polling URL names places itself, so the views show coordinates instead, a
state they handle anyway.

No capture had an ISS event (`special_event.has_event` was false in all 21 positions of one
orbit, 2026-10-17). The `event-*.json` files are captured positions with an event added, built
from real records through the polling URL's own message templates: the event text is written by
`scripts/iss-events.mjs` in nikokoren/mission_control (read 2026-10-17), filled with names from
Launch Library 2 (`ll.thespacedevs.com/2.2.0`, fetched 2026-10-17). Only the minute counts were
picked, inside each template's time window.

| File | Template | LL2 record | Position |
| --- | --- | --- | --- |
| `event-eva-us.json` | EVA active, phrase 0 | Expedition 75 EVA 4 (Adenot, Meir) | `manitoba.json` |
| `event-eva-russian.json` | EVA active, phrase 0, Russian | Expedition 74 EVA 1 (Kud-Sverchkov, Mikayev) | `south-atlantic.json` |
| `event-undocking.json` | Undocking confirmed | Cygnus CRS NG-24 (S.S. Steven R. Nagel), Unity nadir; the longest vehicle name in the last 10 | `clayton-us.json` |
| `event-docking.json` | Docking confirmed | Cargo Dragon C211, Harmony zenith | `north-pacific.json` |
| `event-launch.json` | Launch success | SpaceX Dragon CRS-2 SpX-35 | `dateline-east.json` |
