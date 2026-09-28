import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeGolden } from "../scripts/make-golden.ts";

describe("golden parity fixtures", () => {
  it("model/fixtures/golden.json matches the current engine (run `npm run golden` after changing the model)", () => {
    const committed = JSON.parse(readFileSync(new URL("../../model/fixtures/golden.json", import.meta.url), "utf8"));
    const fresh = JSON.parse(JSON.stringify(makeGolden()));
    expect(fresh.modelVersion).toBe(committed.modelVersion);
    for (let s = 0; s < fresh.sequences.length; s++) {
      const a = fresh.sequences[s].frames;
      const b = committed.sequences[s].frames;
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i++) {
        expect(a[i].primary, `${fresh.sequences[s].name} frame ${i}`).toBe(b[i].primary);
        expect(a[i].events).toEqual(b[i].events);
        for (const [k, v] of Object.entries(a[i].scores)) expect(Math.abs((v as number) - b[i].scores[k]), `${k} @${i}`).toBeLessThan(1e-5);
      }
    }
  });

  it("the synthetic session exercises calibration, labels, events and face loss", () => {
    const g = makeGolden();
    const arkit = g.sequences.find((s) => s.name === "arkit-synthetic")!.frames;
    const labels = new Set(arkit.map((f) => f.primary));
    for (const l of ["neutral", "happiness", "anger", "sadness", "surprise"]) expect(labels, l).toContain(l);
    const events = arkit.flatMap((f) => f.events);
    expect(events).toContain("blink");
    expect(events).toContain("yawn");
    expect(events).toContain("micro:surprise");
    expect(arkit.some((f) => !f.face)).toBe(true);
    expect(arkit.at(-1)!.calibrated).toBe(true);
    const complex = new Set(arkit.flatMap((f) => f.complex));
    for (const c of ["happily_surprised", "shame", "yawn"]) expect(complex, c).toContain(c);
  });
});
