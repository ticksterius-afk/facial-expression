import Foundation

/// Baseline lookup used by AU computation (see BaselineTracker).
public protocol BaselineView {
    func value(_ key: String) -> Double
    func deadzone(_ key: String) -> Double
    /// Personal range gain for a measurement moving in direction `dir` (+1/-1).
    func gain(_ key: String, _ dir: Double) -> Double
}

@inline(__always) func gainKey(_ key: String, _ dir: Double) -> String {
    key + (dir < 0 ? "|-" : "|+")
}

/// Per-person neutral baseline for every measurement: calibrated (median over a
/// few seconds of a neutral face) or adaptive ("low" = lower envelope for
/// one-sided signals, "median" = slow sign-step tracker for two-sided ones),
/// with bounded drift and a dead-zone that narrows as the person is learned.
/// Mirrors web/src/engine/baseline.ts.
public final class BaselineTracker: BaselineView {
    private let cm: CompiledModel
    private let specs: [String: CompiledMeasurement]
    private var values: [String: Double] = [:]
    private var anchors: [String: Double] = [:]
    private var gains: [String: Double] = [:]
    private var faceTime = 0.0
    public private(set) var calibrated = false
    private var calib: (start: Double, duration: Double, samples: [String: [Double]], frames: Int, faceFrames: Int)?
    private var rangeRun: (step: CompiledRangeStep, start: Double, samples: [String: [Double]], frames: Int, faceFrames: Int)?

    public init(_ cm: CompiledModel) {
        self.cm = cm
        self.specs = Dictionary(uniqueKeysWithValues: cm.measurements.map { ($0.key, $0) })
        reset()
    }

    public func reset() {
        values.removeAll()
        anchors.removeAll()
        for m in cm.measurements {
            values[m.key] = m.rest
            anchors[m.key] = m.rest
        }
        calibrated = false
        faceTime = 0
    }

    public func value(_ key: String) -> Double {
        values[key] ?? specs[key]?.rest ?? 0
    }

    public var deadzoneFactor: Double {
        let a = cm.params.adapt
        if calibrated { return a.deadzoneCalibrated }
        let learned = min(1, faceTime / a.deadzoneLearnSec)
        return a.deadzoneInitial + (a.deadzoneLearned - a.deadzoneInitial) * learned
    }

    public func deadzone(_ key: String) -> Double {
        (specs[key]?.spread ?? 0) * deadzoneFactor
    }

    public func gain(_ key: String, _ dir: Double) -> Double {
        gains[gainKey(key, dir)] ?? 1
    }

    /// True while a neutral or range calibration is collecting (baselines are frozen).
    public var busy: Bool { calib != nil || rangeRun != nil }

    /// Adapt towards the current measurements. dt in seconds.
    public func update(_ measurements: [String: Double], dt: Double) {
        if !(dt > 0) { return }
        if dt < 1 { faceTime += dt }
        let a = cm.params.adapt
        let tauUp = calibrated ? a.lowTauUp : a.lowTauUp / 3
        for m in cm.measurements {
            guard let x = measurements[m.key], x.isFinite else { continue }
            var b = values[m.key]!
            if m.isLow {
                let tau = x < b ? a.lowTauDown : tauUp
                b += (x - b) * (1 - exp(-dt / tau))
            } else {
                let step = (m.scale * dt) / a.medianTau
                let d = x - b
                b += abs(d) < step ? d : sign(d) * step
            }
            let anchor = anchors[m.key]!
            let lim = (calibrated ? a.maxDriftCalibrated : m.drift ?? a.maxDriftUncalibrated) * m.scale
            b = min(anchor + lim, max(anchor - lim, b))
            values[m.key] = b
        }
    }

    public func startCalibration(t: Double, duration: Double = 3) {
        calib = (t, duration, [:], 0, 0)
    }

    public func cancelCalibration() { calib = nil }

    public var calibrating: Bool { calib != nil }

    public enum CalibrationStep: Equatable, Sendable {
        case progress(Double)
        case done
        case failed
    }

    /// Feeds a frame to an active calibration; nil when none is active.
    public func calibrationStep(t: Double, _ measurements: [String: Double]?) -> CalibrationStep? {
        guard var c = calib else { return nil }
        c.frames += 1
        if let measurements {
            c.faceFrames += 1
            for m in cm.measurements {
                guard let x = measurements[m.key], x.isFinite else { continue }
                c.samples[m.key, default: []].append(x)
            }
        }
        let progress = (t - c.start) / c.duration
        if progress < 1 {
            calib = c
            return .progress(max(0, progress))
        }
        calib = nil
        if Double(c.faceFrames) < max(5, 0.6 * Double(c.frames)) { return .failed }
        setCalibration(c.samples.mapValues(median))
        return .done
    }

