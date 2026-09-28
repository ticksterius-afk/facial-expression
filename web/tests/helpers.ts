import modelJson from "../../model/emotion-model.json" with { type: "json" };
import { compileModel, type EmotionModel, type Platform } from "../src/engine/index.ts";

export const model = modelJson as unknown as EmotionModel;

/** A resting face: every measurement at the model's default rest value. */
export function restFace(platform: Platform): Record<string, number> {
  const cm = compileModel(model, platform);
  return Object.fromEntries(cm.measurements.map((m) => [m.key, m.rest]));
}

/** Resting ARKit face with some blendshapes set; "{S}" keys set both sides. */
export function arkitFace(set: Record<string, number>): Record<string, number> {
  const m = restFace("arkit");
  for (const [k, v] of Object.entries(set)) {
    if (k.includes("{S}")) {
      m[k.replace("{S}", "Left")] = v;
      m[k.replace("{S}", "Right")] = v;
    } else m[k] = v;
  }
  return m;
}

/** Prototypical ARKit blendshape settings for each primary expression. */
export const PROTOTYPES: Record<string, Record<string, number>> = {
  happiness: { "mouthSmile{S}": 0.8, "cheekSquint{S}": 0.5, jawOpen: 0.1 },
  sadness: { browInnerUp: 0.7, "browDown{S}": 0.35, "mouthFrown{S}": 0.55, mouthShrugLower: 0.3 },
  surprise: { browInnerUp: 0.7, "browOuterUp{S}": 0.7, "eyeWide{S}": 0.6, jawOpen: 0.45 },
  fear: { browInnerUp: 0.75, "browOuterUp{S}": 0.4, "browDown{S}": 0.5, "eyeWide{S}": 0.7, "mouthStretch{S}": 0.6, jawOpen: 0.2 },
  anger: { "browDown{S}": 0.8, "eyeSquint{S}": 0.55, "eyeWide{S}": 0.25, "mouthPress{S}": 0.6, mouthShrugLower: 0.3 },
  disgust: { "noseSneer{S}": 0.7, "mouthUpperUp{S}": 0.55, "browDown{S}": 0.35, mouthShrugLower: 0.25 },
  contempt: { mouthDimpleLeft: 0.55, mouthSmileLeft: 0.3 },
};

/** Deterministic PRNG (mulberry32) for reproducible noise. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
