import type { BaselineView } from "./baseline.ts";
import { clamp01, smoothstep } from "./filters.ts";
import type { CompiledChannel, CompiledExpression, CompiledModel, CompiledSlot, CompiledVariant } from "./model.ts";

export type Features = Record<string, number>;

/**
 * Intensity of one AU channel from raw measurements.
 *
 *   d_i = (x_i - baseline_i - sign(range_i) * deadzone_i) * gain_i - offset_i
 *   n_i = clamp(d_i / range_i * sensitivity, 0, 1)
 * where gain_i is the person's range gain for that signal and direction (1 unless range-calibrated).
 *   AU  = clamp(sum_i w_i * n_i, 0, 1)
 *
 * Missing measurements are dropped and the positive weights renormalised, so a
 * platform that lacks one input degrades gracefully instead of under-reporting.
 * Pose-gated measurements count with a weight that fades out as the head turns
 * away from its baseline pose (see poseGateWeight).
 */
export function channelValue(
  ch: CompiledChannel,
  measurements: Record<string, number>,
  baseline: BaselineView,
  sensitivity: number,
): number {
  let sum = 0;
  let availablePos = 0;
  for (const t of ch.terms) {
    const x = measurements[t.key];
    if (x === undefined || !Number.isFinite(x)) continue;
    const w = t.gate ? t.w * poseGateWeight(t.gate, measurements, baseline) : t.w;
    if (w === 0) continue;
    const dir = Math.sign(t.r);
    const d = (x - baseline.get(t.key) - dir * baseline.deadzone(t.key)) * baseline.gain(t.key, dir) - t.o;
    const n = clamp01((d / t.r) * sensitivity);
    sum += w * n;
    if (w > 0) availablePos += w;
  }
  if (availablePos <= 0) return 0;
  return clamp01(sum * (ch.posWeight / availablePos));
}

/** 1 while head pitch and yaw are within lo° of their baselines, fading linearly to 0 at hi°. */
export function poseGateWeight(gate: readonly [number, number], measurements: Record<string, number>, baseline: BaselineView): number {
  const pitch = measurements["pose.pitch"];
  const yaw = measurements["pose.yaw"];
  if (pitch === undefined || yaw === undefined) return 1;
  const dev = Math.max(Math.abs(pitch - baseline.get("pose.pitch")), Math.abs(yaw - baseline.get("pose.yaw")));
  return clamp01(1 - (dev - gate[0]) / (gate[1] - gate[0]));
}

/**
 * Computes every AU channel, then the derived bilateral features:
 *   AUn  = mean of both sides
 *   AUnU = one-sidedness |L - R| minus a noise floor, faded out as the head turns
 *          (profile views make the far side unreliable)
 *   AUnB = min(L, R), the part of the action present on both sides
 */
export function computeAUs(
  cm: CompiledModel,
  measurements: Record<string, number>,
  baseline: BaselineView,
  sensitivity: number,
): Features {
  const f: Features = {};
  for (const ch of cm.channels) f[ch.id] = channelValue(ch, measurements, baseline, sensitivity);
  addDerived(cm, f, measurements["pose.yaw"] ?? 0, baseline.get("pose.yaw"));
  return f;
}

/**
 * Adds camera-relative gaze ("gaze.yaw", "gaze.pitch", degrees): head pose
 * plus eye rotation from the eyeLook* blendshapes. FACS AU61–64 describe the
 * eyes relative to the head; averting gaze from a viewer (embarrassment,
 * shame, boredom) is about where the eyes point relative to the camera.
 * Positive yaw = towards the person's left, positive pitch = up.
 */
export function withGaze(cm: CompiledModel, m: Record<string, number>): Record<string, number> {
  const k = cm.params.gaze.eyeDegPerUnit;
  const g = (key: string) => m[key] ?? 0;
  if (m["pose.yaw"] === undefined || m["eyeLookOutLeft"] === undefined) return m;
  const eyeYaw = (k * ((g("eyeLookOutLeft") + g("eyeLookInRight")) - (g("eyeLookInLeft") + g("eyeLookOutRight")))) / 2;
  const eyePitch = (k * ((g("eyeLookUpLeft") + g("eyeLookUpRight")) - (g("eyeLookDownLeft") + g("eyeLookDownRight")))) / 2;
  return { ...m, "gaze.yaw": g("pose.yaw") + eyeYaw, "gaze.pitch": g("pose.pitch") + eyePitch };
}

