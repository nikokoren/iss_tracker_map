#!/usr/bin/env node
// tools/lint-scope.mjs
//
// Finds CSS and JS in a TRMNL plugin that can reach outside the plugin's own
// markup.
//
// WHY THIS EXISTS
// ---------------
// A TRMNL mashup renders every plugin into ONE document. There is no iframe
// and no shadow root, so a plugin's <style> block is a document-wide
// stylesheet. `:root { --gap: 12px }` does not mean "my plugin's root", it
// means the <html> element, and every other plugin in the mashup inherits it.
// `.layout { ... }` does not mean "my layout", it means all four of them.
//
// THE RULE THIS ENFORCES
// ----------------------
// Every selector must be provably confined to a subtree you own. A selector
// is confined when the namespace class appears on the subject compound, or on
// an ancestor of it reachable through descendant/child combinators only.
//
//   .iss .layout          OK   subject .layout is a descendant of .iss
//   .iss.layout           OK   subject is itself .iss
//   .layout               LEAK matches every plugin's layout
//   :root                 LEAK matches <html>
//   .iss ~ .layout        LEAK sibling of .iss is outside .iss
//   .a:not(.iss) .layout  LEAK the namespace only appears inside :not()
//
// USAGE
//   node tools/lint-scope.mjs                      # lint ./src
//   node tools/lint-scope.mjs --ns=.iss src        # explicit namespace
//   node tools/lint-scope.mjs --json               # machine readable
//
// Exit code is 1 when any error-level finding is reported, so this works as a
// CI gate.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";

// ---------------------------------------------------------------------------
// Framework vocabulary
// ---------------------------------------------------------------------------
// Class names the TRMNL framework itself defines and styles. Redefining one of
// these unscoped is the highest-severity finding: it is guaranteed to land on
// markup that belongs to somebody else's plugin. Modifiers are matched by
// prefix (layout--row, view--quadrant, mashup--2x2, ...).
const FRAMEWORK_CLASSES = new Set([
  "screen", "view", "mashup", "layout", "columns", "column", "title_bar",
  "item", "meta", "content", "title", "description", "label", "value",
  "grid", "flex", "image", "richtext", "table", "chart", "clamp", "gap",
  "stretch", "overflow", "list", "divider", "index", "pixel-perfect",
  "text", "b-h", "w-full", "h-full", "background",
]);

// Bare type selectors. A plugin that styles `img` or `p` restyles the whole
// screen, which is how a weather plugin ends up with the wrong line-height.
const HTML_ELEMENTS = new Set([
  "a", "abbr", "article", "aside", "b", "blockquote", "body", "br", "button",
  "canvas", "caption", "code", "div", "dd", "dl", "dt", "em", "fieldset",
  "figure", "figcaption", "footer", "form", "h1", "h2", "h3", "h4", "h5",
  "h6", "header", "hr", "html", "i", "iframe", "img", "input", "label",
  "li", "main", "nav", "ol", "p", "pre", "section", "select", "small",
  "span", "strong", "sub", "sup", "svg", "table", "tbody", "td", "tfoot",
  "th", "thead", "tr", "ul", "video",
]);

// Selectors that always address the document, never your plugin.
const DOCUMENT_SELECTORS = new Set([":root", "html", "body", "*", ":host"]);

// ---------------------------------------------------------------------------
// A tolerant CSS scanner
// ---------------------------------------------------------------------------
// Not a spec-complete parser. It needs to do exactly one thing reliably: walk
// the rule tree while respecting strings, comments and nesting, so that
// selector preludes come out intact and brace counting never desyncs.

// ---------------------------------------------------------------------------
// Liquid neutralisation
// ---------------------------------------------------------------------------
// These files are templates, not HTML. Two things confuse a CSS/HTML scanner:
// a {% comment %} block that discusses markup (the word "<style>" in prose
// would otherwise open a style block), and {% if %} / {{ var }} tags whose
// braces desync brace counting.
//
// Both are blanked rather than deleted, preserving every byte offset and
// newline, so reported line numbers still point at the real source.

function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

function neutralizeLiquid(source) {
  let out = source;
  out = out.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/gi, blank);
  out = out.replace(/\{%-?\s*raw\s*-?%\}[\s\S]*?\{%-?\s*endraw\s*-?%\}/gi, blank);
  out = out.replace(/\{%[\s\S]*?%\}/g, blank);
  out = out.replace(/\{\{[\s\S]*?\}\}/g, blank);
  return out;
}

