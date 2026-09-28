/**
 * Types for model/emotion-model.json and a compiler that expands side
 * templates ("{S}" -> Left/Right) and validates every cross-reference.
 */

export type Platform = "mediapipe" | "arkit";
export type BaselineMode = "low" | "median";
export type Tier = "primary" | "compound" | "social" | "cognitive" | "physical";

export interface ModelTerm {
  /** Measurement key; may contain "{S}" for bilateral AUs. */
  m: string;
  /** Signed range: the change from baseline that maps to full intensity. */
  r: number;
  /** Weight (negative weights subtract evidence). */
  w: number;
  /** Offset from baseline before the ramp starts (same sign as r). */
  o?: number;
}

export interface ModelMeasurement {
  /** Typical neutral value (population median). */
  rest: number;
  /** Typical size of a strong deviation; bounds baseline drift. */
  scale: number;
  /** Between-person spread of the neutral value; sets the dead-zone. */
  spread: number;
  mode: BaselineMode;
}

export interface ModelSlot {
  any: string[];
  w: number;
  /** Evidence ramp [lo, hi] override. */
  t?: [number, number];
}

export interface ModelVariant {
  /** Short description of this configuration, e.g. "crying face". */
  name: string;
  slots: ModelSlot[];
  support: ModelSlot[];
  inhibit: ModelSlot[];
}

/**
 * An expression prototype. Like EMFACS, an emotion may have several variant
 * configurations; its score is that of the best-matching variant. Single-variant
 * expressions put slots/support/inhibit at the top level.
 */
export interface ModelExpression {
  id: string;
  tier: Tier;
  name: string;
  emoji: string;
  gloss: string;
  cues: string;
  slots?: ModelSlot[];
  support?: ModelSlot[];
  inhibit?: ModelSlot[];
  variants?: ModelVariant[];
  refs: string[];
}

export interface ModelAU {
  name: string;
  muscles: string;
  region: string;
  bilateral: boolean;
  look: string;
}

export interface ModelParams {
  evidence: [number, number];
  floor: number;
  supportGain: number;
  adapt: {
    lowTauDown: number;
    lowTauUp: number;
    medianTau: number;
    maxDriftUncalibrated: number;
    maxDriftCalibrated: number;
    deadzoneInitial: number;
    deadzoneLearned: number;
    deadzoneLearnSec: number;
    deadzoneCalibrated: number;
  };
  gaze: { eyeDegPerUnit: number };
  asymmetry: { noise: number; yawFull: number; yawZero: number };
  filter: { minCutoff: number; beta: number; dCutoff: number };
  scoreTau: number;
  display: {
    primaryMin: number;
    complexMin: number;
    complexMax: number;
    switchMargin: number;
    switchHoldMs: number;
    /** Groups of alternative readings; only the strongest of each group is listed. */
    exclusive: string[][];
  };
  micro: { on: number; off: number; minPeak: number; minMs: number; maxMs: number; quietMs: number; exclude: string[] };
  blink: { on: number; off: number; minMs: number; maxMs: number };
  perclos: { windowSec: number; closed: number; maxSqueeze: number };
  yawn: { open: number; startSec: number; fullSec: number; holdSec: number };
  stillness: { tau: number; degPerSec: number };
}

export interface EmotionModel {
  version: string;
  about: string;
  params: ModelParams;
  regions: Record<string, string>;
  aus: Record<string, ModelAU>;
  temporal: Record<string, { name: string; look: string }>;
  platforms: Record<Platform, {
    about: string;
    measurements: Record<string, ModelMeasurement>;
    recipes: Record<string, ModelTerm[]>;
  }>;
  tiers: Record<Tier, string>;
  expressions: ModelExpression[];
  references: Record<string, string>;
}

export const SIDES = ["Left", "Right"] as const;
export type SideName = (typeof SIDES)[number];

export interface CompiledTerm {
  key: string;
  r: number;
  w: number;
  o: number;
}

/** One AU output channel, e.g. "AU12L", "AU12R" or "AU17". */
export interface CompiledChannel {
  id: string;
  au: string;
  side: "" | "L" | "R";
  terms: CompiledTerm[];
  /** Sum of positive weights, used to renormalise when a measurement is missing. */
  posWeight: number;
}

export interface CompiledMeasurement extends ModelMeasurement {
  key: string;
}

export interface CompiledSlot {
  any: string[];
  w: number;
  lo: number;
  hi: number;
}

export interface CompiledVariant {
  name: string;
  slots: CompiledSlot[];
  support: CompiledSlot[];
  inhibit: CompiledSlot[];
  slotWeight: number;
  supportWeight: number;
}

export interface CompiledExpression extends Omit<ModelExpression, "slots" | "support" | "inhibit" | "variants"> {
  variants: CompiledVariant[];
}

export interface CompiledModel {
  model: EmotionModel;
  platform: Platform;
  params: ModelParams;
  measurements: CompiledMeasurement[];
  channels: CompiledChannel[];
  /** AU ids in catalogue order. */
  auIds: string[];
  bilateral: Set<string>;
  expressions: CompiledExpression[];
  byId: Map<string, CompiledExpression>;
  /** Every feature name an expression may reference. */
  featureNames: Set<string>;
}

