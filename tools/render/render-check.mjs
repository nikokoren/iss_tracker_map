// Render check: every view × device × captured position × settings, rendered in Chromium against
// TRMNL's own framework (plugins.css/plugins.js, latest) with the Liquid rendered by Ruby Liquid,
// the smaller views inside real mashups (the plugin twice or four times, so the copies can't
// collide). Adapted from nikokoren/downstream recipe/tools/render-check.mjs.
//
// A case fails when a map isn't built or fully drawn, the map's centre is not under the station
// icon, a side of the map is blank (the 180th meridian), the OpenStreetMap credit is missing or
// covered, the icon didn't load, or the page throws.
//
// Usage (from tools/render, after `npm ci` and `gem install liquid`):
//   npm run check                       # every case
//   SRC=path npm run check              # render another copy of src/ (e.g. the published one)
//   VIEW=full DEVICE=x_land ONLY=dateline JOBS=3 DEBUG=1 npm run check
// Screenshots and results.json go to tools/render/out/ (git-ignored).
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const SRC = path.resolve(process.env.SRC || path.join(root, "src"));
const OUT = path.resolve(process.env.OUT || path.join(here, "out"));
const CACHE = path.join(here, ".cache");
const CHROME = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const FW_CSS = "https://trmnl.com/css/latest/plugins.css";
const FW_JS = "https://trmnl.com/js/latest/plugins.js";
const LATE = !!process.env.LATE;

