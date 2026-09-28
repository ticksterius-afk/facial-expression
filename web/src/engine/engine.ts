import { BaselineTracker, type BaselineView } from "./baseline.ts";
import { OneEuroFilter, emaAlpha, smoothstep } from "./filters.ts";
import { compileModel, type CompiledModel, type EmotionModel, type Platform } from "./model.ts";
import { addDerived, channelValue, computeAUs, explainExpression, pspi, scoreExpression, withGaze, type Features, type SlotExplanation } from "./scoring.ts";
import { MicroExpressionDetector, TemporalFeatures, type EngineEvent } from "./temporal.ts";

export interface Ranked {
  id: string;
  score: number;
}

export interface FrameResult {
  /** Timestamp in ms, as passed in. */
  t: number;
  face: boolean;
  /** Smoothed AU intensities and derived features (AUnL/R/U/B, PERCLOS, YAWN, STILL). */
  aus: Features;
  /** Smoothed expression scores by id. */
  scores: Record<string, number>;
  /** Stabilised primary label ("neutral" when nothing clears the threshold). */
  primary: Ranked;
  /** 1 - strongest primary expression. */
  neutral: number;
  /** Best non-primary expressions above threshold, strongest first. */
  complex: Ranked[];
  /** Strongest AU per facial region, for the heat-map overlay. */
  regions: Record<string, number>;
  /** Prkachin–Solomon pain intensity, 0–16. */
  pspi: number;
  /** Head pose relative to the person's neutral, degrees. */
  pose: { pitch: number; yaw: number; roll: number };
  blinkRate: number;
  perclos: number;
  events: EngineEvent[];
  calibrated: boolean;
  calibration: { active: boolean; progress: number; result?: "done" | "failed" };
  /** Active personal-range step, if any. */
  range: { step: string | null; progress: number; result?: "done" | "failed"; updated?: string[]; weak?: string[] };
}

export interface EngineOptions {
  /** Multiplies every normalised signal (1 = default). */
  sensitivity?: number;
  /** Score the "extended" tier of the catalogue as well. */
  extended?: boolean;
}

const NEUTRAL = "neutral";
const EXPRESSIVE_REGIONS_EXCLUDE = new Set(["head", "gaze"]);

/**
 * Real-time facial expression engine. Feed it one frame of measurements at a
 * time (blendshapes + geometry + head pose, keyed as in the model); it keeps
 * per-person baselines, filters, temporal state and label hysteresis.
 */
export class EmotionEngine {
  readonly cm: CompiledModel;
  readonly baseline: BaselineTracker;
  sensitivity: number;
  /** Whether the extended catalogue (tier "extended") is scored and listed. */
  extended: boolean;

  private readonly filters = new Map<string, OneEuroFilter>();
  private readonly temporal: TemporalFeatures;
  private readonly micro: MicroExpressionDetector;
  private readonly primaryIds: string[];
  private scores: Record<string, number> = {};
  private lastT: number | null = null;
  private current: Ranked = { id: NEUTRAL, score: 1 };
  private candidate: { id: string; since: number } | null = null;
  private lastFeatures: Features = {};

  constructor(model: EmotionModel, platform: Platform, options: EngineOptions = {}) {
    this.cm = compileModel(model, platform);
    this.baseline = new BaselineTracker(this.cm);
    this.sensitivity = options.sensitivity ?? 1;
    this.extended = options.extended ?? false;
    const f = this.cm.params.filter;
    for (const ch of this.cm.channels) this.filters.set(ch.id, new OneEuroFilter(f.minCutoff, f.beta, f.dCutoff));
    this.temporal = new TemporalFeatures(this.cm.params);
    this.micro = new MicroExpressionDetector(this.cm.params.micro);
    this.primaryIds = this.cm.expressions.filter((e) => e.tier === "primary").map((e) => e.id);
    for (const e of this.cm.expressions) this.scores[e.id] = 0;
  }

  startCalibration(tMs: number, durationSec = 3): void {
    this.baseline.startCalibration(tMs / 1000, durationSec);
  }

