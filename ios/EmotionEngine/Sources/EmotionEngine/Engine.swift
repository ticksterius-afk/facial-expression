import Foundation

/// Head pose relative to the person's neutral, degrees.
public typealias Pose = (pitch: Double, yaw: Double, roll: Double)

public struct Ranked: Equatable, Sendable {
    public let id: String
    public let score: Double

    public init(id: String, score: Double) {
        self.id = id
        self.score = score
    }
}

public struct FrameResult: Sendable {
    public let tMs: Double
    public let face: Bool
    /// Smoothed AU intensities and derived features (AUnL/R/U/B, PERCLOS, YAWN, STILL).
    public let aus: Features
    public let scores: [String: Double]
    /// Stabilised primary label ("neutral" when nothing clears the threshold).
    public let primary: Ranked
    public let neutral: Double
    public let complex: [Ranked]
    public let regions: [String: Double]
    public let pspi: Double
    public let pose: Pose
    public let blinkRate: Int
    public let perclos: Double
    public let events: [EngineEvent]
    public let calibrated: Bool
    public let calibrationActive: Bool
    public let calibrationProgress: Double
    public let calibrationResult: BaselineTracker.CalibrationStep?
    /// Active personal-range step id and its progress / completion.
    public let rangeStepId: String?
    public let range: BaselineTracker.RangeStep?
}

/// Real-time facial expression engine — a line-for-line port of
/// web/src/engine/engine.ts, verified against the same golden fixtures.
public final class EmotionEngine {
    public let cm: CompiledModel
    public let baseline: BaselineTracker
    public var sensitivity: Double
    /// Whether the extended catalogue (tier "extended") is scored and listed.
    public var extended: Bool

    private var filters: [String: OneEuroFilter] = [:]
    private var rangeStepId: String?
    private var rangeState: BaselineTracker.RangeStep?
    private let temporal: TemporalFeatures
    private let micro: MicroExpressionDetector
    private let primaryIds: [String]
    private var scores: [String: Double] = [:]
    private var lastT: Double?
    private var current = Ranked(id: "neutral", score: 1)
    private var candidate: (id: String, since: Double)?
    private var lastFeatures: Features = [:]

    public init(model: EmotionModel, platform: String, sensitivity: Double = 1, extended: Bool = false) throws {
        cm = try CompiledModel(model: model, platform: platform)
        baseline = BaselineTracker(cm)
        self.sensitivity = sensitivity
        self.extended = extended
        let f = cm.params.filter
        for ch in cm.channels { filters[ch.id] = OneEuroFilter(minCutoff: f.minCutoff, beta: f.beta, dCutoff: f.dCutoff) }
        temporal = TemporalFeatures(cm.params)
        micro = MicroExpressionDetector(cm.params.micro)
        primaryIds = cm.expressions.filter { $0.tier == "primary" }.map(\.id)
        for e in cm.expressions { scores[e.id] = 0 }
    }

    public func startCalibration(tMs: Double, durationSec: Double = 3) {
        baseline.startCalibration(t: tMs / 1000, duration: durationSec)
    }

    /// Begin one guided maximal-expression step of the personal range calibration.
    public func startRangeStep(tMs: Double, stepId: String) {
        baseline.startRangeStep(t: tMs / 1000, stepId: stepId)
    }

    /// Process one frame; `input` is nil when no face is visible.
    public func process(tMs: Double, _ input: [String: Double]?) -> FrameResult {
        let t = tMs / 1000
        let dt = lastT.map { max(0, t - $0) } ?? 0
        lastT = t
        let p = cm.params
        let measurements = input.map { withGaze(cm, $0) }

        let cal = baseline.calibrationStep(t: t, measurements)
        var progress = 0.0
        var result: BaselineTracker.CalibrationStep?
        switch cal {
        case .progress(let x): progress = x
        case .done, .failed: progress = 1; result = cal
        case nil: progress = 0
        }
        rangeStepId = baseline.rangeStepId
        rangeState = baseline.rangeStep(t: t, measurements)

        guard let measurements else {
            for flt in filters.values { flt.reset() }
            temporal.reset()
            let a = emaAlpha(dt, p.scoreTau * 3)
            for id in scores.keys { scores[id]! -= scores[id]! * a }
            current = Ranked(id: "neutral", score: 1)
            candidate = nil
            return makeResult(tMs, face: false, lastFeatures, [], progress, result, (pitch: 0, yaw: 0, roll: 0))
        }

        if !baseline.busy { baseline.update(measurements, dt: dt) }
        let base = { (k: String) in self.baseline.value(k) }

        // 1. Raw AU channels -> smoothed channels.
        var raw = computeAUs(cm, measurements, baseline, sensitivity)
        var smooth: Features = [:]
        for ch in cm.channels { smooth[ch.id] = filters[ch.id]!.filter(raw[ch.id]!, t) }
        addDerived(cm, &smooth, yaw: measurements["pose.yaw"] ?? 0, yawBaseline: base("pose.yaw"))

        // 2. Temporal behaviour from raw signals.
        let pose: Pose = (pitch: (measurements["pose.pitch"] ?? 0) - base("pose.pitch"),
                    yaw: (measurements["pose.yaw"] ?? 0) - base("pose.yaw"),
                    roll: (measurements["pose.roll"] ?? 0) - base("pose.roll"))
        let squeeze = max(raw["AU6"] ?? 0, raw["AU4"] ?? 0)
        var events = temporal.update(t: t, dt: dt, eyesClosed: raw["AU43"] ?? 0, squeeze: squeeze, mouthStretch: raw["AU27"] ?? 0,
                                     pose: (measurements["pose.pitch"] ?? 0, measurements["pose.yaw"] ?? 0, measurements["pose.roll"] ?? 0))
        let blinks = smoothstep(p.blinkRate.lo, p.blinkRate.hi, Double(temporal.blinkRate))
        let temporalValues: [(String, Double)] = [("PERCLOS", temporal.perclos), ("YAWN", temporal.yawn), ("STILL", temporal.still), ("BLINKS", blinks)]
        for (key, v) in temporalValues {
            raw[key] = v
            smooth[key] = v
        }

        // 3. Expression scores (smoothed for display, raw for brief expressions).
        let a = dt > 0 ? emaAlpha(dt, p.scoreTau) : 1
        var rawPrimary: [(String, Double)] = []
        for e in cm.expressions {
            if e.tier == "extended" && !extended {
                scores[e.id] = 0
                continue
            }
            let s = scoreExpression(cm, e, smooth)
            scores[e.id]! += (s - scores[e.id]!) * a
            if e.tier == "primary" && !p.micro.exclude.contains(e.id) {
                rawPrimary.append((e.id, scoreExpression(cm, e, raw)))
            }
        }
        events += micro.update(t: t, scores: rawPrimary, blinking: temporal.blinking)

        lastFeatures = smooth
        return makeResult(tMs, face: true, smooth, events, progress, result, pose)
    }

