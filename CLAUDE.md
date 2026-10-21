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
  `drafts/native-pill/NOTES.md`.
- 2026-10-21, owner ("OK"): the ISS event text is shown in capitals, as in v1.3, by converting the
  text in the script (`toUpperCase()`). plugins.css has no uppercase class (0 matches).

### Workarounds in the code today, not OK'd yet

Found 2026-10-18. Each needs a native replacement or the owner's OK.

| Workaround | Where | Native candidate (not verified yet) |
| --- | --- | --- |
| The whole pill is own CSS: border, radius, padding, row height, KPI bars, colours, inverted event state | all four views | framework layout, item, value, label, title, inverse utilities |
| Own font stack (`system-ui`…) instead of the framework's fonts | all four views | the framework's own typography; also removes the emoji-space fix below |
| Own text sizes in px, one step larger under `.screen--lg` via CSS variables (added 2026-10-17) | all four views | `value--*`, `label--*`, `title--*` with `lg:` variants |
| Emoji fonts listed last to fix wide spaces (added 2026-10-17) | full, half horizontal | goes away with the framework's fonts |
| Event text fitted by the plugin's own script, re-run on screen class changes (2026-10-17) | all four views | Fit Value with `data-value-fit-max-height` (multi-line), or Clamp |
| Pill moved up by script to clear the map credit (2026-10-17) | all four views | position utilities with `lg:` variants, as Downstream's text box does (`bottom--3 lg:bottom--6`) |
| Station icon placed by script at the projected position (2026-10-17) | all four views | needed while the icon is custom art: `TRMNLMaps.dot` cannot show an image; ask |
| Timestamp: own absolute position and size | full, half horizontal | position utilities, `label` |

Native already: the map (`TRMNLMaps`, `outline` preset), the OSM credit, the
place name's fitting (Fit Value).

## To do

1. **Rework the pill to be fully native** (owner, 2026-10-18), per the table
   above. A first attempt exists: commit 6cf0f30 on branch `framework-maps`
   ("Rebuild the chrome on framework utilities", 2026-09-16), taken off main in
   2d6af91 so a bug fix would not ship with a cosmetic change. Read it before
   starting; it predates Framework 3.4 and this session's map work. Mock it up
   and get the owner's OK on the look before it replaces the published one.
2. Merge `claude/stoic-babbage-z5870f` (v1.3: native map, X text sizes, Fit
   Value, events checked) once the owner has pasted it into the published
   recipe.
3. Watch a real ISS event on the device; the render check covers events only
   with payloads built from real records.

## Checks before committing

`npm run lint` and `npm test` (repo root); the render check in `tools/render`
(`npm run check`, and `LATE=1 npm run check` for TRMNL's preview load order).
Report results as numbers. Device-only effects: say "not confirmed on device".
