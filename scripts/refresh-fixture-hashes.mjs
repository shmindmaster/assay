#!/usr/bin/env node
// Recompute the sha256 values inside evals/expected/*.json from the files on
// disk. The fixtures pin content hashes so a fabricated claim can be caught; a
// dataset regeneration therefore invalidates them by design. Run this after a
// deliberate regeneration, never to silence a failing check.
//
// Fixtures whose name says `.invalid.` are left alone: their whole purpose is
// to carry a hash that does not match.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_DIR = join(ROOT, "evals", "expected");
const DATA_DIR = join(ROOT, "data");

function sha256OfDataFile(relPath) {
  try {
    return createHash("sha256").update(readFileSync(join(DATA_DIR, relPath))).digest("hex");
  } catch {
    return null;
  }
}

// Walk any shape: rewrite a sha256 that sits beside an expected_path.
function rewrite(node, report) {
  if (Array.isArray(node)) {
    node.forEach((child) => rewrite(child, report));
    return;
  }
  if (!node || typeof node !== "object") return;

  if (typeof node.expected_path === "string" && typeof node.sha256 === "string") {
    const actual = sha256OfDataFile(node.expected_path);
    if (actual && actual !== node.sha256) {
      report.push(`      ${node.expected_path}\n        ${node.sha256} -> ${actual}`);
      node.sha256 = actual;
    }
  }
  for (const value of Object.values(node)) rewrite(value, report);
}

let touched = 0;
for (const name of readdirSync(EXPECTED_DIR)) {
  if (!name.endsWith(".json") || name.includes(".invalid.")) continue;
  const path = join(EXPECTED_DIR, name);
  // Strip a BOM if one crept in; JSON.parse rejects it.
  const doc = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
  const report = [];
  rewrite(doc, report);
  if (report.length) {
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    console.log(`  ${name}`);
    console.log(report.join("\n"));
    touched += 1;
  }
}
console.log(touched ? `\n${touched} fixture(s) refreshed` : "\nno fixture needed refreshing");