    private func makeResult(_ tMs: Double, face: Bool, _ f: Features, _ events: [EngineEvent], _ progress: Double,
                            _ calResult: BaselineTracker.CalibrationStep?, _ pose: Pose) -> FrameResult {
        let d = cm.params.display
        var best = Ranked(id: "neutral", score: d.primaryMin)
        var maxPrimary = 0.0
        for id in primaryIds {
            let s = scores[id]!
            maxPrimary = max(maxPrimary, s)
            if s > best.score { best = Ranked(id: id, score: s) }
        }
        if face { stabilise(best, tMs) }

        // Stable ranking: score descending, model order breaks ties (like JS's stable sort);
        // only the strongest member of each exclusive group is listed.
        var candidates: [(index: Int, ranked: Ranked)] = []
        for (i, e) in cm.expressions.enumerated() where e.tier != "primary" {
            let s = scores[e.id]!
            if s >= d.complexMin { candidates.append((i, Ranked(id: e.id, score: s))) }
        }
        candidates.sort { a, b in
            a.ranked.score != b.ranked.score ? a.ranked.score > b.ranked.score : a.index < b.index
        }
        var taken = Set<Int>()
        var complex: [Ranked] = []
        for c in candidates where complex.count < d.complexMax {
            if let g = d.exclusive.firstIndex(where: { $0.contains(c.ranked.id) }) {
                if taken.contains(g) { continue }
                taken.insert(g)
            }
            complex.append(c.ranked)
        }

        var regions: [String: Double] = [:]
        for r in cm.model.regions.keys { regions[r] = 0 }
        for au in cm.auIds {
            let region = cm.model.aus[au]!.region
            if let v = f[au], v > regions[region]! { regions[region] = v }
        }
        if !face { regions["head"] = 0; regions["gaze"] = 0 }

        let primaryScore = current.id == "neutral" ? 1 - maxPrimary : scores[current.id]!
        return FrameResult(
            tMs: tMs, face: face, aus: f, scores: scores,
            primary: Ranked(id: current.id, score: primaryScore), neutral: 1 - maxPrimary,
            complex: face ? complex : [], regions: regions, pspi: face ? EmotionEngine.pspiOf(f) : 0,
            pose: pose, blinkRate: temporal.blinkRate, perclos: temporal.perclos, events: events,
            calibrated: baseline.calibrated, calibrationActive: baseline.calibrating,
            calibrationProgress: progress, calibrationResult: calResult,
            rangeStepId: rangeState == nil ? nil : rangeStepId, range: rangeState)
    }

    private static func pspiOf(_ f: Features) -> Double { pspi(f) }

    private func stabilise(_ best: Ranked, _ tMs: Double) {
        let d = cm.params.display
        let curScore = current.id == "neutral" ? d.primaryMin : scores[current.id]!
        if best.id == current.id || best.score <= curScore + d.switchMargin {
            candidate = nil
            return
        }
        if let c = candidate, c.id == best.id {
            if tMs - c.since >= d.switchHoldMs {
                current = best
                candidate = nil
            }
        } else {
            candidate = (best.id, tMs)
        }
    }

    public func explain(_ id: String) -> Explanation {
        guard let e = cm.byId[id] else { return Explanation(variant: "", slots: []) }
        return explainExpression(cm, e, lastFeatures)
    }
}
