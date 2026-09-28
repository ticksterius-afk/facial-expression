#!/usr/bin/env node
// Downloads MediaPipe's Face Landmarker model (Apache-2.0) into public/models so
// the app can serve it from its own origin (offline PWA, native wrappers).
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const URL_ = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const out = fileURLToPath(new URL("../public/models/face_landmarker.task", import.meta.url));

if (existsSync(out) && statSync(out).size > 1_000_000) {
  console.log("face_landmarker.task already present");
} else {
  mkdirSync(fileURLToPath(new URL("../public/models/", import.meta.url)), { recursive: true });
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1_000_000) throw new Error(`Unexpectedly small model (${buf.length} bytes)`);
  writeFileSync(out, buf);
  console.log(`Saved ${out} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
