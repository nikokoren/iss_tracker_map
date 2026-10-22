# ISS Tracker Map

A [TRMNL](https://usetrmnl.com) recipe that plots the International Space
Station's live position on a world map, with an orbital facts bar underneath.

Published as [recipe 135652](https://trmnl.com/recipes/135652).

## Layout

```
src/                     the plugin, mirroring the TRMNL editor's tabs
  settings.yml           polling and custom fields
  full.liquid
  half_horizontal.liquid
  half_vertical.liquid
  quadrant.liquid
tools/
  lint-scope.mjs         fails on CSS/JS that can escape this plugin
  preview.mjs            renders this plugin next to another in a mashup
  audit-framework-vars.mjs   which framework variables are hijackable
  selftest.mjs           proves the linter still detects what it claims
  render/                render check: every view on every screen, captured data
docs/
  mashup-css-scoping.md  why a plugin can break the plugin next to it
fixtures/                linter test inputs
```

TRMNL remains the source of truth for the published plugin; this repository is
the working copy. Paste changes back into the editor's Markup tab.

## The one rule

A mashup renders every plugin into **one HTML document**. There is no iframe
and no shadow root, so a plugin's `<style>` block is a document-wide
stylesheet: `:root` means `<html>`, and `.layout` means all four quadrants.

Every selector here is therefore scoped under `.iss`, the class the view
templates put on their outermost element.

```css
.iss { --iss-dot-size: 9px; }   /* yes */
:root { --iss-dot-size: 9px; }  /* no — sets it for every plugin on screen */

.iss .layout { gap: 6px; }      /* yes */
.layout { gap: 6px; }           /* no — restyles the neighbouring plugin */
```

`docs/mashup-css-scoping.md` has the measurements behind this, including which
framework variables actually leak and which are harmlessly shadowed.

## Commands

```bash
npm run lint         # fail on anything that can escape .iss
npm test             # prove the linter still catches what it claims
npm run preview      # render a mashup: control vs. this plugin's CSS
npm run audit:vars   # which framework variables are hijackable today
```

### Render check

`tools/render/render-check.mjs` renders every view (the smaller ones inside a
real mashup, two or four copies of the plugin) on the OG at 1 and 2 bit and the
X in landscape and portrait, with the payloads in `tools/render/payloads/` and
both settings combinations, in Chromium against TRMNL's own framework. Liquid
is rendered with Ruby Liquid, the engine TRMNL runs.

```bash
gem install liquid
cd tools/render && npm ci
npm run check                                  # every case
VIEW=quadrant DEVICE=x_land ONLY=dateline-east npm run check   # a subset
SRC=path/to/other/src npm run check            # another copy of the views
```

A case fails when a map isn't built or fully drawn, the station icon is not
on the station's position, a side of the map is blank (the 180th meridian),
the OpenStreetMap credit is missing or covered, the icon didn't load, a KPI
doesn't fit its box, a space in the place name is wider than half its font
size, the place name runs past the box that clips it, or the page throws.
`LATE=1` renders with a late load order: the plugin's own scripts load after
it runs, the framework 300 ms later and the size classes 600 ms later, as in
TRMNL's preview. Screenshots and `results.json` go to `tools/render/out/`
(git-ignored). It is not in CI: it needs Chromium, Ruby and the network.

`npm run lint` runs in CI on every push. It exits non-zero on any selector that
can reach outside `.iss`, which is the regression guard for the mashup
alignment bug.

### Checking a change before publishing

```bash
npm run lint && npm run preview
open preview/control.html preview/mashup.html
```

The two pages are identical except for whether this plugin's styles are
present. Any visual difference in the **weather** quadrant is this plugin
leaking into its neighbour.

Then `npm run check` in `tools/render` (see Render check), and a beta on a
device before touching the published recipe: make a private copy of the
plugin in TRMNL with the same polling URL and custom fields
(`src/settings.yml`), paste the four views into its tabs, and run it on the
device for a day, so the station crosses oceans, land and the 180th meridian.
Also try it in a mashup. The published recipe and its subscribers are not
affected until the same files are pasted there.

## Requirements

Node 18 or newer. No dependencies, except the render check (`tools/render`:
playwright-core, plus Ruby with the liquid gem).

## Views

All four view templates are here. They come in two shapes, and the files within
each pair are identical — change both together:

| file | shape | rendered in a mashup? |
| --- | --- | --- |
| `full.liquid` | map + KPI pill | no |
| `half_horizontal.liquid` | map + KPI pill | yes |
| `quadrant.liquid` | map + mini pill | yes |
| `half_vertical.liquid` | map + mini pill | yes |

There is no `shared.liquid`: the Shared tab is not used, and each view carries
its own markup and script, map included. Moving the common code there would
remove the duplication, at the cost of a structural change to verify in the
editor first.

## Map

The map is TRMNL's own (`TRMNLMaps` on MapLibre 5.24.0, the `outline`
preset), so the framework draws and dithers it for each panel's bit depth.
Until 2026-10 it was Leaflet with CARTO's `light_all` tiles, whose pale greys
came out nearly white on the TRMNL X.

- Zoom is 2 in the full and half horizontal views and 1 in the compact ones.
  That shows the area Leaflet's 3 and 2 did (MapLibre's tiles are 512 px,
  Leaflet's 256). It must be a whole number: the framework dithers only at an
  integer zoom.
- World copies are on: the station crosses the 180th meridian every orbit.
- The icon is placed where the map draws the station, not at the centre: on
  a map about as tall as the world, MapLibre moves the centre toward the
  equator rather than show past the poles.
- The framework writes the OpenStreetMap credit into the map's bottom-right
  corner. The pill sits `bottom--4` (16 px) above the map's edge, clear of it.
- If MapLibre or `TRMNLMaps` is missing, the map area stays empty and the
  pill still shows.

## The pill

Since v1.3 the pill is built from TRMNL Framework 3.4 elements only: no
`<style>` block, no own fonts or sizes (design rule in `CLAUDE.md`; how it was
built, and what the framework forced, in `docs/native-pill.md`).

- Box: `absolute bottom--4 … bg--white outline rounded--medium`, with
  `inverse` instead of `bg--white` for an ISS event.
- Full and half horizontal: a two-column `grid`, name | KPIs (`item` with
  its meta bar, `value`, `label`); on the X in portrait it stacks
  (`lg:portrait:grid--cols-1`). At 520 px wide or narrower (the OG in
  portrait) the KPIs are left out and the name spans both columns.
- Sizes: name `title--large` (X `title--xlarge`), compact views `title`
  (X `title--large`, OG portrait `title--small`); KPI values
  `value--xsmall` (X `value--small`); labels `label--small` (X
  `label--large`); event text `title--small` (X `title--base`), in capitals.
- The place name is fitted by Fit Value (`data-value-fit`): one line on the
  OG, down to 8 px; on the X up to two lines before it shrinks (the script
  writes `data-value-fit-max-height` as two of the title's lines).
- The script only sets text and toggles framework classes, plus three
  things the owner OK'd: the station icon's placement and rotation, event
  text in capitals, and the 520 px rule.
