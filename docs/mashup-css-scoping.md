# Why a plugin's CSS can break the plugin next to it

Notes from investigating a report that the ISS Tracker Map, placed in a 4x4
mashup, changed the layout of an unrelated weather plugin.

## The short version

A mashup renders every plugin into **one HTML document**. There is no iframe
and no shadow root. A plugin's `<style>` block is therefore a document-wide
stylesheet, and `:root` means `<html>`, not "my plugin".

Two things follow:

- `.layout { ... }` styles all four quadrants, not yours.
- `:root { --x: ... }` sets `--x` for every plugin on screen.

The fix is to make every selector a descendant of one class you own.

## What actually leaks, and what does not

The obvious theory is that any `:root` override in a plugin poisons the
mashup. That turns out to be **false**, and the distinction matters when you
are hunting a specific bug.

The framework redefines most of its variables on `.trmnl .screen` and on the
per-device `.screen--<device>` class. Those are nearer ancestors than `<html>`,
so they win by proximity in the inheritance chain and a plugin's `:root`
override is silently discarded.

Measured against the published framework CSS
(`https://usetrmnl.com/css/latest/plugins.css`):

| Declaration in a plugin's `<style>`          | Reaches other plugins? |
| -------------------------------------------- | ---------------------- |
| `:root { --gap: 16px }`                       | No — shadowed by `.trmnl .screen` |
| `:root { --gap-scale: 1.6 }`                  | No — shadowed per device |
| `:root { --content-scale: 1.6 }`              | No — shadowed by `.trmnl .screen` |
| `* { box-sizing: content-box }`               | No observable effect |
| `.layout { gap: 16px; padding: 16px }`        | Slightly — framework's `.view--quadrant .layout` is more specific |
| `:root { --framework-layout-whitespace-factor: 1.6 }` | **Yes** |
| `body { --framework-layout-whitespace-factor: 1.6 }`  | **Yes** |
| `:root { --modifier-scale: 1.6 }`             | **Yes** |
| `.screen { --gap: 16px }`                     | **Yes** |
| `.columns { gap: 14px }`                      | **Yes** |

Run `npm run audit:vars` to regenerate this against the current framework.

### The live wires

Variables leak when nothing nearer than `<html>` defines them. Two groups
qualify:

**1. Pure hooks — referenced as `var(--x, fallback)`, never defined anywhere.**

```
--framework-layout-whitespace-factor
--framework-layout-title-bar-height-factor
--framework-layout-title-bar-padding-factor
--framework-layout-corner-factor
--framework-layout-progress-factor
--framework-font-weight-shift
```

**2. Variables defined only at `:root` and on optional modifier classes.**

```
--modifier-scale          shadowed only if .screen--scale-* is selected
--modifier-text-scale     shadowed only if .screen--text-scale-* is selected
```

Group 2 is why this class of bug is **intermittent**. The same mashup renders
correctly for a user who has a scale modifier set and incorrectly for one who
does not, with no difference in the plugins themselves.

## The mechanism, in full

`--framework-layout-whitespace-factor` is consumed by `.screen`:

```css
.screen { --content-scale: calc(var(--modifier-scale) * var(--framework-layout-whitespace-factor, 1)); }
```

`--content-scale` is referenced in **405 places** in the framework CSS,
including the gap that drives quadrant geometry:

```css
.trmnl .screen--og { --gap: calc(10px * var(--gap-scale) * var(--content-scale)); }
.trmnl .screen--portrait { --quadrant-w: calc((var(--screen-w) - var(--gap) * 2) / 2 - var(--gap) / 2); }
```

So a single declaration in one plugin widens every gap on the screen, which
narrows every quadrant, which narrows the columns inside somebody else's
plugin, which makes their text wrap.

## Reproduction

Measured with the real framework CSS, a 2x2 mashup, and a weather quadrant
holding a six-hour strip. Only the `<style>` block differs between runs.

| | `--gap` | quadrant width | hourly column width | `16.6 °C` |
| --- | --- | --- | --- | --- |
| control | 10px | 385px | 52.5px | one line |
| with `:root { --framework-layout-whitespace-factor: 1.6 }` | 16px | 376px | **44px** | **wraps to two lines** |
| with the same declaration on `.iss` | 10px | 385px | 52.5px | one line |

![control](img/mashup-clean.png)

![leaking](img/mashup-leaking.png)

The second image is the reported bug: the weather plugin's own code never
changed.

Regenerate locally with `npm run preview`, which writes `preview/control.html`
and `preview/mashup.html`. Any difference in the weather quadrant between them
is this plugin leaking.

## The rule

Every selector must be provably confined to a subtree you own. A selector is
confined when your namespace class appears on the subject compound, or on an
ancestor of it reachable through descendant/child combinators only.

```css
.iss .layout          /* OK   subject is a descendant of .iss */
.iss.layout           /* OK   subject is itself .iss */
.layout               /* LEAK matches every plugin's layout */
:root                 /* LEAK matches <html> */
.iss ~ .layout        /* LEAK a sibling of .iss is outside .iss */
.a:not(.iss) .layout  /* LEAK the namespace only appears inside :not() */
```

Sibling combinators are the subtle one. `.iss ~ .layout` mentions the
namespace and still escapes, because it selects a sibling of your root rather
than a descendant.

### Checklist

- Custom properties go on `.iss`, never `:root`, `html`, `body` or `.screen`.
- Never write a bare framework class: `.layout`, `.columns`, `.item`,
  `.value`, `.label`, `.title_bar`, `.view`, `.screen`.
- Never write a bare type selector: `img`, `p`, `svg`, `div`.
- Prefix `@keyframes` and `@font-face` names — those are global.
- Use classes, not ids. Two instances of one plugin in a mashup produce
  duplicate ids, and anything binding to `#x` finds only the first.
- Scope DOM queries. `document.querySelector` searches the whole mashup;
  resolve your own root first and query within it.

`npm run lint` enforces all of the above and exits non-zero on a violation.
