#!/usr/bin/env node
// Canonical formatting for model/emotion-model.json: small leaf objects and
// arrays of them stay on one line, everything else is indented. Usage:
//   node scripts/format-model.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../../model/emotion-model.json", import.meta.url));

const isPrim = (v) => v === null || typeof v !== "object";
const isLeaf = (v) => isPrim(v) || (Array.isArray(v) ? v.every(isPrim) : Object.values(v).every((x) => isPrim(x) || (Array.isArray(x) && x.every(isPrim))));
const inline = (v) =>
  isPrim(v) ? JSON.stringify(v)
  : Array.isArray(v) ? `[${v.map(inline).join(", ")}]`
  : Object.keys(v).length === 0 ? "{}"
  : `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }`;

export function formatModel(v, indent = "") {
  if (isLeaf(v) || (Array.isArray(v) && v.every(isLeaf))) return inline(v);
  const pad = indent + "  ";
  if (Array.isArray(v)) return `[\n${v.map((x) => pad + formatModel(x, pad)).join(",\n")}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${pad}${JSON.stringify(k)}: ${formatModel(x, pad)}`).join(",\n")}\n${indent}}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = readFileSync(path, "utf8");
  const out = formatModel(JSON.parse(src)) + "\n";
  if (process.argv.includes("--check")) {
    if (out !== src) { console.error("model/emotion-model.json is not canonically formatted; run: node scripts/format-model.mjs"); process.exit(1); }
  } else writeFileSync(path, out);
}