function renderLiquid(view, ctx) {
  const r = spawnSync("ruby", [path.join(here, "render.rb"), SRC, view], { input: JSON.stringify(ctx), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Ruby Liquid, ${view}: ${(r.stderr || "").split("\n")[0]}`);
  return r.stdout;
}

// Payloads captured from the plugin's polling URL (payloads/README.md).
const PAYLOADS = Object.fromEntries(fs.readdirSync(path.join(here, "payloads")).filter((f) => f.endsWith(".json"))
  .map((f) => [f.replace(/\.json$/, ""), JSON.parse(fs.readFileSync(path.join(here, "payloads", f), "utf8"))]));

// The settings as the TRMNL form sends them (src/settings.yml), in two opposite combinations.
const SETTINGS = {
  metric: { tz: "Europe/Berlin", fields: { units: "Metric", time_format: "24h", show_timestamp: "Yes", random_rotation: "true", show_iss_events: "true" } },
  imperial: { tz: "America/New_York", fields: { units: "Imperial", time_format: "Auto", show_timestamp: "false", random_rotation: "false", show_iss_events: "true" } },
};

const DEVICES = {
  og_1bit: { cls: "screen--og screen--md screen--1bit", w: 800, h: 480 },
  og_2bit: { cls: "screen--og screen--md screen--2bit", w: 800, h: 480 },
  // The framework scales the X's 1040×780 CSS layout by 1.8 itself, so the page is 1872×1404.
  x_land: { cls: "screen--v2 screen--lg screen--density-2x screen--4bit", w: 1872, h: 1404 },
  x_port: { cls: "screen--v2 screen--lg screen--density-2x screen--4bit screen--portrait", w: 1404, h: 1872 },
};
const LAYOUTS = { // view → mashup wrapper and how many copies of the plugin share the screen
  full: { mashup: null, copies: 1 },
  half_horizontal: { mashup: "mashup--1Tx1B", copies: 2 },
  half_vertical: { mashup: "mashup--1Lx1R", copies: 2 },
  quadrant: { mashup: "mashup--2x2", copies: 4 },
};

function page(view, device, payload, settings) {
  const S = SETTINGS[settings];
  const ctx = { ...PAYLOADS[payload], trmnl: { user: { time_zone_iana: S.tz }, plugin_settings: { custom_fields_values: S.fields } } };
  let body = renderLiquid(view, ctx);
  // LATE=1: the load order a host may give the plugin instead of the plain one. The plugin's
  // external scripts (MapLibre) load only after its inline script has run, as when markup is
  // inserted with innerHTML and its <script src> tags are re-created; the framework script comes
  // 300 ms later, and the screen's size classes 600 ms later, as in TRMNL's preview (Downstream
  // DESIGN_PHILOSOPHY: "TRMNL's preview adds them after load").
  if (LATE) body = body.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
    `<script>(function(){var s=document.createElement("script");s.src=${JSON.stringify(src)};document.head.appendChild(s);})();</script>`);
  const one = `<div class="view view--${view}">${body}</div>`;
  const L = LAYOUTS[view];
  const inner = L.mashup ? `<div class="mashup ${L.mashup}">${one.repeat(L.copies)}</div>` : one;
  const cls = DEVICES[device].cls;
  if (LATE) return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FW_CSS}"></head>
<body class="environment trmnl"><div class="screen">${inner}</div>
<script>
setTimeout(function(){var s=document.createElement("script");s.src=${JSON.stringify(FW_JS)};document.head.appendChild(s);}, 300);
setTimeout(function(){document.querySelector(".screen").className="screen ${cls}";}, 600);
</script></body></html>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FW_CSS}"><script src="${FW_JS}"></script></head>
<body class="environment trmnl"><div class="screen ${cls}">${inner}</div></body></html>`;
}

const pages = new Map();
const server = http.createServer((req, res) => {
  const html = pages.get(req.url);
  res.writeHead(html ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
  res.end(html || "");
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const cases = [];
for (const view of (process.env.VIEW ? [process.env.VIEW] : Object.keys(LAYOUTS)))
  for (const device of (process.env.DEVICE ? [process.env.DEVICE] : Object.keys(DEVICES)))
    for (const payload of (process.env.ONLY ? [process.env.ONLY] : Object.keys(PAYLOADS)))
      for (const settings of Object.keys(SETTINGS)) cases.push({ view, device, payload, settings });

const browser = await chromium.launch({
  executablePath: CHROME, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
// Every outside request (framework, MapLibre, TRMNL's tiles, the icon, and for the published
// version Leaflet and CARTO's tiles) through a disk cache fetched by Node with retries: Chromium's
// own fetches through this sandbox's proxy fail now and then and leave maps half drawn (seen in
// Downstream). Needs NODE_USE_ENV_PROXY=1, as `npm run check` sets.
async function cached(url) {
  const key = path.join(CACHE, crypto.createHash("sha1").update(url).digest("hex"));
  if (fs.existsSync(key + ".json")) return { meta: JSON.parse(fs.readFileSync(key + ".json", "utf8")), body: fs.readFileSync(key) };
  let last;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url);
      const body = Buffer.from(await r.arrayBuffer());
      const meta = { status: r.status, type: r.headers.get("content-type") || "application/octet-stream" };
      if (r.status < 500) {
        if (r.ok) { fs.writeFileSync(key, body); fs.writeFileSync(key + ".json", JSON.stringify(meta)); }
        return { meta, body };
      }
      last = new Error(`HTTP ${r.status}`);
    } catch (e) { last = e; }
    await new Promise((res) => setTimeout(res, 500 * 2 ** i));
  }
  throw last;
}
// One browser context per screen: pages of different sizes rendering at once in one context
// came out as a garbled screenshot (seen: the X landscape plugin drawn twice, side by side).
const contexts = {};
async function contextFor(device) {
  if (contexts[device]) return contexts[device];
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    try {
      const { meta, body } = await cached(route.request().url());
      route.fulfill({ status: meta.status, contentType: meta.type, body, headers: { "access-control-allow-origin": "*" } });
    } catch { route.abort(); }
  });
  return (contexts[device] = ctx);
}

// Luminance statistics of a page-pixel rectangle of a PNG (mean 0 to 255, and "ink": the share
// of pixels darker than 200), plus whether its left and right
// strips (8 % each) hold any ink: a blank strip is the far side of the 180th meridian undrawn.
async function pixels(p, png, rects) {
  return p.evaluate(async ({ b64, rects }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext("2d");
    g.drawImage(img, 0, 0);
    return rects.map((r) => {
      const x0 = Math.max(0, Math.round(r.left)), y0 = Math.max(0, Math.round(r.top));
      const w = Math.min(cv.width - x0, Math.round(r.width)), h = Math.min(cv.height - y0, Math.round(r.height));
      const d = g.getImageData(x0, y0, w, h).data;
      let sum = 0, ink = 0, n = 0;
      const strip = Math.max(1, Math.round(w * 0.08));
      let inkL = 0, inkR = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        sum += l; n++;
        if (l < 200) ink++;
        if (l < 235) { if (x < strip) inkL++; else if (x >= w - strip) inkR++; }
      }
      return { mean: sum / n, ink: ink / n, inkL: inkL / (strip * h), inkR: inkR / (strip * h) };
    });
  }, { b64: png.toString("base64"), rects });
}

async function runCase(c) {
  const id = `${c.view}.${c.device}.${c.payload}.${c.settings}`;
  const D = DEVICES[c.device];
  pages.set(`/${id}`, page(c.view, c.device, c.payload, c.settings));
  const p = await (await contextFor(c.device)).newPage();
  await p.setViewportSize({ width: D.w, height: D.h });
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  if (process.env.DEBUG) p.on("console", (m) => console.log("   console:", m.type(), m.text().slice(0, 200)));
  await p.goto(`${base}/${id}`);
  await p.waitForFunction(() => window.TRMNL_PLUGINS_READY === true, null, { timeout: 30000 }).catch(() => errors.push("TRMNL_PLUGINS_READY never true"));
  const native = await p.evaluate(() => document.querySelectorAll(".iss-map.map").length > 0);
  if (native) {
    // As TRMNL's screenshot service does after setting the capture pixel ratio (TRMNLMaps.refresh
    // JSDoc): rebuild the watched maps against the final paint and wait for them to settle. Then
    // MapLibre's own idle on every map, up to 20 s (software WebGL is slow).
    // LATE: give the plugin's own waiting time to run out before measuring.
    if (LATE) await p.waitForFunction(() => [...document.querySelectorAll(".iss-map")].every((el) => el.__issMap), null, { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => window.TRMNLMaps && TRMNLMaps.refresh({ maxWaitMs: 60000 }));
    await p.evaluate(() => Promise.race([
      Promise.all([...document.querySelectorAll(".iss-map")].map((el) => new Promise((r) => {
        const m = el.__issMap;
        if (!m || (m.loaded() && m.areTilesLoaded() && !m.isMoving())) return r();
        m.once("idle", r);
      }))),
      new Promise((r) => setTimeout(r, 20000)),
    ]));
  } else {
    // The published version (Leaflet): its own 60 ms resize, then the tiles.
    await p.waitForFunction(() => [...document.querySelectorAll(".leaflet-tile")].every((t) => t.complete), null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(500);
  }
  if (process.env.DEBUG) console.log(await p.evaluate(() => [".screen", ".view", ".iss", ".iss-map", ".iss-map > *", ".maplibregl-canvas"]
    .flatMap((s) => [...document.querySelectorAll(s)].map((e) => { const b = e.getBoundingClientRect(); return `   ${s} "${e.className}" ${b.left | 0},${b.top | 0} ${b.width | 0}x${b.height | 0} client ${e.clientWidth}x${e.clientHeight}`; })).join("\n")));
  const check = await p.evaluate(({ copies, payload, native }) => {
    const fails = [], notes = [];
    const roots = [...document.querySelectorAll(".iss")];
    if (roots.length !== copies) fails.push(`plugin copies ${roots.length} != ${copies}`);
    const rects = [], sizesAll = [];
    const hit = (a, b) => a && b && a.width > 0 && b.width > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    for (const root of roots) {
      const el = root.querySelector(".iss-map");
      const r = el.getBoundingClientRect();
      rects.push({ left: r.left, top: r.top, width: r.width, height: r.height });
      const icon = root.querySelector(".iss-icon");
      if (!icon.complete || !icon.naturalWidth) fails.push("station icon not loaded");
      // The place name, fitted by the framework (data-value-fit): it must lie inside the
      // nearest box that clips it (overflow not visible; its padding box). Its fitted size goes
      // into the notes.
      for (const t of root.querySelectorAll("[data-value-fit]")) {
        if (!t.offsetParent) continue;
        let clip = t.parentElement;
        while (clip && clip !== root && getComputedStyle(clip).overflowX === "visible") clip = clip.parentElement;
        const b = clip.getBoundingClientRect(), k = clip.offsetWidth ? b.width / clip.offsetWidth : 1;
        const left = b.left + clip.clientLeft * k, right = left + clip.clientWidth * k;
        const tr = t.getBoundingClientRect(), name = t.textContent.trim().slice(0, 40);
        if (tr.left < left - 1 || tr.right > right + 1) fails.push(`place name cut: "${name}" (${Math.round(tr.left - left)}, ${Math.round(right - tr.right)} page px inside)`);
        if (t.style.fontSize) notes.push(`place name fitted: "${name}" ${t.style.fontSize}`);
      }
      // The bigger text on the X must still fit: a KPI whose value or label overflows is cut.
      for (const k of root.querySelectorAll(".iss-kpi")) {
        if (k.offsetParent && k.scrollWidth > k.clientWidth + 1) fails.push(`KPI cut: "${k.textContent.trim().replace(/\s+/g, " ")}"`);
      }
      // Word spacing: every space in the place name, as a share of its font size. A text font's
      // space is about 0.25 em; the emoji font's, which spread the words apart, is far wider.
      const loc = root.querySelector(".iss-locname, .iss-text");
      const sizes = { text: loc ? parseFloat(getComputedStyle(loc).fontSize) : null };
      const node = loc && loc.firstChild;
      if (node && node.nodeType === 3) {
        for (let i = node.data.indexOf(" "); i >= 0; i = node.data.indexOf(" ", i + 1)) {
          const range = document.createRange();
          range.setStart(node, i); range.setEnd(node, i + 1);
          const em = range.getBoundingClientRect().width / (r.width / el.clientWidth) / sizes.text;
          sizes.space = Math.max(sizes.space || 0, em);
          if (em > 0.5) { fails.push(`wide space in "${node.data.trim()}" (${em.toFixed(2)} em)`); break; }
        }
      }
      const kv = root.querySelector(".iss-value");
      if (kv) sizes.kpi = parseFloat(getComputedStyle(kv).fontSize);
      sizesAll.push(sizes);
      if (!native) continue;
      const m = el.__issMap;
      if (!m || !el.querySelector("canvas")) { fails.push("map not built"); continue; }
      if (!m.loaded() || !m.areTilesLoaded()) fails.push("map not fully drawn");
      if (!m.getRenderWorldCopies()) fails.push("world copies off");
      if (!Number.isInteger(m.getZoom())) fails.push(`zoom ${m.getZoom()} is not whole (no dithering)`);
      // The station sits where the map's centre is: the icon is centred by CSS, the map by its
      // camera; compare the projected position with the icon's centre in page pixels.
      const pos = [Number(payload.lon), Number(payload.lat)];
      const k = r.width / el.clientWidth;
      const pt = m.project(pos);
      const ic = root.querySelector(".iss-craft").getBoundingClientRect();
      const dx = r.left + pt.x * k - (ic.left + ic.width / 2), dy = r.top + pt.y * k - (ic.top + ic.height / 2);
      if (Math.hypot(dx, dy) > 3 * k) fails.push(`icon ${Math.hypot(dx, dy).toFixed(1)} px off the station`);
      // The OpenStreetMap credit: present, shown, inside the map, not under the pill, timestamp or
      // icon. (Not elementFromPoint: the credit has pointer-events: none, so hit tests skip it.)
      const credit = el.querySelector(".map__attribution");
      if (!credit) { fails.push("map credit missing"); continue; }
      const cs = getComputedStyle(credit);
      if (cs.display === "none" || cs.visibility !== "visible" || Number(cs.opacity) < 1) fails.push("map credit hidden");
      const a = credit.getBoundingClientRect();
      if (a.left < r.left - 1 || a.right > r.right + 1 || a.top < r.top - 1 || a.bottom > r.bottom + 1) fails.push("map credit outside the map");
      for (const [name, sel] of [["pill", ".iss-pill, .iss-mini-pill"], ["timestamp", ".iss-timestamp"], ["icon", ".iss-craft"]]) {
        const o = root.querySelector(sel);
        if (o && o.offsetParent && hit(a, o.getBoundingClientRect())) fails.push(`map credit covered by the ${name}`);
      }
    }
    return { fails, notes, rects, sizes: sizesAll };
  }, { copies: LAYOUTS[c.view].copies, payload: PAYLOADS[c.payload], native });
  const png = await p.screenshot({ path: path.join(OUT, `${id}.png`) });
  const px = await pixels(p, png, check.rects);
  for (const s of px) {
    if (s.mean > 254) check.fails.push("map area blank");
    else if (native && (s.inkL === 0 || s.inkR === 0)) check.fails.push(`a side of the map is blank (left ${s.inkL.toFixed(3)}, right ${s.inkR.toFixed(3)})`);
  }
  const fails = [...check.fails, ...errors];
  results.push({ id, ...c, ok: fails.length === 0, fails, notes: check.notes, map: px, sizes: check.sizes });
  const m0 = px[0] ? `map mean ${px[0].mean.toFixed(0)}, ink ${(px[0].ink * 100).toFixed(0)}%` : "";
  console.log(`${fails.length ? "FAIL" : "ok  "} ${id}  ${m0}${fails.length ? "  " + fails.join("; ") : ""}`);
  await p.close();
}

const results = [];
// A few cases at a time (JOBS, default 3): software WebGL is CPU-bound.
const queue = [...cases];
await Promise.all(Array.from({ length: Number(process.env.JOBS || 3) }, async () => {
  while (queue.length) {
    const c = queue.shift();
    await runCase(c).catch((e) => {
      const id = `${c.view}.${c.device}.${c.payload}.${c.settings}`;
      results.push({ id, ...c, ok: false, fails: [`error: ${String(e.message || e).split("\n")[0]}`] });
      console.log(`FAIL ${id}  error: ${String(e.message || e).split("\n")[0]}`);
    });
  }
}));
await browser.close();
server.close();
results.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} cases pass`);
const noted = results.filter((r) => r.notes && r.notes.length).length;
if (noted) console.log(`${noted} with the place name fitted smaller (see results.json)`);
process.exit(bad ? 1 : 0);
