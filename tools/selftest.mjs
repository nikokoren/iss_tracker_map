#!/usr/bin/env node
// tools/selftest.mjs — proves the linter still detects what it claims to.
//
// fixtures/leaky.liquid holds one example of every escape route. If the linter
// ever stops flagging one of them, the scope check in CI becomes theatre, so
// this asserts the specific codes rather than just a non-zero exit.

import { execFileSync } from "node:child_process";

function run(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, args, { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? "  ok  " : "FAIL  "}${name}`);
  if (!cond) { failures++; if (detail) console.log(`        ${detail}`); }
};

const leaky = run(["tools/lint-scope.mjs", "--ns=.iss", "--json", "fixtures/leaky.liquid"]);
const leakyCodes = new Set(JSON.parse(leaky.out).findings.map((f) => f.code));
const clean = run(["tools/lint-scope.mjs", "--ns=.iss", "--json", "fixtures/clean.liquid"]);
const cleanFindings = JSON.parse(clean.out).findings.filter((f) => f.level !== "info");

console.log("\nlint-scope selftest\n");
for (const code of [
  "document-selector", "framework-override", "bare-element", "id-selector",
  "unscoped-selector", "global-keyframes", "markup-id", "global-dom-query",
]) {
  check(`detects ${code}`, leakyCodes.has(code), `not present in fixtures/leaky.liquid results`);
}
check("leaky fixture exits non-zero", leaky.code === 1, `exit was ${leaky.code}`);
check("clean fixture is silent", cleanFindings.length === 0,
  cleanFindings.map((f) => `${f.code} @ line ${f.line}`).join(", "));
check("clean fixture exits zero", clean.code === 0, `exit was ${clean.code}`);

// Regression: these files are Liquid. Prose inside {% comment %} that happens
// to mention <style> or .layout used to be parsed as real markup, and CSS
// comments used to be concatenated into the selector text ahead of them.
const liquid = run(["tools/lint-scope.mjs", "--ns=.iss", "--json", "fixtures/liquid.liquid"]);
const liquidFindings = JSON.parse(liquid.out).findings.filter((f) => f.level !== "info");
check("ignores markup discussed inside {% comment %}", liquidFindings.length === 0,
  liquidFindings.map((f) => `${f.code} @ line ${f.line}`).join(", "));
check("liquid fixture exits zero", liquid.code === 0, `exit was ${liquid.code}`);

console.log(`\n${failures ? failures + " failing" : "all passing"}\n`);
process.exit(failures ? 1 : 0);
