import { emaAlpha, smoothstep } from "./filters.ts";
import type { ModelParams } from "./model.ts";

export type EngineEvent =
  | { type: "blink"; t: number; durationMs: number }
  | { type: "yawn"; t: number; durationMs: number }
  | { type: "micro"; t: number; id: string; peak: number; durationMs: number };

/**
 * Behaviour that only exists over time: blinks, PERCLOS (share of time with
 * eyes >= 80% closed, the standard drowsiness index), yawns, head stillness.
 * Inputs are raw (unsmoothed) per-frame values; times are in seconds.
 */
export class TemporalFeatures {
  private eyeClosedSince: number | null = null;
  private blinkTimes: number[] = [];
  private perclosBuf: { t: number; dt: number; closed: boolean }[] = [];
  private perclosClosed = 0;
  private perclosTotal = 0;
  private yawnOpenSince: number | null = null;
  private yawnPeak = 0;
  private yawnClosedAt = -Infinity;
  private lastPose: [number, number, number] | null = null;
  private speed = 0;

  perclos = 0;
  yawn = 0;
  still = 1;

  private readonly p: ModelParams;

  constructor(p: ModelParams) {
    this.p = p;
  }

  reset(): void {
    this.eyeClosedSince = null;
    this.yawnOpenSince = null;
    this.lastPose = null;
  }

  /**
   * Returns events that completed on this frame.
   * @param eyesClosed AU43 intensity
   * @param squeeze max(AU6, AU4): eyes squeezed shut (laughing, crying) rather than relaxed
   * @param mouthStretch AU27 intensity
   */
  update(t: number, dt: number, eyesClosed: number, squeeze: number, mouthStretch: number, pose: [number, number, number]): EngineEvent[] {
    const events: EngineEvent[] = [];
    const { blink, perclos, yawn, stillness } = this.p;

    // Blinks: a closure that opens again within [minMs, maxMs].
    if (this.eyeClosedSince === null) {
      if (eyesClosed >= blink.on) this.eyeClosedSince = t;
    } else if (eyesClosed <= blink.off) {
      const ms = (t - this.eyeClosedSince) * 1000;
      if (ms >= blink.minMs && ms <= blink.maxMs) {
        events.push({ type: "blink", t: t * 1000, durationMs: ms });
        this.blinkTimes.push(t);
      }
      this.eyeClosedSince = null;
    }
    while (this.blinkTimes.length && t - this.blinkTimes[0] > 60) this.blinkTimes.shift();

    // PERCLOS over a sliding window; conservative until 20 s of data exist.
    // Only relaxed closure counts: lids squeezed shut by laughing or crying are
    // not the slow, drooping closures PERCLOS was validated on.
    if (dt > 0 && dt < 1) {
      const closed = eyesClosed >= perclos.closed && squeeze < perclos.maxSqueeze;
      this.perclosBuf.push({ t, dt, closed });
      this.perclosTotal += dt;
      if (closed) this.perclosClosed += dt;
      while (this.perclosBuf.length && t - this.perclosBuf[0].t > perclos.windowSec) {
        const old = this.perclosBuf.shift()!;
        this.perclosTotal -= old.dt;
        if (old.closed) this.perclosClosed -= old.dt;
      }
      this.perclos = this.perclosClosed / Math.max(this.perclosTotal, 20);
    }

    // Yawns: mouth stretched wide open for over a second.
    if (mouthStretch >= yawn.open) {
      if (this.yawnOpenSince === null) this.yawnOpenSince = t;
      const d = t - this.yawnOpenSince;
      this.yawn = smoothstep(yawn.startSec, yawn.fullSec, d);
      this.yawnPeak = Math.max(this.yawnPeak, this.yawn);
    } else {
      if (this.yawnOpenSince !== null) {
        const d = t - this.yawnOpenSince;
        if (d >= yawn.startSec + 0.2) events.push({ type: "yawn", t: t * 1000, durationMs: d * 1000 });
        this.yawnOpenSince = null;
        this.yawnClosedAt = t;
      }
      const fade = Math.max(0, 1 - (t - this.yawnClosedAt) / yawn.holdSec);
      this.yawn = this.yawnPeak * fade;
      if (fade === 0) this.yawnPeak = 0;
    }

    // Head stillness from angular speed.
    if (this.lastPose && dt > 0 && dt < 1) {
      const [a, b, c] = this.lastPose;
      const v = Math.hypot(pose[0] - a, pose[1] - b, pose[2] - c) / dt;
      this.speed += (v - this.speed) * emaAlpha(dt, stillness.tau);
      this.still = Math.exp(-this.speed / stillness.degPerSec);
    }
    this.lastPose = pose;
    return events;
  }

  get blinkRate(): number {
    return this.blinkTimes.length;
  }

  get blinking(): boolean {
    return this.eyeClosedSince !== null;
  }
}

/**
 * Brief expressions: an expression that flashes on and off within half a
 * second, preceded by a quiet period. Ekman describes micro-expressions as
 * 1/25–1/5 s; Yan et al. (2013) put the upper bound near 500 ms. At 30 fps and
 * with a tracker in the loop the shortest flashes are not observable, so we
 * report "brief expressions" in the 40–500 ms range.
 */
export class MicroExpressionDetector {
  private state = new Map<string, { quietStart: number; quietEnd: number | null; activeStart: number | null; peak: number; blinked: boolean }>();

  private readonly p: ModelParams["micro"];

  constructor(p: ModelParams["micro"]) {
    this.p = p;
  }

  reset(): void {
    this.state.clear();
  }

  update(t: number, scores: Record<string, number>, blinking: boolean): EngineEvent[] {
    const events: EngineEvent[] = [];
    const { on, off, minPeak, minMs, maxMs, quietMs } = this.p;
    for (const [id, s] of Object.entries(scores)) {
      let st = this.state.get(id);
      if (!st) this.state.set(id, (st = { quietStart: t, quietEnd: null, activeStart: null, peak: 0, blinked: false }));
      if (st.activeStart === null) {
        if (s < off) {
          if (st.quietEnd !== null) { st.quietStart = t; st.quietEnd = null; }
        } else {
          if (st.quietEnd === null) st.quietEnd = t;
          const quiet = (st.quietEnd - st.quietStart) * 1000;
          const rise = (t - st.quietEnd) * 1000;
          if (s >= on && quiet >= quietMs && rise <= 150) {
            st.activeStart = st.quietEnd;
            st.peak = s;
            st.blinked = blinking;
          }
        }
      } else {
        st.peak = Math.max(st.peak, s);
        st.blinked ||= blinking;
        if (s < off) {
          const ms = (t - st.activeStart) * 1000;
          if (ms >= minMs && ms <= maxMs && st.peak >= minPeak && !st.blinked) {
            events.push({ type: "micro", t: t * 1000, id, peak: st.peak, durationMs: ms });
          }
          st.activeStart = null;
          st.quietStart = t;
          st.quietEnd = null;
        }
      }
    }
    return events;
  }
}