  /** Begin one guided maximal-expression step of the personal range calibration. */
  startRangeStep(tMs: number, stepId: string): void {
    this.baseline.startRangeStep(tMs / 1000, stepId);
  }

  /**
   * Process one frame.
   * @param tMs monotonically increasing timestamp in milliseconds
   * @param measurements raw measurements, or null when no face is visible
   */
  process(tMs: number, input: Record<string, number> | null): FrameResult {
    const t = tMs / 1000;
    const measurements = input ? withGaze(this.cm, input) : null;
    const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;
    const p = this.cm.params;

    const cal = this.baseline.calibrationStep(t, measurements);
    const calibration = {
      active: this.baseline.calibrating,
      progress: typeof cal === "number" ? cal : cal === null ? 0 : 1,
      result: cal === "done" || cal === "failed" ? cal : undefined,
    };
    const stepId = this.baseline.rangeStepId;
    const rs = this.baseline.rangeStep(t, measurements);
    const range: FrameResult["range"] = !rs
      ? { step: null, progress: 0 }
      : "progress" in rs
        ? { step: stepId, progress: rs.progress }
        : rs.result === "done"
          ? { step: stepId, progress: 1, result: "done", updated: rs.updated, weak: rs.weak }
          : { step: stepId, progress: 1, result: "failed" };

    if (!measurements) {
      for (const flt of this.filters.values()) flt.reset();
      this.temporal.reset();
      const a = emaAlpha(dt, p.scoreTau * 3);
      for (const id of Object.keys(this.scores)) this.scores[id] -= this.scores[id] * a;
      this.current = { id: NEUTRAL, score: 1 };
      this.candidate = null;
      return this.result(tMs, false, this.lastFeatures, [], calibration, range, { pitch: 0, yaw: 0, roll: 0 });
    }

    if (!this.baseline.busy) this.baseline.update(measurements, dt);
    const base = (k: string) => this.baseline.get(k);

    // 1. Raw AU channels -> smoothed channels.
    const raw = computeAUs(this.cm, measurements, this.baseline, this.sensitivity);
    const smooth: Features = {};
    for (const ch of this.cm.channels) smooth[ch.id] = this.filters.get(ch.id)!.filter(raw[ch.id], t);
    addDerived(this.cm, smooth, measurements["pose.yaw"] ?? 0, base("pose.yaw"));

    // 2. Temporal behaviour from raw signals.
    const pose = {
      pitch: (measurements["pose.pitch"] ?? 0) - base("pose.pitch"),
      yaw: (measurements["pose.yaw"] ?? 0) - base("pose.yaw"),
      roll: (measurements["pose.roll"] ?? 0) - base("pose.roll"),
    };
    const squeeze = Math.max(raw["AU6"] ?? 0, raw["AU4"] ?? 0);
    const events = this.temporal.update(t, dt, raw["AU43"] ?? 0, squeeze, raw["AU27"] ?? 0, [
      measurements["pose.pitch"] ?? 0, measurements["pose.yaw"] ?? 0, measurements["pose.roll"] ?? 0,
    ]);
    const blinks = smoothstep(p.blinkRate.lo, p.blinkRate.hi, this.temporal.blinkRate);
    for (const f of [raw, smooth]) {
      f.PERCLOS = this.temporal.perclos;
      f.YAWN = this.temporal.yawn;
      f.STILL = this.temporal.still;
      f.BLINKS = blinks;
    }

    // 3. Expression scores (smoothed for display, raw for brief expressions).
    const a = dt > 0 ? emaAlpha(dt, p.scoreTau) : 1;
    const rawPrimary: Record<string, number> = {};
    for (const e of this.cm.expressions) {
      if (e.tier === "extended" && !this.extended) {
        this.scores[e.id] = 0;
        continue;
      }
      const s = scoreExpression(this.cm, e, smooth);
      this.scores[e.id] += (s - this.scores[e.id]) * a;
      if (e.tier === "primary" && !p.micro.exclude.includes(e.id)) rawPrimary[e.id] = scoreExpression(this.cm, e, raw);
    }
    events.push(...this.micro.update(t, rawPrimary, this.temporal.blinking));

    this.lastFeatures = smooth;
    return this.result(tMs, true, smooth, events, calibration, range, pose);
  }

