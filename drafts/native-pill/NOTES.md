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

- 2026-10-22: owner's choices: place name bold (`text--bold`; `font--bold` is a deprecated alias),
  event text `title title--small text--bold`, icon logic kept (OK in CLAUDE.md). Note from the
  docs: with the Classic font bundle `text--bold` does nothing on low-density screens (one weight).

- 2026-10-22: owner: text one size larger across the board ("Manitoba seems super small on full
  screen"). Name `title--large` / X `title--xlarge` (compact `title` / X `title--large`), KPI values
  `value--xsmall` / X `value--small`, labels, units and timestamp `label` / X `label--large`, event
  text `title`.

  First check after the bump: 136/144. Full view, OG portrait: the long name shrank to 8px in the
  left half while the KPIs were hidden: the name cell now takes `col--span-2` then (20px). Compact,
  OG portrait: `title` switches to the wider TRMNL21 font and the long name did not fit even at
  8px: `md:portrait:title--small lg:title--large lg:portrait:title--large` (the lg: rules come
  later in plugins.css, so the X keeps its size); it now fits at 8px.

- 2026-10-22: owner: KPI labels back to `label--small` on the OG (`lg:label--large` kept), event
  text back to `title--small` everywhere, place name centred in its box in every view. Render
  check: fails when a pill covers more than half of the station icon (the quadrant's event pill
  hid it at `title` size).

- 2026-10-22: X review. X portrait (full, half horizontal): KPI units cut, "Orbits today" wrapped,
  long name tiny in half the width. The render check's KPI test looked for `.iss-kpi`, which the
  draft does not have, so it checked nothing; now `.iss-kpis .item`, every text inside the item's
  box, labels on one line: 8 failures on X portrait, as seen. Owner: the place name may take two
  lines before it shrinks; event text one size up (`title`). Changes: `lg:portrait:grid--cols-1`
  stacks name and KPIs on the X in portrait; the name has `data-value-fit-max-height`, written by
  the script as twice the title's own line height (a number of pixels, which differs per screen),
  and `text--center`; the compact OG-portrait `title--small` override is gone (wrapping replaces
  it). Long name: full OG 30px on two lines (was 16), X portrait 35px; compact OG 21px two lines,
  OG portrait 13px (was 8).
- 2026-10-22: owner: these changes are for the X only; the OG stays as approved. Event text
  `title--small lg:title--base` (`lg:title` does not exist: 0 matches in plugins.css); the two-line height is written only on `screen--lg` (removed on the
  OG); the compact OG-portrait `md:portrait:title--small` override is back.

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