    /// Apply calibrated neutral values (e.g. restored from storage).
    public func setCalibration(_ newValues: [String: Double]) {
        for (k, v) in newValues where specs[k] != nil && v.isFinite {
            values[k] = v
            anchors[k] = v
        }
        calibrated = true
    }

    public func calibration() -> [String: Double]? {
        calibrated ? anchors : nil
    }

    // MARK: Personal range calibration

    public enum RangeStep: Equatable, Sendable {
        case progress(Double)
        case done(updated: [String], weak: [String])
        case failed
    }

    /// Begin one guided maximal-expression step (see model.rangeSteps). t in seconds.
    public func startRangeStep(t: Double, stepId: String) {
        guard let step = cm.rangeSteps.first(where: { $0.id == stepId }) else { return }
        rangeRun = (step, t, [:], 0, 0)
    }

    public func cancelRangeStep() { rangeRun = nil }

    public var rangeStepId: String? { rangeRun?.step.id }

    /// Samples after a settle period; at the end each target's 90th-percentile deviation
    /// sets gain = scale / deviation (clamped). Barely-moving targets are reported as weak.
    public func rangeStep(t: Double, _ measurements: [String: Double]?) -> RangeStep? {
        guard var r = rangeRun else { return nil }
        let p = cm.params.range
        let elapsed = t - r.start
        r.frames += 1
        if let measurements {
            r.faceFrames += 1
            if elapsed >= p.settleSec {
                for target in r.step.targets {
                    guard let x = measurements[target.key], x.isFinite else { continue }
                    r.samples[gainKey(target.key, target.dir), default: []].append(target.dir * (x - value(target.key)))
                }
            }
        }
        let total = p.settleSec + p.holdSec
        if elapsed < total {
            rangeRun = r
            return .progress(max(0, elapsed / total))
        }
        rangeRun = nil
        if Double(r.faceFrames) < max(5, 0.6 * Double(r.frames)) { return .failed }
        var updated: [String] = []
        var weak: [String] = []
        for target in r.step.targets {
            let k = gainKey(target.key, target.dir)
            guard let arr = r.samples[k], arr.count >= 5 else { continue }
            let peak = quantile(arr, 0.9)
            if peak >= p.minFraction * target.scale {
                gains[k] = min(p.gainMax, max(p.gainMin, target.scale / peak))
                updated.append(k)
            } else {
                weak.append(k)
            }
        }
        return .done(updated: updated, weak: weak)
    }

    public func rangeGains() -> [String: Double] { gains }

    public func setGains(_ newGains: [String: Double]) {
        let p = cm.params.range
        for (k, v) in newGains {
            guard let bar = k.lastIndex(of: "|"), specs[String(k[..<bar])] != nil, v.isFinite else { continue }
            gains[k] = min(p.gainMax, max(p.gainMin, v))
        }
    }

    public func resetGains() { gains.removeAll() }
}

/// Stateless baseline at the model's default rest values.
public struct DefaultBaseline: BaselineView {
    private let rest: [String: Double]
    private let spread: [String: Double]
    private let factor: Double

    public init(_ cm: CompiledModel, deadzoneFactor: Double? = nil, overrides: [String: Double] = [:]) {
        rest = Dictionary(uniqueKeysWithValues: cm.measurements.map { ($0.key, overrides[$0.key] ?? $0.rest) })
        spread = Dictionary(uniqueKeysWithValues: cm.measurements.map { ($0.key, $0.spread) })
        factor = deadzoneFactor ?? cm.params.adapt.deadzoneInitial
    }

    public func value(_ key: String) -> Double { rest[key] ?? 0 }
    public func deadzone(_ key: String) -> Double { (spread[key] ?? 0) * factor }
    public func gain(_ key: String, _ dir: Double) -> Double { 1 }
}

/// Nearest-rank quantile (q in [0,1]).
func quantile(_ a: [Double], _ q: Double) -> Double {
    let s = a.sorted()
    return s[min(s.count - 1, Int((q * Double(s.count)).rounded(.down)))]
}

func median(_ a: [Double]) -> Double {
    if a.isEmpty { return .nan }
    let s = a.sorted()
    let m = s.count / 2
    return s.count % 2 == 1 ? s[m] : (s[m - 1] + s[m]) / 2
}