function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function scanBlock(css, start) {
  // `start` indexes the opening brace. Returns the index of its match, or -1.
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      i = skipString(css, i);
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function skipString(css, start) {
  const quote = css[start];
  for (let i = start + 1; i < css.length; i++) {
    if (css[i] === "\\") { i++; continue; }
    if (css[i] === quote) return i;
  }
  return css.length;
}

function parseRules(css, base = 0) {
  const nodes = [];
  let i = 0;
  let preludeStart = 0;

  while (i < css.length) {
    const c = css[i];

    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'") { i = skipString(css, i) + 1; continue; }

    if (c === "{") {
      const close = scanBlock(css, i);
      if (close === -1) break;
      const prelude = stripCssComments(css.slice(preludeStart, i)).trim();
      const body = css.slice(i + 1, close);
      nodes.push({
        prelude,
        body,
        bodyOffset: base + i + 1,
        offset: base + preludeStart + (css.slice(preludeStart, i).length - css.slice(preludeStart, i).trimStart().length),
      });
      i = close + 1;
      preludeStart = i;
      continue;
    }

    if (c === ";") {
      // An at-rule with no block (@import, @charset) or a stray declaration.
      const text = stripCssComments(css.slice(preludeStart, i)).trim();
      if (text.startsWith("@")) {
        nodes.push({ prelude: text, body: null, offset: base + preludeStart });
      }
      i++;
      preludeStart = i;
      continue;
    }

    i++;
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Selector analysis
// ---------------------------------------------------------------------------

function splitTopLevel(str, delimiter) {
  const parts = [];
  let depth = 0;
  let buf = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"' || c === "'") {
      const end = skipString(str, i);
      buf += str.slice(i, end + 1);
      i = end;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (c === delimiter && depth === 0) { parts.push(buf); buf = ""; continue; }
    buf += c;
  }
  parts.push(buf);
  return parts.map((p) => p.trim()).filter(Boolean);
}

// Split a complex selector into compounds plus the combinator that precedes
// each one. Parenthesised argument lists are kept whole so that a `>` inside
// :has(> .x) is not mistaken for a structural combinator.
function splitCompounds(selector) {
  const out = [];
  let depth = 0;
  let buf = "";
  let pendingCombinator = " ";

  const push = () => {
    const trimmed = buf.trim();
    if (trimmed) out.push({ compound: trimmed, combinator: pendingCombinator });
    buf = "";
  };

  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '"' || c === "'") {
      const end = skipString(selector, i);
      buf += selector.slice(i, end + 1);
      i = end;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;

    if (depth === 0 && (c === ">" || c === "~" || c === "+")) {
      push();
      pendingCombinator = c;
      continue;
    }
    if (depth === 0 && /\s/.test(c)) {
      if (buf.trim()) { push(); pendingCombinator = " "; }
      continue;
    }
    buf += c;
  }
  push();
  return out;
}

// Strip functional-pseudo arguments, so a namespace mentioned only inside
// :not(.iss) is not counted as containment.
function stripPseudoArgs(compound) {
  let out = "";
  let depth = 0;
  for (let i = 0; i < compound.length; i++) {
    const c = compound[i];
    if (c === "(") { depth++; continue; }
    if (c === ")") { depth--; continue; }
    if (depth === 0) out += c;
  }
  return out;
}

// The core question: can this selector match an element that is not inside the
// plugin's own root?
function isConfined(selector, namespaces) {
  const compounds = splitCompounds(selector);
  // Walk right-to-left from the subject. Descendant and child combinators keep
  // us inside an ancestor chain; a sibling combinator steps outside it, so
  // anything further left proves nothing about containment.
  for (let i = compounds.length - 1; i >= 0; i--) {
    const { compound, combinator } = compounds[i];
    const bare = stripPseudoArgs(compound);
    if (namespaces.some((ns) => bare.includes(ns))) return true;
    if (combinator === "~" || combinator === "+") return false;
  }
  return false;
}

function classifySelector(selector) {
  const compounds = splitCompounds(selector);
  const subject = compounds.length ? stripPseudoArgs(compounds[compounds.length - 1].compound) : "";
  const all = compounds.map((c) => stripPseudoArgs(c.compound)).join(" ");

  const normalized = selector.trim().toLowerCase();
  for (const doc of DOCUMENT_SELECTORS) {
    if (normalized === doc || normalized.startsWith(doc + ":") || normalized.startsWith(doc + " ")) {
      return { kind: "document", detail: doc };
    }
  }

  const classes = all.match(/\.[-\w]+/g) || [];
  for (const cls of classes) {
    const name = cls.slice(1);
    for (const fw of FRAMEWORK_CLASSES) {
      if (name === fw || name.startsWith(fw + "--") || name.startsWith(fw + "-")) {
        return { kind: "framework", detail: cls };
      }
    }
  }

  if (all.includes("#")) {
    const id = (all.match(/#[-\w]+/) || [])[0];
    return { kind: "id", detail: id };
  }

  const typeMatch = subject.match(/^([a-zA-Z][-\w]*)/);
  if (typeMatch && HTML_ELEMENTS.has(typeMatch[1].toLowerCase())) {
    return { kind: "element", detail: typeMatch[1] };
  }

  return { kind: "author", detail: selector.trim() };
}

// A selector that already names the namespace but still escapes it is a
// different mistake from one that never mentions it: the reach comes from a
// sibling combinator, and prefixing would not help.
function suggestScoped(selector, ns) {
  const s = selector.trim();
  if (s.includes(ns)) {
    return `A sibling combinator (~ or +) in this selector reaches outside ${ns}. Restructure so the element you are styling is a descendant of ${ns}, not a sibling of it.`;
  }
  return `Write "${ns} ${s}" instead.`;
}

function declaresCustomProperty(body) {
  return /(^|[;{\s])--[-\w]+\s*:/.test(body || "");
}

function usesImportant(body) {
  return /!\s*important/i.test(body || "");
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

function lineAt(source, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

const findings = [];

function report(file, source, offset, level, code, message, hint) {
  findings.push({
    file,
    line: lineAt(source, offset),
    level,
    code,
    message,
    hint,
  });
}

// ---------------------------------------------------------------------------
// CSS walk
// ---------------------------------------------------------------------------

function lintCss(file, source, css, cssOffset, namespaces) {
  const walk = (nodes, insideScopedAt) => {
    for (const node of nodes) {
      const { prelude, body, offset } = node;

      if (prelude.startsWith("@")) {
        const name = (prelude.match(/^@([-\w]+)/) || [])[1] || "";

        if (name === "keyframes" || name === "-webkit-keyframes") {
          const animName = prelude.replace(/^@[-\w]+\s*/, "").trim();
          if (!namespaces.some((ns) => animName.includes(ns.replace(/^\./, "")))) {
            report(file, source, offset, "warn", "global-keyframes",
              `@keyframes "${animName}" is a document-global name.`,
              `Another plugin declaring the same name wins or loses unpredictably. Rename it to something like "${namespaces[0].replace(/^\./, "")}-${animName}".`);
          }
          continue; // keyframe bodies are percentages, not selectors
        }

        if (name === "font-face") {
          report(file, source, offset, "warn", "global-font-face",
            "@font-face registers a font family document-wide.",
            "Harmless if the family name is unique; a collision silently reskins another plugin. Prefix the family name.");
          continue;
        }

        if (name === "import") {
          report(file, source, offset, "warn", "css-import",
            "@import pulls in a stylesheet you do not control.",
            "Whatever it contains is subject to all the same scoping rules, and you cannot audit it here.");
          continue;
        }

        if (body != null) {
          // @media / @supports / @container: the guard does not scope anything,
          // so keep checking the rules inside it.
          walk(parseRules(body, node.bodyOffset), insideScopedAt);
        }
        continue;
      }

      if (body == null) continue;

      for (const selector of splitTopLevel(prelude, ",")) {
        if (isConfined(selector, namespaces)) continue;

        const { kind, detail } = classifySelector(selector);
        const hasVars = declaresCustomProperty(body);
        const important = usesImportant(body);

        if (kind === "document") {
          const vars = (body.match(/--[-\w]+\s*:/g) || []).map((v) => v.replace(/\s*:$/, ""));
          report(file, source, offset, "error", "document-selector",
            `"${selector.trim()}" targets the document, not your plugin.`,
            hasVars
              ? `In a mashup this redefines ${vars.join(", ")} for every plugin on screen. Move these onto your own root element: ${namespaces[0]} { ... }`
              : `In a mashup this styles every plugin on screen. Move it onto your own root element: ${namespaces[0]} { ... }`);
          continue;
        }

        if (kind === "framework") {
          report(file, source, offset, "error", "framework-override",
            `"${selector.trim()}" redefines the framework class ${detail} for the whole screen.`,
            `Every other plugin in a mashup has a ${detail} too, and it will pick this up. ${suggestScoped(selector, namespaces[0])}`);
          continue;
        }

        if (kind === "element") {
          report(file, source, offset, "error", "bare-element",
            `"${selector.trim()}" styles every <${detail}> in the document.`,
            suggestScoped(selector, namespaces[0]));
          continue;
        }

        if (kind === "id") {
          report(file, source, offset, "error", "id-selector",
            `"${selector.trim()}" relies on an id, which must be unique per document.`,
            `Two instances of this plugin in one mashup means two elements with ${detail}; only the first one works. Use a class under ${namespaces[0]} instead.`);
          continue;
        }

        report(file, source, offset, important ? "error" : "warn", "unscoped-selector",
          `"${selector.trim()}" is not scoped to ${namespaces[0]}.`,
          important
            ? "It also uses !important, so any collision is unrecoverable by the other plugin."
            : `It only breaks another plugin on a class-name collision, but there is no reason to take the risk. ${suggestScoped(selector, namespaces[0])}`);
      }
    }
  };

  walk(parseRules(css, cssOffset), false);
}

// ---------------------------------------------------------------------------
// Markup and script walk
// ---------------------------------------------------------------------------

function lintMarkup(file, rawSource, namespaces) {
  // Findings are located against rawSource so line numbers match the file
  // the user opens, while scanning runs on the neutralised copy.
  const source = neutralizeLiquid(rawSource);
  // <style> blocks
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  let sawStyle = false;
  while ((m = styleRe.exec(source)) !== null) {
    sawStyle = true;
    lintCss(file, source, m[1], m.index + m[0].indexOf(m[1]), namespaces);
  }

  // Inline style attributes are self-scoping and therefore always safe, but
  // custom properties set in one can still cascade to descendants. Only worth
  // a note when it defines a variable.
  const inlineRe = /style\s*=\s*"([^"]*--[^"]*)"/gi;
  while ((m = inlineRe.exec(source)) !== null) {
    report(file, source, m.index, "info", "inline-custom-property",
      "Inline style defines a custom property.",
      "Safe for this element and its descendants. Listed so you know where your variables come from.");
  }

  // Duplicate-prone ids
  const idRe = /\sid\s*=\s*["']([^"']+)["']/gi;
  while ((m = idRe.exec(source)) !== null) {
    report(file, source, m.index, "warn", "markup-id",
      `Element carries id="${m[1]}".`,
      "Two instances of this plugin in one mashup produce a duplicate id. Anything binding to it (CSS, a chart library, querySelector) attaches to the first one only.");
  }

  // Unscoped DOM queries
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = scriptRe.exec(source)) !== null) {
    const js = m[1];
    const jsOffset = m.index + m[0].indexOf(js);
    const queryRe = /document\s*\.\s*(getElementById|querySelector|querySelectorAll|getElementsByClassName)\s*\(/g;
    let q;
    while ((q = queryRe.exec(js)) !== null) {
      report(file, source, jsOffset + q.index, "warn", "global-dom-query",
        `document.${q[1]}() searches the whole mashup, not your plugin.`,
        "In a mashup this can return another plugin's element, or your own second instance's. Resolve your root first (document.currentScript.closest('.view')) and query within it.");
    }
  }

  if (!sawStyle) {
    report(file, source, 0, "info", "no-style-block",
      "No <style> block in this file.",
      "Nothing to scope here.");
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function collectFiles(target) {
  const stats = statSync(target);
  if (stats.isFile()) return [target];
  const out = [];
  for (const entry of readdirSync(target)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(target, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else if ([".liquid", ".html", ".htm", ".css"].includes(extname(full))) out.push(full);
  }
  return out.sort();
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const quiet = args.includes("--quiet");
const nsArg = args.find((a) => a.startsWith("--ns="));
const positional = args.filter((a) => !a.startsWith("--"));
const targets = positional.length ? positional : ["src"];

const namespaces = nsArg
  ? nsArg.slice(5).split(",").map((s) => (s.startsWith(".") ? s : "." + s))
  : [".iss-tracker-map", ".iss"];

const files = [];
for (const t of targets) {
  if (!existsSync(t)) {
    console.error(`lint-scope: no such path: ${t}`);
    process.exit(2);
  }
  files.push(...collectFiles(t));
}

if (!files.length) {
  console.error(`lint-scope: no .liquid/.html/.css files under ${targets.join(", ")}`);
  process.exit(2);
}

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (extname(file) === ".css") lintCss(file, source, source, 0, namespaces);
  else lintMarkup(file, source, namespaces);
}

const order = { error: 0, warn: 1, info: 2 };
findings.sort((a, b) =>
  order[a.level] - order[b.level] || a.file.localeCompare(b.file) || a.line - b.line);

const errors = findings.filter((f) => f.level === "error");
const warns = findings.filter((f) => f.level === "warn");

if (asJson) {
  console.log(JSON.stringify({ namespaces, files, findings }, null, 2));
} else {
  const colors = process.stdout.isTTY;
  const paint = (c, s) => (colors ? `\x1b[${c}m${s}\x1b[0m` : s);
  const badge = { error: paint("31", "error"), warn: paint("33", " warn"), info: paint("90", " info") };

  console.log(`\nlint-scope  namespace: ${namespaces.join(", ")}  files: ${files.length}\n`);
  for (const f of findings) {
    if (quiet && f.level === "info") continue;
    console.log(`${badge[f.level]}  ${relative(process.cwd(), f.file)}:${f.line}`);
    console.log(`        ${f.message}`);
    if (f.hint) console.log(paint("90", `        → ${f.hint}`));
    console.log();
  }
  console.log(`${errors.length} error(s), ${warns.length} warning(s)\n`);
  if (errors.length) {
    console.log("Every error above is a rule that can restyle another plugin in a mashup.\n");
  }
}

process.exit(errors.length ? 1 : 0);
