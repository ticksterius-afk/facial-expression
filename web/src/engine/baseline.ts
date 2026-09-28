import type { CompiledModel, CompiledMeasurement } from "./model.ts";

/**
 * Per-person neutral baseline for every measurement.
 *
 * Faces differ at rest (brow shape, eye aperture, a naturally down-turned
 * mouth...). An expression is a *change* from that person's neutral face, so
 * each measurement is compared against a baseline that is either
 *  - calibrated: the median over a few seconds of a deliberately neutral face, or
 *  - adaptive:  tracked continuously —
 *      "low"    for one-sided signals (blendshapes rest near their minimum):
 *               follows dips quickly and rises slowly (a lower envelope);
 *      "median" for two-sided signals (geometry, head pose): a slow
 *               sign-step tracker that converges to the running median.
 * Drift is bounded around the anchor (default rest, or calibrated value) so a
 * long-held expression cannot be absorbed into the baseline.
 *
 * Until the baseline is known, deviations inside a dead-zone are ignored. The
 * dead-zone is a fraction of each signal's between-person neutral spread
 * (measured on real faces): wide on first sight of a new face, narrowing as
 * the adaptive baseline learns the person, and small once calibrated.
 */
export interface BaselineView {
  get(key: string): number;
  deadzone(key: string): number;
}

export class BaselineTracker implements BaselineView {
  private readonly values = new Map<string, number>();
  private readonly anchors = new Map<string, number>();
  private readonly specs: Map<string, CompiledMeasurement>;
  private calibratedFlag = false;
  private faceTime = 0;
  private calib: { start: number; duration: number; samples: Map<string, number[]>; frames: number; faceFrames: number } | null = null;

  private readonly cm: CompiledModel;

  constructor(cm: CompiledModel) {
    this.cm = cm;
    this.specs = new Map(cm.measurements.map((m) => [m.key, m]));
    this.reset();
  }

  get calibrated(): boolean {
    return this.calibratedFlag;
  }

  /** Restore defaults (forgets calibration). */
  reset(): void {
    this.values.clear();
    this.anchors.clear();
    for (const m of this.cm.measurements) {
      this.values.set(m.key, m.rest);
      this.anchors.set(m.key, m.rest);
    }
    this.calibratedFlag = false;
    this.faceTime = 0;
  }

  get(key: string): number {
    return this.values.get(key) ?? this.specs.get(key)?.rest ?? 0;
  }

  /** Current dead-zone multiplier applied to each signal's neutral spread. */
  get deadzoneFactor(): number {
    const a = this.cm.params.adapt;
    if (this.calibratedFlag) return a.deadzoneCalibrated;
    const learned = Math.min(1, this.faceTime / a.deadzoneLearnSec);
    return a.deadzoneInitial + (a.deadzoneLearned - a.deadzoneInitial) * learned;
  }

  deadzone(key: string): number {
    return (this.specs.get(key)?.spread ?? 0) * this.deadzoneFactor;
  }

  /** Adapt towards the current measurements. dt in seconds. */
  update(measurements: Record<string, number>, dt: number): void {
    if (!(dt > 0)) return;
    if (dt < 1) this.faceTime += dt;
    const a = this.cm.params.adapt;
    const drift = this.calibratedFlag ? a.maxDriftCalibrated : a.maxDriftUncalibrated;
    const tauUp = this.calibratedFlag ? a.lowTauUp : a.lowTauUp / 3;
    for (const m of this.cm.measurements) {
      const x = measurements[m.key];
      if (x === undefined || !Number.isFinite(x)) continue;
      let b = this.values.get(m.key)!;
      if (m.mode === "low") {
        const tau = x < b ? a.lowTauDown : tauUp;
        b += (x - b) * (1 - Math.exp(-dt / tau));
      } else {
        const step = (m.scale * dt) / a.medianTau;
        const d = x - b;
        b += Math.abs(d) < step ? d : Math.sign(d) * step;
      }
      const anchor = this.anchors.get(m.key)!;
      const lim = drift * m.scale;
      b = Math.min(anchor + lim, Math.max(anchor - lim, b));
      this.values.set(m.key, b);
    }
  }

  /** Begin collecting a neutral-face calibration. t in seconds. */
  startCalibration(t: number, duration = 3): void {
    this.calib = { start: t, duration, samples: new Map(), frames: 0, faceFrames: 0 };
  }

  cancelCalibration(): void {
    this.calib = null;
  }

  /**
   * Feed a frame to an active calibration. Returns progress in [0,1], "done",
   * "failed" (too few frames with a face), or null if no calibration is active.
   */
  calibrationStep(t: number, measurements: Record<string, number> | null): number | "done" | "failed" | null {
    const c = this.calib;
    if (!c) return null;
    c.frames++;
    if (measurements) {
      c.faceFrames++;
      for (const m of this.cm.measurements) {
        const x = measurements[m.key];
        if (x === undefined || !Number.isFinite(x)) continue;
        let arr = c.samples.get(m.key);
        if (!arr) c.samples.set(m.key, (arr = []));
        arr.push(x);
      }
    }
    const progress = (t - c.start) / c.duration;
    if (progress < 1) return Math.max(0, progress);
    this.calib = null;
    if (c.faceFrames < Math.max(5, 0.6 * c.frames)) return "failed";
    const next: Record<string, number> = {};
    for (const [k, arr] of c.samples) next[k] = median(arr);
    this.setCalibration(next);
    return "done";
  }

  get calibrating(): boolean {
    return this.calib !== null;
  }

  /** Apply calibrated neutral values (e.g. restored from storage). */
  setCalibration(values: Record<string, number>): void {
    for (const [k, v] of Object.entries(values)) {
      if (!this.specs.has(k) || !Number.isFinite(v)) continue;
      this.values.set(k, v);
      this.anchors.set(k, v);
    }
    this.calibratedFlag = true;
  }

  /** Snapshot of the calibrated anchors, for persistence. */
  getCalibration(): Record<string, number> | null {
    if (!this.calibratedFlag) return null;
    return Object.fromEntries(this.anchors);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.values);
  }
}

/** Stateless baseline at the model's default rest values (for single images and tests). */
export class DefaultBaseline implements BaselineView {
  private readonly rest: Map<string, number>;
  private readonly spread: Map<string, number>;
  private readonly factor: number;

  constructor(cm: CompiledModel, deadzoneFactor = cm.params.adapt.deadzoneInitial, overrides?: Record<string, number>) {
    this.rest = new Map(cm.measurements.map((m) => [m.key, overrides?.[m.key] ?? m.rest]));
    this.spread = new Map(cm.measurements.map((m) => [m.key, m.spread]));
    this.factor = deadzoneFactor;
  }

  get(key: string): number {
    return this.rest.get(key) ?? 0;
  }

  deadzone(key: string): number {
    return (this.spread.get(key) ?? 0) * this.factor;
  }
}

export function median(a: number[]): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
