# ISS Tracker Map

A [TRMNL](https://usetrmnl.com) recipe that plots the International Space
Station's live position on a world map, with an orbital facts bar underneath.

Published as [recipe 135652](https://trmnl.com/recipes/135652).

## Layout

```
src/                     the plugin, mirroring the TRMNL editor's tabs
  settings.yml           polling and custom fields
  shared.liquid          the only file with a <style> block
  full.liquid
  half_horizontal.liquid
  half_vertical.liquid
  quadrant.liquid
tools/
  lint-scope.mjs         fails on CSS/JS that can escape this plugin
  preview.mjs            renders this plugin next to another in a mashup
  audit-framework-vars.mjs   which framework variables are hijackable
  selftest.mjs           proves the linter still detects what it claims
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

## Requirements

Node 18 or newer. No dependencies.

## Views

All four view templates are here. They come in two shapes, and the files within
each pair are identical — change both together:

| file | shape | rendered in a mashup? |
| --- | --- | --- |
| `full.liquid` | map + KPI pill | no |
| `half_horizontal.liquid` | map + KPI pill | yes |
| `quadrant.liquid` | map + mini pill | yes |
| `half_vertical.liquid` | map + mini pill | yes |

`shared.liquid` is unused. Moving the common CSS there would remove the
duplication, at the cost of a structural change to verify in the editor first.
