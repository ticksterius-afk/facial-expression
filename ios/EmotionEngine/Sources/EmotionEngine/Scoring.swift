import Foundation

public typealias Features = [String: Double]

/// AU channel intensity (mirrors web/src/engine/scoring.ts `channelValue`):
///   d = (x - baseline) - offset - sign(range) * deadzone
///   n = clamp(d / range * sensitivity, 0, 1);  AU = clamp(sum w * n, 0, 1)
/// Missing measurements are dropped and positive weights renormalised.
func channelValue(_ ch: CompiledChannel, _ m: [String: Double], _ baseline: BaselineView, _ sensitivity: Double) -> Double {
    var sum = 0.0
    var availablePos = 0.0
    for t in ch.terms {
        guard let x = m[t.key], x.isFinite else { continue }
        let d = x - baseline.value(t.key) - t.o - sign(t.r) * baseline.deadzone(t.key)
        let n = clamp01((d / t.r) * sensitivity)
        sum += t.w * n
        if t.w > 0 { availablePos += t.w }
    }
    if availablePos <= 0 { return 0 }
    return clamp01(sum * (ch.posWeight / availablePos))
}

public func computeAUs(_ cm: CompiledModel, _ m: [String: Double], _ baseline: BaselineView, _ sensitivity: Double) -> Features {
    var f: Features = [:]
    for ch in cm.channels { f[ch.id] = channelValue(ch, m, baseline, sensitivity) }
    addDerived(cm, &f, yaw: m["pose.yaw"] ?? 0, yawBaseline: baseline.value("pose.yaw"))
    return f
}

/// AUn = mean of sides; AUnU = one-sidedness (faded out in profile views); AUnB = min of sides.
func addDerived(_ cm: CompiledModel, _ f: inout Features, yaw: Double, yawBaseline: Double) {
    let a = cm.params.asymmetry
    let yawAbs = abs(yaw - yawBaseline)
    let asymGain = clamp01(1 - (yawAbs - a.yawFull) / (a.yawZero - a.yawFull))
    for au in cm.bilateral {
        guard let l = f[au + "L"], let r = f[au + "R"] else { continue }
        f[au] = (l + r) / 2
        f[au + "U"] = clamp01((abs(l - r) - a.noise) * asymGain / (1 - a.noise))
        f[au + "B"] = min(l, r)
    }
}

/// Adds camera-relative gaze ("gaze.yaw", "gaze.pitch", degrees) from head pose + eyeLook* blendshapes.
public func withGaze(_ cm: CompiledModel, _ m: [String: Double]) -> [String: Double] {
    guard let yaw = m["pose.yaw"], m["eyeLookOutLeft"] != nil else { return m }
    let k = cm.params.gaze.eyeDegPerUnit
    let g = { (key: String) in m[key] ?? 0 }
    let eyeYaw = (k * ((g("eyeLookOutLeft") + g("eyeLookInRight")) - (g("eyeLookInLeft") + g("eyeLookOutRight")))) / 2
    let eyePitch = (k * ((g("eyeLookUpLeft") + g("eyeLookUpRight")) - (g("eyeLookDownLeft") + g("eyeLookDownRight")))) / 2
    var out = m
    out["gaze.yaw"] = yaw + eyeYaw
    out["gaze.pitch"] = g("pose.pitch") + eyePitch
    return out
}

func slotValue(_ s: CompiledSlot, _ f: Features) -> (value: Double, best: String) {
    var x = 0.0
    var best = s.any[0]
    for name in s.any {
        if let v = f[name], v > x {
            x = v
            best = name
        }
    }
    return (x, best)
}

func slotEvidence(_ s: CompiledSlot, _ f: Features) -> Double {
    smoothstep(s.lo, s.hi, slotValue(s, f).value)
}

/// Soft-AND of core slots (mean of weighted arithmetic and geometric means),
/// boosted by supporting actions and damped by inhibiting ones.
public func scoreVariant(_ cm: CompiledModel, _ v: CompiledVariant, _ f: Features) -> Double {
    let floor = cm.params.floor
    var arith = 0.0
    var logSum = 0.0
    for s in v.slots {
        let ev = slotEvidence(s, f)
        arith += s.w * ev
        logSum += s.w * log(max(ev, floor))
    }
    let core = 0.5 * (arith / v.slotWeight) + 0.5 * exp(logSum / v.slotWeight)

    var support = 0.0
    if v.supportWeight > 0 {
        for s in v.support { support += s.w * slotEvidence(s, f) }
        support /= v.supportWeight
    }

    var inhibit = 1.0
    for s in v.inhibit { inhibit *= 1 - s.w * slotEvidence(s, f) }

    return clamp01(core * (1 + cm.params.supportGain * support) * inhibit)
}

public func scoreBestVariant(_ cm: CompiledModel, _ e: CompiledExpression, _ f: Features) -> (score: Double, variant: CompiledVariant) {
    var best = (score: -1.0, variant: e.variants[0])
    for v in e.variants {
        let s = scoreVariant(cm, v, f)
        if s > best.score { best = (s, v) }
    }
    return best
}

public func scoreExpression(_ cm: CompiledModel, _ e: CompiledExpression, _ f: Features) -> Double {
    scoreBestVariant(cm, e, f).score
}

public struct SlotExplanation: Sendable {
    public enum Kind: String, Sendable { case core, support, inhibit }
    public let kind: Kind
    public let features: [String]
    public let best: String
    public let value: Double
    public let evidence: Double
    public let weight: Double
}

public struct Explanation: Sendable {
    public let variant: String
    public let slots: [SlotExplanation]
}

public func explainExpression(_ cm: CompiledModel, _ e: CompiledExpression, _ f: Features) -> Explanation {
    let variant = scoreBestVariant(cm, e, f).variant
    var out: [SlotExplanation] = []
    func add(_ kind: SlotExplanation.Kind, _ slots: [CompiledSlot]) {
        for s in slots {
            var best = s.any[0]
            var value = -1.0
            for name in s.any {
                let v = f[name] ?? 0
                if v > value { value = v; best = name }
            }
            out.append(SlotExplanation(kind: kind, features: s.any, best: best, value: value, evidence: smoothstep(s.lo, s.hi, value), weight: s.w))
        }
    }
    add(.core, variant.slots)
    add(.support, variant.support)
    add(.inhibit, variant.inhibit)
    return Explanation(variant: variant.name, slots: out)
}

/// Prkachin & Solomon Pain Intensity, 0–16.
public func pspi(_ f: Features) -> Double {
    let g = { (k: String) in f[k] ?? 0 }
    return 5 * g("AU4") + 5 * max(g("AU6"), g("AU7")) + 5 * max(g("AU9"), g("AU10")) + (g("AU43") >= 0.5 ? 1 : 0)
}
