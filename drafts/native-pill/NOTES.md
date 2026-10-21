# Native pill rework: working notes

To do item 1 in `CLAUDE.md`. The draft views live in `drafts/native-pill/src/`
and render with `SRC=../../drafts/native-pill/src npm run check` from
`tools/render`. `src/` stays v1.3 until the owner has seen a mockup and said OK.

## Status

- 2026-10-21: docs read, plan below, draft views being written. Not rendered yet.

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
