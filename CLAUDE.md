# CLAUDE.md — ISS Tracker Map

TRMNL recipe 135652: the ISS's live position on a world map, with a pill of
place name and orbital facts. Read `README.md` next (layout, the mashup scoping
rule, the render check, the map). Event text is written by
`scripts/iss-events.mjs` in nikokoren/mission_control.

## Design rule (owner, 2026-10-18)

Use **only native TRMNL framework design elements**: its layout, typography
(title, value, label, description and their sizes), utilities, responsive
prefixes (`lg:`, `portrait:`), runtime (Fit Value, Clamp) and map
(`TRMNLMaps`). A workaround (own CSS, own sizes, own fonts, own JS layout) only
after it has been discussed with the owner and the owner has said OK
explicitly. Record each OK here, dated.

Framework docs: https://trmnl.com/framework/docs/3.4 (Markdown at
`<page>.md`). Re-fetch before relying on them.

### OK'd workarounds

- 2026-10-21, owner ("keep that rule"): the full and half horizontal views hide the KPIs when the
  plugin is 520px wide or narrower (the OG in portrait), by script. No native equivalent: see
  `docs/native-pill.md`.
- 2026-10-21, owner ("OK"): the ISS event text is shown in capitals, as in v1.3, by converting the
  text in the script (`toUpperCase()`). plugins.css has no uppercase class (0 matches).
- 2026-10-22, owner ("keep station icon logic as is"): the station icon is custom art placed by
  script at the station's projected position, with the random rotation setting. `TRMNLMaps.dot`
  cannot show an image.

Owner's choices for the native pill, 2026-10-22: place name bold (`text--bold`), event text
`title title--small text--bold`.

- 2026-10-22, owner ("looks good. merge"): the native pill replaces the v1.3 custom CSS in
  `src/`. The place name's two-line Fit Value height is written by the script on the X (a pixel
  number that differs per screen); everything else is framework classes.

Since 2026-10-22 there is no custom CSS in `src/`; the earlier list of workarounds (own pill CSS,
own fonts and sizes, emoji font order, own event fitting, script-moved pill, timestamp) is
resolved. History in `docs/native-pill.md`.

## To do

1. Paste the four views and the settings into the published recipe as v1.3 (owner). Merged to
   main 2026-10-22: native map, native pill, Fit Value, events checked.
2. Watch a real ISS event on the device; the render check covers events only
   with payloads built from real records. Not confirmed on a device yet.
3. **Bring the orbit path into the repo** (owner, 2026-11-07: built with Codex the week before).
   Not on any branch here (checked main, framework-maps, claude/stoic-babbage-z5870f): it lives in
   the TRMNL editor or the Worker. Pasting `src/` into the recipe would overwrite it, so merge it
   in first.
4. **Next event countdown** (owner, 2026-11-07): in quiet times show the next docking, undocking,
   launch or spacewalk ("Cargo Dragon docks in 2 days"). `scripts/iss-events.mjs` in
   nikokoren/mission_control already reads upcoming LL2 records; the Worker would pass the next one
   on. Not started.
5. **Day and night on the map, with city lights** (owner, 2026-11-07). Checked against plugins.js
   v3.4.6 and the map docs, 2026-11-07:
   - City lights: native. `TRMNLMaps.dot(map, lngLat, { hollow: true })` on the night side only
     (sun position decides). City list: Natural Earth populated places (public domain), top ~50.
   - Night shading: no helper for areas (`route` and `dot` only). Documented way: an own MapLibre
     fill layer added with `TRMNLMaps.merge()`, painted with a framework fill (`TRMNLPaint` slot
     through `toMapLibre`: a dither tile on 1- and 2-bit, a solid on 4-bit); the terminator outline
     computed by the script. Counts as a workaround: needs the owner's OK before it is built.
   - Risk to check in a mockup: on 1-bit, land and sea are already dither tiles; a night layer
     over them may hide the coastlines.
   Not started.

## Checks before committing

`npm run lint` and `npm test` (repo root); the render check in `tools/render`
(`npm run check`, and `LATE=1 npm run check` for TRMNL's preview load order).
Report results as numbers. Device-only effects: say "not confirmed on device".
