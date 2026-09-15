# Why this plugin broke the plugin next to it

Notes from investigating a report that the ISS Tracker Map, placed in a 4x4
mashup, changed the layout of an unrelated weather plugin.

## The cause

A mashup renders every plugin into **one HTML document**. There is no iframe
and no shadow root, so a plugin's `<style>` block is a document-wide
stylesheet and its `<script>` can see every other plugin's DOM.

This plugin had sixteen rules that could reach outside itself. The one that
produced the reported symptom:

```css
*{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
```

`*` matches every element in the document, so this replaced TRMNL's pixel
fonts (TRMNL16 and friends) with a proportional system font for **every plugin
on screen**. system-ui is wider at the same nominal size, so a neighbour's text
that was tuned to fit its column no longer fit. Where that neighbour's CSS
allowed wrapping, it wrapped; where it did not, it overflowed or clipped.

Measured against the real framework CSS, in a stock weather quadrant with a
six-hour strip:

| | font of `.value` | height | result |
| --- | --- | --- | --- |
| control | TRMNL16 | 16px | `16.6 °C` on one line |
| with `*{font-family:system-ui,…}` | system-ui | 32px | **wraps to two lines** |

![control](img/mashup-clean.png)

![leaking](img/mashup-leaking.png)

The weather plugin's own code never changed.

### The other fifteen

Four framework classes were redefined for the whole screen. Every plugin in a
mashup has these elements, so all of them picked up this plugin's styling:

```css
.layout{position:relative; height:100%}
.value{ font-size:…; display:flex; gap:2px; white-space:nowrap; … }
.label{ font-size:…; white-space:nowrap; color:#222; }
.pill .label{ font-size:var(--kpi-label); }
```

`.row` and `.map` are framework class names too, and were in use here for this
plugin's own elements — so the framework's rules for them were landing on this
plugin's markup as well, in the other direction.

`:root` carried six custom properties, `.craft img` restyled every `<img>` on
screen, `.pill--inverted` used `!important` from an unscoped selector, and
`.screen--half-h` invented a new member of the framework's screen-modifier
namespace.

### The script was worse than the CSS

```js
const root = document.querySelector('.layout');
root.classList.toggle('mode--location-only', isSmall);
```

`document.querySelector` returns the first match **in the whole mashup**.
Verified in a two-plugin mashup with the weather plugin first: `root` resolved
to the *weather* plugin's layout, and the script wrote a class onto it. The ISS
plugin's own layout never got the class, so its responsive mode silently did
nothing. `fitTextToContainer` measured the neighbour's `.locwrap` for the same
reason.

Twelve `getElementById` lookups and `L.map('map')` had a related problem: ids
must be unique per document, so two instances of this plugin in one mashup
would both bind to the first one's elements.

## The fix

Every selector is now a descendant of `.iss`, every class this plugin owns is
prefixed `iss-`, and every DOM lookup goes through a root resolved from
`document.currentScript` rather than through `document`.

Verified: with the fixed style block, a stock weather quadrant renders
byte-identically to the control across four different markup shapes
(`.value`, a bare `<span>`, `.label`, and `.value` with a child `.unit`), and
the script's class toggle lands on the ISS layout with the weather layout
untouched.

## What we checked and ruled out

The first hypothesis was that `:root` custom properties were bleeding. Worth
recording that this is mostly **not** true, because it is the obvious theory
and it is wrong.

The framework redefines most of its variables on `.trmnl .screen` and on the
per-device `.screen--<device>` class. Those are nearer ancestors than `<html>`,
so they win by proximity and a plugin's `:root` override is silently discarded.
Measured:

| Declaration in a plugin's `<style>` | Reaches other plugins? |
| --- | --- |
| `:root { --gap: 16px }` | No — shadowed by `.trmnl .screen` |
| `:root { --gap-scale: 1.6 }` | No — shadowed per device |
| `:root { --content-scale: 1.6 }` | No — shadowed by `.trmnl .screen` |
| `* { box-sizing: content-box }` | No observable effect |
| `.layout { gap; padding }` | Barely — `.view--quadrant .layout` is more specific |
| `:root { --framework-layout-whitespace-factor: 1.6 }` | **Yes** |
| `:root { --modifier-scale: 1.6 }` | **Yes** |
| `.screen { --gap: 16px }` | **Yes** |
| `.columns { gap: 14px }` | **Yes** |

So the six `:root` properties this plugin set were harmless: they are
plugin-specific names (`--kpi-value`, `--pill-radius`) that nothing else reads.
They are scoped now anyway, because relying on nobody else picking the same
name is not a strategy.

`npm run audit:vars` regenerates this against the current framework. The
variables that do leak are the ones with nothing nearer to shadow them: the six
`--framework-layout-*` hooks, which are referenced as `var(--x, fallback)` and
never defined, plus `--modifier-scale` and `--modifier-text-scale`, which are
shadowed only when the user has a `.screen--scale-*` modifier selected. That
last detail means a leak through those two is **user-dependent** — the same
mashup can render correctly for one user and incorrectly for another.

## The rule

A selector is safe when your namespace class appears on the subject compound,
or on an ancestor of it reachable through descendant/child combinators only.

```css
.iss .layout          /* OK   subject is a descendant of .iss */
.iss.layout           /* OK   subject is itself .iss */
.layout               /* LEAK matches every plugin's layout */
:root                 /* LEAK matches <html> */
*                     /* LEAK matches everything */
.iss ~ .layout        /* LEAK a sibling of .iss is outside .iss */
.a:not(.iss) .layout  /* LEAK the namespace only appears inside :not() */
```

### Checklist

- Custom properties go on `.iss`, never `:root`, `html`, `body` or `.screen`.
- Never write `*`, and never a bare type selector (`img`, `p`, `svg`).
- Never write a bare framework class: `.layout`, `.columns`, `.item`,
  `.value`, `.label`, `.row`, `.map`, `.title_bar`, `.view`, `.screen`.
  Do not use those names for your own elements either — the framework styles
  them and that lands on you.
- Prefix `@keyframes` and `@font-face` names; those are global.
- Use classes, not ids, and resolve your root from `document.currentScript`
  before querying.

`npm run lint` enforces all of the above and exits non-zero on a violation.