  private result(
    tMs: number,
    face: boolean,
    f: Features,
    events: EngineEvent[],
    calibration: FrameResult["calibration"],
    range: FrameResult["range"],
    pose: FrameResult["pose"],
  ): FrameResult {
    const d = this.cm.params.display;
    let best: Ranked = { id: NEUTRAL, score: d.primaryMin };
    let maxPrimary = 0;
    for (const id of this.primaryIds) {
      const s = this.scores[id];
      maxPrimary = Math.max(maxPrimary, s);
      if (s > best.score) best = { id, score: s };
    }
    if (face) this.stabilise(best, tMs, d);

    const taken = new Set<number>();
    const complex = this.cm.expressions
      .filter((e) => e.tier !== "primary" && this.scores[e.id] >= d.complexMin)
      .map((e) => ({ id: e.id, score: this.scores[e.id] }))
      .sort((x, y) => y.score - x.score)
      .filter((c) => {
        const g = d.exclusive.findIndex((group) => group.includes(c.id));
        if (g < 0) return true;
        if (taken.has(g)) return false;
        taken.add(g);
        return true;
      })
      .slice(0, d.complexMax);

    const regions: Record<string, number> = {};
    for (const r of Object.keys(this.cm.model.regions)) regions[r] = 0;
    for (const au of this.cm.auIds) {
      const region = this.cm.model.aus[au].region;
      const v = f[au];
      if (v !== undefined && v > regions[region]) regions[region] = v;
    }
    for (const r of EXPRESSIVE_REGIONS_EXCLUDE) if (!face) regions[r] = 0;

    const primaryScore = this.current.id === NEUTRAL ? 1 - maxPrimary : this.scores[this.current.id];
    return {
      t: tMs,
      face,
      aus: f,
      scores: { ...this.scores },
      primary: { id: this.current.id, score: primaryScore },
      neutral: 1 - maxPrimary,
      complex: face ? complex : [],
      regions,
      pspi: face ? pspi(f) : 0,
      pose,
      blinkRate: this.temporal.blinkRate,
      perclos: this.temporal.perclos,
      events,
      calibrated: this.baseline.calibrated,
      calibration,
      range,
    };
  }

  /** Hysteresis: a new label must lead by a margin for a hold time before it replaces the current one. */
  private stabilise(best: Ranked, tMs: number, d: EmotionModel["params"]["display"]): void {
    const curScore = this.current.id === NEUTRAL ? d.primaryMin : this.scores[this.current.id];
    if (best.id === this.current.id || best.score <= curScore + d.switchMargin) {
      this.candidate = null;
      return;
    }
    if (!this.candidate || this.candidate.id !== best.id) {
      this.candidate = { id: best.id, since: tMs };
    } else if (tMs - this.candidate.since >= d.switchHoldMs) {
      this.current = { id: best.id, score: best.score };
      this.candidate = null;
    }
  }

  /** Slot-by-slot reasons behind an expression's current score. */
  explain(id: string, features: Features = this.lastFeatures): { variant: string; slots: SlotExplanation[] } {
    const e = this.cm.byId.get(id);
    return e ? explainExpression(this.cm, e, features) : { variant: "", slots: [] };
  }

  /** Instantaneous (unsmoothed, stateless) evaluation, for tests and offline analysis. */
  static evaluate(cm: CompiledModel, measurements: Record<string, number>, baseline: BaselineView, sensitivity = 1): { aus: Features; scores: Record<string, number> } {
    const aus = computeAUs(cm, withGaze(cm, measurements), baseline, sensitivity);
    aus.PERCLOS = 0;
    aus.YAWN = 0;
    aus.STILL = 1;
    aus.BLINKS = 0;
    const scores: Record<string, number> = {};
    for (const e of cm.expressions) scores[e.id] = scoreExpression(cm, e, aus);
    return { aus, scores };
  }
}

export { channelValue };
