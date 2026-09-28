import { describe, expect, it } from "vitest";
import { compileModel, DefaultBaseline, EmotionEngine, type FrameResult } from "../src/engine/index.ts";
import { PROTOTYPES, arkitFace, model, restFace, rng } from "./helpers.ts";

const cm = compileModel(model, "arkit");
const base = new DefaultBaseline(cm);
const primaries = cm.expressions.filter((e) => e.tier === "primary").map((e) => e.id);

function topPrimary(scores: Record<string, number>): string {
  let best = "neutral";
  let s = model.params.display.primaryMin;
  for (const id of primaries) if (scores[id] > s) { best = id; s = scores[id]; }
  return best;
}

/** Feeds `ms` of frames at 30 fps; `face(t)` returns measurements for time t (ms). */
function run(engine: EmotionEngine, t0: number, ms: number, face: (t: number) => Record<string, number> | null): { t: number; out: FrameResult; all: FrameResult[] } {
  const all: FrameResult[] = [];
  let out!: FrameResult;
  let t = t0;
  for (; t < t0 + ms; t += 1000 / 30) all.push((out = engine.process(t, face(t))));
  return { t, out, all };
}

describe("instantaneous scoring", () => {
  it("reads a resting face as neutral", () => {
    const { scores } = EmotionEngine.evaluate(cm, restFace("arkit"), base);
    expect(topPrimary(scores)).toBe("neutral");
    for (const id of primaries) expect(scores[id], id).toBeLessThan(0.1);
  });

  it.each(Object.keys(PROTOTYPES))("recognises the %s prototype", (id) => {
    const { scores } = EmotionEngine.evaluate(cm, arkitFace(PROTOTYPES[id]), base);
    expect(topPrimary(scores)).toBe(id);
    expect(scores[id]).toBeGreaterThan(0.5);
  });

  it("recognises a compound: happily surprised", () => {
    const { scores } = EmotionEngine.evaluate(cm, arkitFace({ ...PROTOTYPES.surprise, "mouthSmile{S}": 0.75 }), base);
    const compound = Object.entries(scores).filter(([k]) => cm.byId.get(k)!.tier === "compound").sort((a, b) => b[1] - a[1])[0];
    expect(compound[0]).toBe("happily_surprised");
  });

  it("separates felt (Duchenne) from polite smiles by AU6", () => {
    const felt = EmotionEngine.evaluate(cm, arkitFace({ "mouthSmile{S}": 0.7, "cheekSquint{S}": 0.55 }), base).scores;
    const polite = EmotionEngine.evaluate(cm, arkitFace({ "mouthSmile{S}": 0.45 }), base).scores;
    expect(felt.duchenne_smile).toBeGreaterThan(felt.social_smile);
    expect(polite.social_smile).toBeGreaterThan(polite.duchenne_smile);
  });

  it("reads bowed head + lowered gaze without a smile as shame, and with a small smile + head back as pride", () => {
    const shame = EmotionEngine.evaluate(cm, arkitFace({ "pose.pitch": -28, "eyeLookDown{S}": 0.6 }), base).scores;
    expect(shame.shame).toBeGreaterThan(0.5);
    const pride = EmotionEngine.evaluate(cm, arkitFace({ "pose.pitch": 25, "mouthSmile{S}": 0.35 }), base).scores;
    expect(pride.pride).toBeGreaterThan(0.5);
    expect(pride.pride).toBeGreaterThan(pride.shame);
  });

  it("computes the Prkachin–Solomon pain intensity on its 0–16 scale", () => {
    const { aus, scores } = EmotionEngine.evaluate(cm, arkitFace({ "browDown{S}": 0.8, "cheekSquint{S}": 0.6, "eyeSquint{S}": 0.7, "noseSneer{S}": 0.6, "eyeBlink{S}": 0.9 }), base);
    expect(scores.pain).toBeGreaterThan(0.6);
    const e = new EmotionEngine(model, "arkit");
    const r = e.process(0, arkitFace({ "browDown{S}": 0.8, "cheekSquint{S}": 0.6, "eyeSquint{S}": 0.7, "noseSneer{S}": 0.6, "eyeBlink{S}": 0.9 }));
    expect(r.pspi).toBeGreaterThan(12);
    expect(r.pspi).toBeLessThanOrEqual(16);
    expect(aus.AU43).toBeGreaterThan(0.5);
  });

  it("renormalises when a platform omits a measurement", () => {
    const full = arkitFace({ "mouthSmile{S}": 0.8 });
    const { aus: a } = EmotionEngine.evaluate(compileModel(model, "mediapipe"), { ...restFace("mediapipe"), mouthSmileLeft: 0.75, mouthSmileRight: 0.75 }, new DefaultBaseline(compileModel(model, "mediapipe")));
    // geometry missing entirely -> AU12 still driven by the blendshape alone
    const mp = restFace("mediapipe");
    for (const k of Object.keys(mp)) if (k.startsWith("geo.")) delete mp[k];
    const { aus: b } = EmotionEngine.evaluate(compileModel(model, "mediapipe"), { ...mp, mouthSmileLeft: 0.75, mouthSmileRight: 0.75 }, new DefaultBaseline(compileModel(model, "mediapipe")));
    expect(b.AU12).toBeGreaterThan(a.AU12);
    expect(full).toBeDefined();
  });

  it("treats one-sided actions as asymmetry (AU14U) but fades them out in profile views", () => {
    const frontal = EmotionEngine.evaluate(cm, arkitFace({ mouthDimpleLeft: 0.6 }), base).aus;
    const profile = EmotionEngine.evaluate(cm, arkitFace({ mouthDimpleLeft: 0.6, "pose.yaw": 40 }), base).aus;
    expect(frontal.AU14U).toBeGreaterThan(0.5);
    expect(profile.AU14U).toBe(0);
  });
});