export function addDerived(cm: CompiledModel, f: Features, yaw: number, yawBaseline: number): void {
  const { noise, yawFull, yawZero } = cm.params.asymmetry;
  const yawAbs = Math.abs(yaw - yawBaseline);
  const asymGain = clamp01(1 - (yawAbs - yawFull) / (yawZero - yawFull));
  for (const au of cm.bilateral) {
    const l = f[au + "L"];
    const r = f[au + "R"];
    if (l === undefined || r === undefined) continue;
    f[au] = (l + r) / 2;
    f[au + "U"] = clamp01((Math.abs(l - r) - noise) * asymGain / (1 - noise));
    f[au + "B"] = Math.min(l, r);
  }
}

export function slotValue(slot: CompiledSlot, f: Features): number {
  let x = 0;
  for (const name of slot.any) {
    const v = f[name];
    if (v !== undefined && v > x) x = v;
  }
  return x;
}

export function slotEvidence(slot: CompiledSlot, f: Features): number {
  return smoothstep(slot.lo, slot.hi, slotValue(slot, f));
}

/**
 * Score of one expression prototype in [0, 1].
 *
 * Core slots are combined with a soft AND — a blend of the weighted
 * arithmetic mean (tolerant: partial configurations still count) and the
 * weighted geometric mean (strict: a missing core action pulls the score
 * down hard). The blend is set per tier: compound emotions are defined by
 * the co-occurrence of both components' actions, so they are stricter. Supporting actions can raise the score by up to `supportGain`;
 * each inhibiting action multiplies it by (1 - w * evidence). An expression's
 * score is that of its best-matching variant.
 */
export function scoreExpression(cm: CompiledModel, e: CompiledExpression, f: Features): number {
  return scoreBestVariant(cm, e, f).score;
}

export function scoreBestVariant(cm: CompiledModel, e: CompiledExpression, f: Features): { score: number; variant: CompiledVariant } {
  let best = { score: -1, variant: e.variants[0] };
  for (const v of e.variants) {
    const s = scoreVariant(cm, v, f);
    if (s > best.score) best = { score: s, variant: v };
  }
  return best;
}

export function scoreVariant(cm: CompiledModel, v: CompiledVariant, f: Features): number {
  const { floor, supportGain } = cm.params;
  let arith = 0;
  let logSum = 0;
  for (const s of v.slots) {
    const ev = slotEvidence(s, f);
    arith += s.w * ev;
    logSum += s.w * Math.log(Math.max(ev, floor));
  }
  const core = (1 - v.strictness) * (arith / v.slotWeight) + v.strictness * Math.exp(logSum / v.slotWeight);

  let support = 0;
  if (v.supportWeight > 0) {
    for (const s of v.support) support += s.w * slotEvidence(s, f);
    support /= v.supportWeight;
  }

  let inhibit = 1;
  for (const s of v.inhibit) inhibit *= 1 - s.w * slotEvidence(s, f);

  return clamp01(core * (1 + supportGain * support) * inhibit);
}

export interface SlotExplanation {
  kind: "core" | "support" | "inhibit";
  features: string[];
  /** Which feature supplied the slot's value. */
  best: string;
  value: number;
  evidence: number;
  weight: number;
}

/** Per-slot breakdown of the best-matching variant, for "why this label" explanations. */
export function explainExpression(cm: CompiledModel, e: CompiledExpression, f: Features): { variant: string; slots: SlotExplanation[] } {
  const { variant } = scoreBestVariant(cm, e, f);
  const out: SlotExplanation[] = [];
  const add = (kind: SlotExplanation["kind"], slots: CompiledSlot[]) => {
    for (const s of slots) {
      let best = s.any[0];
      let value = -1;
      for (const name of s.any) {
        const v = f[name] ?? 0;
        if (v > value) { value = v; best = name; }
      }
      out.push({ kind, features: s.any, best, value, evidence: smoothstep(s.lo, s.hi, value), weight: s.w });
    }
  };
  add("core", variant.slots);
  add("support", variant.support);
  add("inhibit", variant.inhibit);
  return { variant: variant.name, slots: out };
}

/**
 * Prkachin & Solomon Pain Intensity on its native 0–16 scale:
 * AU4 + max(AU6, AU7) + max(AU9, AU10) (each 0–5) + AU43 (0/1).
 */
export function pspi(f: Features): number {
  const g = (k: string) => f[k] ?? 0;
  return (
    5 * g("AU4") +
    5 * Math.max(g("AU6"), g("AU7")) +
    5 * Math.max(g("AU9"), g("AU10")) +
    (g("AU43") >= 0.5 ? 1 : 0)
  );
}
