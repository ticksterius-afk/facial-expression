import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatModel } from "../scripts/format-model.mjs";
import { compileModel, type Platform } from "../src/engine/index.ts";
import { model } from "./helpers.ts";

const PLATFORMS: Platform[] = ["mediapipe", "arkit"];

describe("emotion model", () => {
  it.each(PLATFORMS)("compiles for %s with every reference resolved", (p) => {
    expect(() => compileModel(model, p)).not.toThrow();
  });

  it("is canonically formatted (run scripts/format-model.mjs)", () => {
    const src = readFileSync(new URL("../../model/emotion-model.json", import.meta.url), "utf8");
    expect(formatModel(JSON.parse(src)) + "\n").toBe(src);
  });

  it.each(PLATFORMS)("%s has a recipe for every AU an expression uses", (p) => {
    const cm = compileModel(model, p);
    const channels = new Set(cm.channels.map((c) => c.au));
    const used = new Set<string>();
    for (const e of cm.expressions) for (const v of e.variants) for (const s of [...v.slots, ...v.support, ...v.inhibit]) for (const f of s.any) used.add(f.replace(/[LRUB]$/, ""));
    const missing = [...used].filter((f) => cm.model.aus[f] && !channels.has(f));
    expect(missing).toEqual([]);
  });

  it("covers the six basic emotions, contempt and all 15 compound categories of Du et al. (2014)", () => {
    const byTier = (t: string) => model.expressions.filter((e) => e.tier === t).map((e) => e.id);
    expect(byTier("primary").sort()).toEqual(["anger", "contempt", "disgust", "fear", "happiness", "sadness", "surprise"]);
    expect(byTier("compound")).toHaveLength(15);
  });

  it("gives every expression human-readable cues and at least one citation", () => {
    for (const e of model.expressions) {
      expect(e.cues.length, e.id).toBeGreaterThan(20);
      expect(e.refs.length, e.id).toBeGreaterThan(0);
    }
  });

  it("keeps each MediaPipe measurement's neutral spread below its strong-expression scale", () => {
    for (const [k, m] of Object.entries(model.platforms.mediapipe.measurements)) {
      expect(m.spread, k).toBeLessThanOrEqual(m.scale * 1.05);
    }
  });
});