describe("stateful engine", () => {
  it("holds a label until a challenger leads for the hold time (hysteresis)", () => {
    const e = new EmotionEngine(model, "arkit");
    let r = run(e, 0, 1000, () => arkitFace(PROTOTYPES.happiness));
    expect(r.out.primary.id).toBe("happiness");
    // a 100 ms flash of surprise is too short to take over the label
    r = run(e, r.t, 100, () => arkitFace(PROTOTYPES.surprise));
    expect(r.out.primary.id).toBe("happiness");
    r = run(e, r.t, 1000, () => arkitFace(PROTOTYPES.surprise));
    expect(r.out.primary.id).toBe("surprise");
  });

  it("calibration removes a person's resting expression", () => {
    // Someone whose relaxed brows sit low (high browDown at rest).
    const resting = arkitFace({ "browDown{S}": 0.55, "eyeSquint{S}": 0.4 });
    const naive = new EmotionEngine(model, "arkit");
    const before = run(naive, 0, 500, () => resting).out;
    expect(before.aus.AU4).toBeGreaterThan(0.2);

    const e = new EmotionEngine(model, "arkit");
    e.startCalibration(0, 1);
    let r = run(e, 0, 1100, () => resting);
    expect(r.all.some((f) => f.calibration.result === "done")).toBe(true);
    expect(r.out.calibrated).toBe(true);
    r = run(e, r.t, 500, () => resting);
    expect(r.out.aus.AU4).toBeLessThan(0.05);
    expect(r.out.primary.id).toBe("neutral");
  });

  it("fails calibration when no face is visible", () => {
    const e = new EmotionEngine(model, "arkit");
    e.startCalibration(0, 1);
    const r = run(e, 0, 1100, () => null);
    expect(r.all.some((f) => f.calibration.result === "failed")).toBe(true);
    expect(r.out.calibrated).toBe(false);
  });

  it("detects blinks and counts them per minute", () => {
    const e = new EmotionEngine(model, "arkit");
    const blinkAt = (t: number) => (t % 3000) > 1000 && (t % 3000) < 1150;
    const r = run(e, 0, 12000, (t) => arkitFace(blinkAt(t) ? { "eyeBlink{S}": 0.95 } : {}));
    const blinks = r.all.flatMap((f) => f.events).filter((ev) => ev.type === "blink");
    expect(blinks.length).toBe(4);
    expect(r.out.blinkRate).toBe(4);
  });

  it("raises PERCLOS for long relaxed closures but not for eyes squeezed shut", () => {
    const relaxed = new EmotionEngine(model, "arkit");
    const closedHalf = (t: number) => (t % 2000) < 1000;
    let r = run(relaxed, 0, 30000, (t) => arkitFace(closedHalf(t) ? { "eyeBlink{S}": 0.95 } : {}));
    expect(r.out.perclos).toBeGreaterThan(0.4);
    expect(r.out.scores.drowsiness).toBeGreaterThan(0.3);

    const squeezed = new EmotionEngine(model, "arkit");
    r = run(squeezed, 0, 30000, (t) => arkitFace(closedHalf(t) ? { "eyeBlink{S}": 0.95, "cheekSquint{S}": 0.6, "browDown{S}": 0.6 } : {}));
    expect(r.out.perclos).toBeLessThan(0.05);
  });

  it("detects a yawn", () => {
    const e = new EmotionEngine(model, "arkit");
    let r = run(e, 0, 500, () => arkitFace({}));
    r = run(e, r.t, 2200, () => arkitFace({ jawOpen: 0.95, "eyeSquint{S}": 0.4 }));
    expect(r.out.aus.YAWN).toBeGreaterThan(0.9);
    expect(r.out.complex.map((c) => c.id)).toContain("yawn");
    r = run(e, r.t, 300, () => arkitFace({}));
    expect(r.all.flatMap((f) => f.events).some((ev) => ev.type === "yawn")).toBe(true);
  });

  it("logs a brief (micro) expression but not a sustained one", () => {
    const e = new EmotionEngine(model, "arkit");
    let r = run(e, 0, 1000, () => arkitFace({}));
    r = run(e, r.t, 200, () => arkitFace(PROTOTYPES.surprise));
    r = run(e, r.t, 800, () => arkitFace({}));
    const micro = r.all.flatMap((f) => f.events).filter((ev) => ev.type === "micro");
    expect(micro).toHaveLength(1);
    expect(micro[0]).toMatchObject({ type: "micro", id: "surprise" });

    const e2 = new EmotionEngine(model, "arkit");
    let r2 = run(e2, 0, 1000, () => arkitFace({}));
    const events: string[] = [];
    r2 = run(e2, r2.t, 2000, () => arkitFace(PROTOTYPES.surprise));
    r2.all.forEach((f) => f.events.forEach((ev) => events.push(ev.type)));
    r2 = run(e2, r2.t, 800, () => arkitFace({}));
    r2.all.forEach((f) => f.events.forEach((ev) => events.push(ev.type)));
    expect(events).not.toContain("micro");
  });

  it("stays neutral and quiet on a noisy resting face", () => {
    const e = new EmotionEngine(model, "arkit");
    const rand = rng(7);
    const r = run(e, 0, 20000, () => {
      const f = restFace("arkit");
      for (const k of Object.keys(f)) f[k] += (rand() - 0.5) * (k.startsWith("pose.") ? 4 : 0.06);
      return f;
    });
    const labels = new Set(r.all.slice(30).map((f) => f.primary.id));
    expect([...labels]).toEqual(["neutral"]);
    expect(r.all.flatMap((f) => f.events).filter((ev) => ev.type === "micro")).toHaveLength(0);
  });

  it("decays to neutral and reports no face when the face is lost", () => {
    const e = new EmotionEngine(model, "arkit");
    let r = run(e, 0, 1000, () => arkitFace(PROTOTYPES.happiness));
    r = run(e, r.t, 1500, () => null);
    expect(r.out.face).toBe(false);
    expect(r.out.primary.id).toBe("neutral");
    expect(r.out.scores.happiness).toBeLessThan(0.05);
    expect(r.out.complex).toEqual([]);
  });

  it("explains a label slot by slot", () => {
    const e = new EmotionEngine(model, "arkit");
    run(e, 0, 500, () => arkitFace(PROTOTYPES.sadness));
    const why = e.explain("sadness");
    expect(why.variant).toBe("grief brows");
    const core = why.slots.filter((s) => s.kind === "core");
    expect(core[0].best).toBe("AU1");
    expect(core[0].evidence).toBeGreaterThan(0.8);
  });
});