export const TEMPORAL_FEATURES = ["PERCLOS", "YAWN", "STILL"] as const;

const expandSide = (s: string, side: SideName) => s.split("{S}").join(side);

export function compileModel(model: EmotionModel, platform: Platform): CompiledModel {
  const p = model.platforms[platform];
  if (!p) throw new Error(`Model has no platform "${platform}"`);
  const errors: string[] = [];

  const measurements: CompiledMeasurement[] = [];
  for (const [key, m] of Object.entries(p.measurements)) {
    if (!(m.scale > 0) || !(m.spread >= 0)) errors.push(`${platform}: measurement ${key} needs scale > 0 and spread >= 0`);
    const keys = key.includes("{S}") ? SIDES.map((s) => expandSide(key, s)) : [key];
    for (const k of keys) measurements.push({ key: k, ...m });
  }
  const measurementKeys = new Set(measurements.map((m) => m.key));

  const auIds = Object.keys(model.aus);
  const bilateral = new Set(auIds.filter((a) => model.aus[a].bilateral));
  const channels: CompiledChannel[] = [];
  for (const [au, terms] of Object.entries(p.recipes)) {
    if (!model.aus[au]) errors.push(`${platform}: recipe for unknown AU ${au}`);
    const sides: ["" | "L" | "R", SideName | null][] = bilateral.has(au)
      ? [["L", "Left"], ["R", "Right"]]
      : [["", null]];
    for (const [side, sideName] of sides) {
      const ct: CompiledTerm[] = terms.map((t) => {
        if (!sideName && t.m.includes("{S}")) errors.push(`${platform}: ${au} is not bilateral but uses {S}`);
        const key = sideName ? expandSide(t.m, sideName) : t.m;
        if (!measurementKeys.has(key)) errors.push(`${platform}: ${au} references unknown measurement ${key}`);
        if (t.r === 0) errors.push(`${platform}: ${au} term ${t.m} has zero range`);
        return { key, r: t.r, w: t.w, o: t.o ?? 0 };
      });
      channels.push({
        id: au + side,
        au,
        side,
        terms: ct,
        posWeight: ct.reduce((s, t) => s + Math.max(0, t.w), 0),
      });
    }
  }

  // Feature names that expressions may reference.
  const featureNames = new Set<string>(TEMPORAL_FEATURES);
  for (const au of auIds) {
    featureNames.add(au);
    if (bilateral.has(au)) for (const suffix of ["L", "R", "U", "B"]) featureNames.add(au + suffix);
  }

  const [elo, ehi] = model.params.evidence;
  const compileSlots = (exp: string, slots: ModelSlot[]): CompiledSlot[] =>
    slots.map((s) => {
      for (const f of s.any) if (!featureNames.has(f)) errors.push(`${exp}: unknown feature ${f}`);
      if (!(s.w > 0)) errors.push(`${exp}: slot weight must be > 0`);
      const [lo, hi] = s.t ?? [elo, ehi];
      if (!(hi > lo)) errors.push(`${exp}: evidence range must increase`);
      return { any: s.any, w: s.w, lo, hi };
    });

  const expressions: CompiledExpression[] = [];
  const ids = new Set<string>();
  for (const e of model.expressions) {
    if (ids.has(e.id)) errors.push(`duplicate expression id ${e.id}`);
    ids.add(e.id);
    if (!model.tiers[e.tier]) errors.push(`${e.id}: unknown tier ${e.tier}`);
    for (const r of e.refs) if (!model.references[r]) errors.push(`${e.id}: unknown reference ${r}`);
    if (e.variants && e.slots) errors.push(`${e.id}: use either variants or top-level slots`);
    const variants: ModelVariant[] = e.variants ?? [{ name: "", slots: e.slots ?? [], support: e.support ?? [], inhibit: e.inhibit ?? [] }];
    const compiled = variants.map((v) => {
      if (v.slots.length === 0) errors.push(`${e.id}: every variant needs at least one slot`);
      const slots = compileSlots(e.id, v.slots);
      const support = compileSlots(e.id, v.support);
      const inhibit = compileSlots(e.id, v.inhibit);
      for (const s of inhibit) if (s.w > 1) errors.push(`${e.id}: inhibit weight must be <= 1`);
      return {
        name: v.name,
        slots,
        support,
        inhibit,
        slotWeight: slots.reduce((a, s) => a + s.w, 0),
        supportWeight: support.reduce((a, s) => a + s.w, 0),
      };
    });
    const { slots: _s, support: _su, inhibit: _i, variants: _v, ...meta } = e;
    expressions.push({ ...meta, variants: compiled });
  }
  for (const au of auIds) {
    if (!model.regions[model.aus[au].region]) errors.push(`${au}: unknown region ${model.aus[au].region}`);
  }

  if (errors.length) throw new Error(`Invalid emotion model:\n  ${errors.join("\n  ")}`);
  return {
    model,
    platform,
    params: model.params,
    measurements,
    channels,
    auIds,
    bilateral,
    expressions,
    byId: new Map(expressions.map((e) => [e.id, e])),
    featureNames,
  };
}
