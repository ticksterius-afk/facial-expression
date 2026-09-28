#!/usr/bin/env node
// Copies the shared model into the Swift package (SwiftPM resources must live
// inside the package). `--check` fails if the copy is stale (used in CI).
import { copyFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../../model/emotion-model.json", import.meta.url));
const dst = fileURLToPath(new URL("../../ios/EmotionEngine/Sources/EmotionEngine/Resources/emotion-model.json", import.meta.url));
if (process.argv.includes("--check")) {
  let same = false;
  try { same = readFileSync(src, "utf8") === readFileSync(dst, "utf8"); } catch { /* missing */ }
  if (!same) { console.error("iOS model copy is stale; run: npm run sync:ios"); process.exit(1); }
  console.log("iOS model copy is up to date");
} else {
  copyFileSync(src, dst);
  console.log("copied model/emotion-model.json -> ios/EmotionEngine/Sources/EmotionEngine/Resources/");
}
