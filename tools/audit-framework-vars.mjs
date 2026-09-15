#!/usr/bin/env node
// tools/audit-framework-vars.mjs
//
// Works out which framework CSS variables a plugin can actually hijack from
// :root, html or body.
//
// The naive assumption is that any `:root { --x }` in a plugin poisons the
// whole mashup. That is not true, and the difference matters when you are
// hunting a real bug. The framework redefines most of its variables on
// `.trmnl .screen` and on the per-device `.screen--<device>` class. Those are
// nearer ancestors than <html>, so they win the cascade by proximity and a
// plugin's :root override is silently discarded.
//
// The variables that DO leak are the ones with nothing nearer to shadow them:
//
//   1. Pure hooks: referenced as var(--x, fallback) and never defined at all.
//   2. Variables defined only at :root and on OPTIONAL modifier classes
//      (.screen--scale-*, .screen--text-scale-*). When the user has not
//      selected that modifier, nothing shadows :root and the override lands.
//
// Category 2 is why this class of bug is intermittent: the same mashup can
// render correctly for a user who has a scale modifier set and incorrectly for
// one who does not.
//
// USAGE
//   node tools/audit-framework-vars.mjs              # fetch latest framework
//   node tools/audit-framework-vars.mjs path.css     # audit a local copy

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CSS_URL = "https://usetrmnl.com/css/latest/plugins.css";
const CACHE = join(".cache", "plugins.css");

// Variables that move geometry. A leak in any of these is what produces the
// "another plugin's text started wrapping" report.
const LAYOUT_CRITICAL = [
  "--gap", "--gap-xsmall", "--gap-small", "--gap-medium", "--gap-large",
  "--gap-scale", "--content-scale", "--ui-scale", "--modifier-scale",
  "--device-ui-scale", "--text-ui-scale", "--modifier-text-scale",
  "--screen-w", "--screen-h", "--quadrant-w", "--quadrant-h",
  "--full-w", "--full-h", "--title-bar-height", "--title-bar-small-height",
];

async function loadCss() {
  const fromArg = process.argv[2];
  if (fromArg) return readFileSync(fromArg, "utf8");
  if (existsSync(CACHE)) {
    console.error(`(using cached ${CACHE})`);
    return readFileSync(CACHE, "utf8");
  }
  console.error(`fetching ${CSS_URL} ...`);
  const res = await fetch(CSS_URL);
  if (!res.ok) throw new Error(`${res.status} fetching framework CSS`);
  const text = await res.text();
  mkdirSync(".cache", { recursive: true });
  writeFileSync(CACHE, text);
  return text;
}

const css = await loadCss();

// The published CSS is minified, so declaration blocks hold no nested braces.
// A flat scan is therefore exact here, and unlike a depth counter it cannot
// desync on a stray brace inside a data: URI.
const definers = new Map(); // var name -> Set of defining selectors
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const [, prelude, body] = m;
  if (body.includes("{")) continue;
  const names = [...body.matchAll(/(--[\w-]+)\s*:/g)].map((x) => x[1]);
  if (!names.length) continue;
  for (const raw of prelude.split(",")) {
    const sel = raw.trim();
    if (!/(^|\s)(:root|html|body)$|\.screen(--[\w-]+)?$/.test(sel)) continue;
    for (const n of names) {
      if (!definers.has(n)) definers.set(n, new Set());
      definers.get(n).add(sel);
    }
  }
}

const referenced = new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const neverDefined = [...referenced].filter((v) => !defined.has(v)).sort();

// A selector shadows :root unconditionally when it is the screen element
// itself (always present), or when it is one of the many per-device classes
// (exactly one of which always matches). Optional appearance modifiers such as
// .screen--scale-large match only when the user has selected them.
const DEVICE_THRESHOLD = 20;
function classify(name) {
  const sels = definers.get(name);
  if (!sels) return { verdict: "undefined", sels: [] };
  const list = [...sels];
  const bareScreen = list.some((s) => /\.screen$/.test(s));
  const modifiers = list.filter((s) => /\.screen--/.test(s));
  const optional = modifiers.filter((s) => /--(scale|text-scale)-/.test(s));
  const deviceish = modifiers.length - optional.length;
  if (bareScreen) return { verdict: "shadowed", why: "defined on .trmnl .screen (always present)", sels: list };
  if (deviceish >= DEVICE_THRESHOLD) return { verdict: "shadowed", why: `defined on ${deviceish} per-device .screen--* classes (one always matches)`, sels: list };
  if (optional.length) return { verdict: "live", why: `only shadowed when the user has a ${optional[0].replace(/.*\.screen/, ".screen")}-style modifier selected`, sels: list };
  return { verdict: "live", why: "nothing nearer than :root defines it", sels: list };
}

const pad = (s, n) => String(s).padEnd(n);
const NAMEW = 26;
console.log("\n" + "=".repeat(78));
console.log("LAYOUT-CRITICAL VARIABLES — can a plugin's :root override reach other plugins?");
console.log("=".repeat(78));
console.log(pad("variable", NAMEW) + pad("verdict", 12) + "why");
console.log("-".repeat(78));

const live = [];
for (const name of LAYOUT_CRITICAL) {
  const { verdict, why } = classify(name);
  if (verdict === "undefined") continue;
  if (verdict === "live") live.push(name);
  const mark = verdict === "live" ? "LIVE WIRE" : "safe";
  console.log(pad(name, NAMEW) + pad(mark, 12) + (why || ""));
}

const layoutHooks = neverDefined.filter((v) => /layout|scale|weight-shift/.test(v));
console.log("\n" + "=".repeat(78));
console.log("PURE HOOKS — referenced with a fallback, never defined anywhere");
console.log("=".repeat(78));
for (const v of layoutHooks) console.log("   LIVE WIRE  " + v);
console.log(`\n   (+${neverDefined.length - layoutHooks.length} further undefined slots, overwhelmingly colour/theme)`);

console.log("\n" + "=".repeat(78));
console.log("SUMMARY");
console.log("=".repeat(78));
console.log(`Setting any of these on :root, html or body in a plugin's <style> block`);
console.log(`changes layout for EVERY plugin in the mashup:\n`);
for (const v of [...layoutHooks, ...live]) console.log("   " + v);
console.log(`\nEverything else in --gap / --*-scale / --screen-* is shadowed by the`);
console.log(`framework's own .screen rules and is therefore not the culprit.\n`);
