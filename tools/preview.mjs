#!/usr/bin/env node
// tools/preview.mjs
//
// Builds a local, side-by-side reproduction of the mashup bleed.
//
// It writes two HTML files that are identical except for one thing: whether
// this plugin's <style> blocks are present. The other quadrant is a stock
// weather-shaped plugin built only from framework classes.
//
//   preview/control.html   weather quadrant, no ISS styles
//   preview/mashup.html    weather quadrant, ISS styles included
//
// Any visual difference in the WEATHER quadrant between those two files is
// this plugin leaking. That is the whole test, and it needs no TRMNL account,
// no device and no Liquid rendering: <style> blocks are static text, so the
// bleed reproduces without any template data.
//
// USAGE
//   node tools/preview.mjs                 # read ./src, write ./preview
//   node tools/preview.mjs --src=path      # read style blocks from elsewhere
//   node tools/preview.mjs --out=dir

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, extname, relative, resolve } from "node:path";

const FRAMEWORK_CSS_URL = "https://usetrmnl.com/css/latest/plugins.css";
const FRAMEWORK_JS = "https://usetrmnl.com/js/latest/plugins.js";
const CACHE_DIR = ".cache";
const CACHED_CSS = join(CACHE_DIR, "plugins.css");

// The framework stylesheet is ~18MB. Referencing it by URL from a file:// page
// is slow at best and blocked outright at worst, and a preview that silently
// renders unstyled is worse than no preview, so it is cached and linked
// relatively instead.
async function ensureFrameworkCss() {
  if (existsSync(CACHED_CSS)) return;
  process.stderr.write(`fetching ${FRAMEWORK_CSS_URL} (once, into ${CACHED_CSS}) ... `);
  const res = await fetch(FRAMEWORK_CSS_URL);
  if (!res.ok) throw new Error(`${res.status} fetching framework CSS`);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHED_CSS, Buffer.from(await res.arrayBuffer()));
  process.stderr.write("done\n");
}

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const srcDir = getArg("src", "src");
const outDir = getArg("out", "preview");

function collect(dir) {
  if (!existsSync(dir)) return [];
  if (statSync(dir).isFile()) return [dir];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if ([".liquid", ".html", ".css"].includes(extname(full))) out.push(full);
  }
  return out.sort();
}

// Pull the <style> blocks out. These are static, so no Liquid engine needed.
function extractStyles(file) {
  const source = readFileSync(file, "utf8");
  if (extname(file) === ".css") return [source];
  const blocks = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

const files = collect(srcDir);
const styles = [];
for (const f of files) {
  for (const block of extractStyles(f)) {
    styles.push({ file: f, css: block });
  }
}

// A weather plugin built purely from framework classes: current conditions on
// top, a six-hour strip below. The strip is the part that broke in the report
// — each hour is a narrow column holding a number and a unit that must stay on
// one line. Anything that widens the gaps or changes the flex direction of a
// shared container shows up here first.
const weatherQuadrant = `
      <div class="view view--quadrant">
        <div class="layout layout--col">
          <div class="columns">
            <div class="column">
              <div class="item">
                <div class="meta"></div>
                <div class="content">
                  <span class="value value--large value--tnums">16.8°</span>
                  <span class="label">Cloud</span>
                </div>
              </div>
            </div>
            <div class="column">
              <div class="item">
                <div class="content">
                  <span class="value value--small">Rain</span>
                  <span class="label">0.0% Chance</span>
                </div>
              </div>
            </div>
          </div>

          <div class="columns" data-probe="hourly">
            ${["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]
              .map(
                (t, i) => `
            <div class="column">
              <div class="item">
                <div class="content">
                  <span class="label label--small">${t}</span>
                  <span class="value value--xxsmall value--tnums">${[16.6, 16.8, 16.8, 17.2, 17.8, 17.8][i]} °C</span>
                </div>
              </div>
            </div>`
              )
              .join("")}
          </div>
        </div>
        <div class="title_bar">
          <span class="title">Met Eireann</span>
          <span class="instance">Mon, Sep 14th</span>
        </div>
      </div>`;

// Stand-in for this plugin. Real markup is not needed to reproduce a leak: the
// <style> block is what travels. If you want the real thing here, paste your
// rendered quadrant markup into src/ and it will be picked up.
const pluginQuadrant = `
      <div class="view view--quadrant iss">
        <div class="layout layout--col layout--center">
          <div class="item">
            <div class="content">
              <span class="value value--large">ISS</span>
              <span class="label">North Pacific</span>
            </div>
          </div>
        </div>
        <div class="title_bar">
          <span class="title">ISS Tracker Map</span>
        </div>
      </div>`;

// The other two cells of the 2x2. Present so the grid geometry matches a real
// mashup, since quadrant width is exactly what the bug changes.
const fillerQuadrant = (name) => `
      <div class="view view--quadrant">
        <div class="layout layout--col layout--center">
          <span class="value value--small">&mdash;</span>
        </div>
        <div class="title_bar"><span class="title">${name}</span></div>
      </div>`;

function page(title, includeStyles, cssHref) {
  const styleBlocks = includeStyles
    ? styles
        .map((s) => `    <!-- from ${s.file} -->\n    <style>\n${s.css}\n    </style>`)
        .join("\n")
    : "    <!-- plugin styles deliberately omitted (control) -->";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <link rel="stylesheet" href="${cssHref}" />
    <script src="${FRAMEWORK_JS}"></script>
  </head>
  <body class="environment trmnl">
    <!-- .trmnl on an ancestor and a device class on .screen are both required:
         the framework defines --gap and the quadrant geometry on
         ".trmnl .screen--<device>", so without them nothing is sized. -->
    <div class="screen screen--og">
      <div class="mashup mashup--2x2">
${weatherQuadrant}
${pluginQuadrant}
${fillerQuadrant("Quote of the day")}
${fillerQuadrant("Days Left This Year")}
      </div>
    </div>
${styleBlocks}
  </body>
</html>
`;
}

await ensureFrameworkCss();
mkdirSync(outDir, { recursive: true });

// Relative so the pair can be opened straight off disk, or committed and
// shared, without depending on where the repo lives.
const cssHref = relative(resolve(outDir), resolve(CACHED_CSS)).split(/[\\/]/).join("/");

writeFileSync(join(outDir, "control.html"), page("Control — no plugin styles", false, cssHref));
writeFileSync(join(outDir, "mashup.html"), page("Mashup — plugin styles included", true, cssHref));

console.log(`\nRead ${styles.length} <style> block(s) from ${files.length} file(s) under ${srcDir}/`);
for (const s of styles) console.log(`  ${s.file}`);
console.log(`\nWrote:`);
console.log(`  ${join(outDir, "control.html")}   weather quadrant alone`);
console.log(`  ${join(outDir, "mashup.html")}    weather quadrant + this plugin's CSS`);
console.log(`\nOpen both and compare the WEATHER quadrant. If it differs, this plugin leaks.\n`);
