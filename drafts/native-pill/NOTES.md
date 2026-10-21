# Native pill rework: working notes

To do item 1 in `CLAUDE.md`. The draft views live in `drafts/native-pill/src/`
and render with `SRC=../../drafts/native-pill/src npm run check` from
`tools/render`. `src/` stays v1.3 until the owner has seen a mockup and said OK.

## Status

- 2026-10-21: docs read, plan below.
- 2026-10-21: `src/full.liquid` drafted, no `<style>` block. Renders full view, OG 1-bit, OG
  portrait, X landscape and portrait, Manitoba / Clayton / Cygnus undocking: 24/24. Next: the
  compact views (quadrant, half vertical), then half horizontal (copy of full), full sweep, mockup
  for the owner.
- 2026-10-21: all four views drafted. Long name, longest event (and Manitoba for the wide views),
  OG 1-bit, OG portrait, X landscape and portrait: compact 32/32, full + half horizontal 48/48.
  Next: full sweep in both load orders, then a mockup for the owner.

- 2026-10-21: mockup sent to the owner (v1.3 next to the draft: full OG, full X long name,
  quadrant OG event, half vertical X portrait, full OG portrait). Waiting on: bold place name
  (`font--bold`) or the framework's regular title; event text size (`description` is 12px on the
  OG, v1.3 was bold uppercase 13 to 16px); OK for the script that places and rotates the icon.
  Full sweep of the draft (normal and late load order) was running when the mockup went out.

- 2026-10-21: owner's TRMNL preview of the draft (half horizontal, OG 2-bit): KPIs missing, the
  place name tiny and low in a tall pill. Not reproduced locally (LATE=1 and LATE=2 both showed the
  KPIs). Changed: the width rule measures on screen as v1.3 does and ignores a width of 0; on a
  size change the view re-applies it and calls `window.terminalize()` (framework public API) so Fit
  Value re-fits; the name is the fitted element itself in a left-aligned flex column (no inner
  span). Render check: KPI visibility checked, LATE=2 (classes from the start, layout late), an OG
  2-bit portrait screen. Owner asked: event text in capitals as in v1.3; no uppercase class in
  plugins.css (0 matches); `toUpperCase()` in the script, OK'd by the owner (CLAUDE.md).

## Findings while drafting

- `grid` sets `width:100%`, so on the absolutely placed pill it overrode `right--4` and the pill ran
  off the right edge: the grid goes inside the pill.
- `title` keeps its box at the column's width while its text overflows, so Fit Value (element box
  against parent box) never shrank it. First fix, an inline span inside the title, left the shrunk
  text low in a full-height line; now the title is the fitted element itself, an item of a flex
  column aligned left (full, half horizontal) or centred (compact), so its box is its text's width.
- `inverse` together with `bg--white` left the text black on a 1-bit screen (white on the X):
  the script swaps the two classes instead of adding `inverse`.
- Owner, 2026-10-21: keep the rule that hides the KPIs when the plugin is 520px wide or narrower
  (the OG in portrait is 480px). Native `md:portrait:hidden` also hides them on the X in portrait
  (780px; size prefixes apply upward) and `lg:portrait:grid` loses to it (same specificity, later
  in plugins.css), so it stays a script that toggles `hidden`. OK'd, recorded in CLAUDE.md.
  The compact views never show KPIs (checked on main), so the rule has nothing to do there.
- Render check: an OG portrait screen (`og_port`) added; it was missing.
- In the quadrant on the X the layout is padded (10 CSS px) and the map sits inside that padding,
  while absolute offsets measure from the layout's outer edge: `bottom--4` left the pill 6px above
  the map's edge, over the credit. Map and overlays now sit in one `relative w--full h--full` box.
- In the compact views the name as an inline span inside a full-width `title` wrapped onto two
  lines on the X and was not shrunk; as a centred item of `flex flex--col flex--center-x` with
  `data-value-fit` on the title itself (the docs' own pattern) it fits.

## Framework 3.4 facts used (docs re-fetched 2026-10-21, trmnl.com/framework/docs/3.4/<page>.md)

- `value--xxsmall` 16px, `--xsmall` 20, `--small` 26, `--base` 38 (fixed per tier on every device).
- `label`, `title`, `value` take `lg:` (the X) and `portrait:` variants: `label--small lg:label--base`.
- `outline`: pixel-perfect rounded border; `rounded--medium` 15px, `rounded--small` 7px.
- `inverse`: flips a container and everything in it (the event pill).
- Position: `absolute`, `top--/right--/bottom--/left--{spacing}` (4px steps, half steps 0.5 to 3.5),
  `z--0..3`, with `lg:` variants. Anything drawn over the map needs `bg--white` or `bg--canvas`.
- Grid: `grid--cols-N` is `repeat(N, minmax(0, 1fr))` (plugins.css latest), so a column keeps its
  width whatever its text: Fit Value can shrink text inside it. Flex items have no min-width:0
  utility (none documented; checked size, flex, item), so flex is not used for the name column.
- `item` + `meta` + `content`: a row with a bar at its left (the KPI bars).
- `hidden` toggles display. `w--{n}`/`h--{n}`: 4px scale (`w--14` = 56px).
- Fit Value: `data-value-fit="true"`, single line by width, down to 8px.

## Plan (each line replaces a row of the workaround table in CLAUDE.md)

- Pill: `absolute bottom--4 left--4 right--4 z--2 bg--white outline rounded--medium p--2`; no
  `<style>` block at all. `bottom--4` (16px) clears the map credit (about 13px), so the script that
  moved the pill goes.
- Name | KPIs: `grid grid--cols-2`; name `title` (+ `lg:` step) with `data-value-fit`; KPIs
  `grid grid--cols-3` of `item` (meta bar) with `value value--xxsmall value--tnums` (+ `lg:`) and
  `label label--small` (+ `lg:`); unit as a `label` next to the number.
- Event: pill gets `inverse`; KPIs `hidden`, event text shown as a wrapping `label`; the pill grows
  with the text, so no fitting script.
- Timestamp: `absolute top--2 left--2 z--2 bg--white label label--small`.
- Fonts: none set; the framework's own (also ends the wide-space problem).
- Icon: `w--14 h--14` (56px), no filter (the PNG is already black: 94,160 of 94,370 opaque pixels
  are pure black). Its placement at the projected position and the random rotation stay script:
  no native way to put custom art on the map. Needs the owner's OK.

## Open questions for the owner

- Icon placement and rotation by script (above).
- The look changes: framework fonts instead of system-ui, 50/50 columns instead of 53/47, no
  uppercase event text (no utility for it).
