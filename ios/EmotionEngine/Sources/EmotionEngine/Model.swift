import Foundation

// MARK: - JSON model (model/emotion-model.json)

public struct ModelTerm: Codable, Sendable {
    /// Measurement key; may contain "{S}" for bilateral AUs.
    public let m: String
    /// Signed range: the change from baseline that maps to full intensity.
    public let r: Double
    public let w: Double
    public let o: Double?
}

public struct ModelMeasurement: Codable, Sendable {
    public let rest: Double
    public let scale: Double
    public let spread: Double
    public let mode: String
    /// Uncalibrated drift limit (× scale) overriding params.adapt.maxDriftUncalibrated.
    public let drift: Double?
    /// [lo, hi] degrees: weight fades 1 → 0 as head pitch or yaw leaves its baseline by lo → hi.
    public let poseGate: [Double]?
}

public struct ModelSlot: Codable, Sendable {
    public let any: [String]
    public let w: Double
    public let t: [Double]?
}

public struct ModelVariant: Codable, Sendable {
    public let name: String
    /// Overrides the tier's strictness (e.g. for a partial face whose actions must co-occur).
    public let strictness: Double?
    public let slots: [ModelSlot]
    public let support: [ModelSlot]
    public let inhibit: [ModelSlot]
}

public struct ModelExpression: Codable, Sendable {
    public let id: String
    public let tier: String
    public let name: String
    public let emoji: String
    public let gloss: String
    public let cues: String
    public let slots: [ModelSlot]?
    public let support: [ModelSlot]?
    public let inhibit: [ModelSlot]?
    public let variants: [ModelVariant]?
    public let refs: [String]
}

public struct ModelAU: Codable, Sendable {
    public let name: String
    public let muscles: String
    public let region: String
    public let bilateral: Bool
    public let look: String
}

public struct ModelParams: Codable, Sendable {
    public struct Adapt: Codable, Sendable {
        public let lowTauDown, lowTauUp, medianTau, maxDriftUncalibrated, maxDriftCalibrated: Double
        public let deadzoneInitial, deadzoneLearned, deadzoneLearnSec, deadzoneCalibrated: Double
    }
    public struct Asymmetry: Codable, Sendable { public let noise, yawFull, yawZero: Double }
    public struct Gaze: Codable, Sendable { public let eyeDegPerUnit: Double }
    public struct Filter: Codable, Sendable { public let minCutoff, beta, dCutoff: Double }
    public struct Display: Codable, Sendable {
        public let primaryMin, complexMin: Double
        public let complexMax: Int
        public let switchMargin, switchHoldMs: Double
        /// Groups of alternative readings; only the strongest of each group is listed.
        public let exclusive: [[String]]
    }
    public struct Micro: Codable, Sendable {
        public let on, off, minPeak, minMs, maxMs, quietMs: Double
        public let exclude: [String]
    }
    public struct Blink: Codable, Sendable { public let on, off, minMs, maxMs: Double }
    public struct Perclos: Codable, Sendable { public let windowSec, closed, maxSqueeze: Double }
    public struct Yawn: Codable, Sendable { public let open, startSec, fullSec, holdSec: Double }
    public struct Stillness: Codable, Sendable { public let tau, degPerSec: Double }
    public struct BlinkRate: Codable, Sendable { public let lo, hi: Double }
    public struct Range: Codable, Sendable { public let settleSec, holdSec, minFraction, gainMin, gainMax: Double }

    public let evidence: [Double]
    public let floor: Double
    public let supportGain: Double
    /// Per tier: weight of the geometric mean in the core soft-AND.
    public let strictness: [String: Double]
    public let adapt: Adapt
    public let asymmetry: Asymmetry
    public let gaze: Gaze
    public let filter: Filter
    public let scoreTau: Double
    public let display: Display
    public let micro: Micro
    public let blink: Blink
    public let perclos: Perclos
    public let yawn: Yawn
    public let stillness: Stillness
    public let blinkRate: BlinkRate
    public let range: Range
}

/// One guided maximal expression used to learn a person's range of movement.
public struct ModelRangeStep: Codable, Sendable {
    public struct Target: Codable, Sendable {
        public let m: String
        public let dir: Int
    }
    public let id: String
    public let prompt: String
    public let targets: [Target]
}

public struct PlatformSpec: Codable, Sendable {
    public let about: String
    public let measurements: [String: ModelMeasurement]
    public let recipes: [String: [ModelTerm]]
}

public struct TemporalSpec: Codable, Sendable {
    public let name: String
    public let look: String
}

public struct EmotionModel: Codable, Sendable {
    public let version: String
    public let about: String
    public let params: ModelParams
    public let regions: [String: String]
    public let aus: [String: ModelAU]
    public let temporal: [String: TemporalSpec]
    public let platforms: [String: PlatformSpec]
    public let tiers: [String: String]
    public let expressions: [ModelExpression]
    public let rangeSteps: [ModelRangeStep]
    public let references: [String: String]

    public static func load(from data: Data) throws -> EmotionModel {
        try JSONDecoder().decode(EmotionModel.self, from: data)
    }

    /// The model bundled with this package.
    public static func bundled() throws -> EmotionModel {
        guard let url = Bundle.module.url(forResource: "emotion-model", withExtension: "json") else {
            throw ModelError.invalid(["bundled emotion-model.json not found"])
        }
        return try load(from: Data(contentsOf: url))
    }
}

public enum ModelError: Error, CustomStringConvertible {
    case invalid([String])
    public var description: String {
        switch self {
        case .invalid(let errors): return "Invalid emotion model:\n  " + errors.joined(separator: "\n  ")
        }
    }
}

// MARK: - Compiled model

public struct CompiledTerm: Sendable {
    public let key: String
    public let r: Double
    public let w: Double
    public let o: Double
    /// The measurement's poseGate [lo, hi] in degrees, if any.
    public let gate: [Double]?
}

/// One AU output channel, e.g. "AU12L", "AU12R" or "AU17".
public struct CompiledChannel: Sendable {
    public let id: String
    public let au: String
    public let terms: [CompiledTerm]
    public let posWeight: Double
}

public struct CompiledMeasurement: Sendable {
    public let key: String
    public let rest: Double
    public let scale: Double
    public let spread: Double
    public let isLow: Bool
    public let drift: Double?
}

public struct CompiledSlot: Sendable {
    public let any: [String]
    public let w: Double
    public let lo: Double
    public let hi: Double
}

public struct CompiledVariant: Sendable {
    public let name: String
    public let strictness: Double
    public let slots: [CompiledSlot]
    public let support: [CompiledSlot]
    public let inhibit: [CompiledSlot]
    public let slotWeight: Double
    public let supportWeight: Double
}

public struct CompiledExpression: Sendable {
    public let id: String
    public let tier: String
    public let name: String
    public let emoji: String
    public let gloss: String
    public let cues: String
    public let refs: [String]
    public let variants: [CompiledVariant]
}

public struct CompiledRangeStep: Sendable {
    public struct Target: Sendable {
        public let key: String
        public let dir: Double
        public let scale: Double
    }
    public let id: String
    public let prompt: String
    /// Targets available on this platform, sides expanded.
    public let targets: [Target]
}

public let temporalFeatures = ["PERCLOS", "YAWN", "STILL", "BLINKS"]
let sides = ["Left", "Right"]

public struct CompiledModel: Sendable {
    public let model: EmotionModel
    public let platform: String
    public var params: ModelParams { model.params }
    public let measurements: [CompiledMeasurement]
    public let channels: [CompiledChannel]
    public let auIds: [String]
    public let bilateral: [String]
    public let expressions: [CompiledExpression]
    public let byId: [String: CompiledExpression]
    /// Guided range-calibration steps, restricted to this platform's measurements.
    public let rangeSteps: [CompiledRangeStep]

    public init(model: EmotionModel, platform: String) throws {
        guard let p = model.platforms[platform] else { throw ModelError.invalid(["Model has no platform \"\(platform)\""]) }
        var errors: [String] = []
        let expand = { (s: String, side: String) in s.replacingOccurrences(of: "{S}", with: side) }

        var measurements: [CompiledMeasurement] = []
        for key in p.measurements.keys.sorted() {
            let m = p.measurements[key]!
            if !(m.scale > 0) || !(m.spread >= 0) { errors.append("\(platform): measurement \(key) needs scale > 0 and spread >= 0") }
            let keys = key.contains("{S}") ? sides.map { expand(key, $0) } : [key]
            if let d = m.drift, !(d > 0) { errors.append("\(platform): measurement \(key) drift must be > 0") }
            if let g = m.poseGate, !(g.count == 2 && g[0] >= 0 && g[1] > g[0]) {
                errors.append("\(platform): measurement \(key) poseGate must be [lo, hi] with 0 <= lo < hi")
            }
            for k in keys { measurements.append(CompiledMeasurement(key: k, rest: m.rest, scale: m.scale, spread: m.spread, isLow: m.mode == "low", drift: m.drift)) }
        }
        let measurementKeys = Set(measurements.map(\.key))
        var gateOf: [String: [Double]] = [:]
        for key in p.measurements.keys {
            guard let g = p.measurements[key]!.poseGate else { continue }
            let keys = key.contains("{S}") ? sides.map { expand(key, $0) } : [key]
            for k in keys { gateOf[k] = g }
        }

        let auIds = model.aus.keys.sorted { auOrder($0) < auOrder($1) }
        let bilateral = auIds.filter { model.aus[$0]!.bilateral }
        var channels: [CompiledChannel] = []
        for au in p.recipes.keys.sorted() {
            let terms = p.recipes[au]!
            if model.aus[au] == nil { errors.append("\(platform): recipe for unknown AU \(au)") }
            let isBilateral = model.aus[au]?.bilateral ?? false
            let variants: [(String, String?)] = isBilateral ? [("L", "Left"), ("R", "Right")] : [("", nil)]
            for (suffix, sideName) in variants {
                let ct: [CompiledTerm] = terms.map { t in
                    if sideName == nil && t.m.contains("{S}") { errors.append("\(platform): \(au) is not bilateral but uses {S}") }
                    let key = sideName.map { expand(t.m, $0) } ?? t.m
                    if !measurementKeys.contains(key) { errors.append("\(platform): \(au) references unknown measurement \(key)") }
                    if t.r == 0 { errors.append("\(platform): \(au) term \(t.m) has zero range") }
                    return CompiledTerm(key: key, r: t.r, w: t.w, o: t.o ?? 0, gate: gateOf[key])
                }
                channels.append(CompiledChannel(id: au + suffix, au: au, terms: ct, posWeight: ct.reduce(0) { $0 + max(0, $1.w) }))
            }
        }

        var featureNames = Set(temporalFeatures)
        for au in auIds {
            featureNames.insert(au)
            if model.aus[au]!.bilateral { for s in ["L", "R", "U", "B"] { featureNames.insert(au + s) } }
        }
        let ev = model.params.evidence
        func compileSlots(_ exp: String, _ slots: [ModelSlot]) -> [CompiledSlot] {
            slots.map { s in
                for f in s.any where !featureNames.contains(f) { errors.append("\(exp): unknown feature \(f)") }
                if !(s.w > 0) { errors.append("\(exp): slot weight must be > 0") }
                let t = s.t ?? ev
                if !(t[1] > t[0]) { errors.append("\(exp): evidence range must increase") }
                return CompiledSlot(any: s.any, w: s.w, lo: t[0], hi: t[1])
            }
        }

        var expressions: [CompiledExpression] = []
        var seen = Set<String>()
        for e in model.expressions {
            if seen.contains(e.id) { errors.append("duplicate expression id \(e.id)") }
            seen.insert(e.id)
            if model.tiers[e.tier] == nil { errors.append("\(e.id): unknown tier \(e.tier)") }
            let strictness = model.params.strictness[e.tier] ?? -1
            if !(strictness >= 0 && strictness <= 1) { errors.append("\(e.id): params.strictness.\(e.tier) must be in [0, 1]") }
            for r in e.refs where model.references[r] == nil { errors.append("\(e.id): unknown reference \(r)") }
            if e.variants != nil && e.slots != nil { errors.append("\(e.id): use either variants or top-level slots") }
            let raw = e.variants ?? [ModelVariant(name: "", strictness: nil, slots: e.slots ?? [], support: e.support ?? [], inhibit: e.inhibit ?? [])]
            let variants: [CompiledVariant] = raw.map { v in
                if v.slots.isEmpty { errors.append("\(e.id): every variant needs at least one slot") }
                let slots = compileSlots(e.id, v.slots)
                let support = compileSlots(e.id, v.support)
                let inhibit = compileSlots(e.id, v.inhibit)
                for s in inhibit where s.w > 1 { errors.append("\(e.id): inhibit weight must be <= 1") }
                if let s = v.strictness, !(s >= 0 && s <= 1) { errors.append("\(e.id)/\(v.name): strictness must be in [0, 1]") }
                return CompiledVariant(name: v.name, strictness: v.strictness ?? strictness, slots: slots, support: support, inhibit: inhibit,
                                       slotWeight: slots.reduce(0) { $0 + $1.w }, supportWeight: support.reduce(0) { $0 + $1.w })
            }
            expressions.append(CompiledExpression(id: e.id, tier: e.tier, name: e.name, emoji: e.emoji, gloss: e.gloss, cues: e.cues, refs: e.refs, variants: variants))
        }
        for au in auIds where model.regions[model.aus[au]!.region] == nil { errors.append("\(au): unknown region") }

        // Range steps: expand sides and keep only measurements this platform has.
        var scaleOf: [String: Double] = [:]
        for m in measurements { scaleOf[m.key] = m.scale }
        let templates = Set(p.measurements.keys)
        let allTemplates = Set(model.platforms.values.flatMap { $0.measurements.keys })
        var rangeSteps: [CompiledRangeStep] = []
        for step in model.rangeSteps {
            var targets: [CompiledRangeStep.Target] = []
            for t in step.targets {
                if t.dir != 1 && t.dir != -1 { errors.append("range step \(step.id): dir must be 1 or -1") }
                if !allTemplates.contains(t.m) { errors.append("range step \(step.id): unknown measurement \(t.m)") }
                if !templates.contains(t.m) { continue }
                let keys = t.m.contains("{S}") ? sides.map { expand(t.m, $0) } : [t.m]
                for key in keys { targets.append(CompiledRangeStep.Target(key: key, dir: Double(t.dir), scale: scaleOf[key]!)) }
            }
            rangeSteps.append(CompiledRangeStep(id: step.id, prompt: step.prompt, targets: targets))
        }

        if !errors.isEmpty { throw ModelError.invalid(errors) }

        self.model = model
        self.platform = platform
        self.measurements = measurements
        self.channels = channels
        self.auIds = auIds
        self.bilateral = bilateral
        self.expressions = expressions
        self.byId = Dictionary(uniqueKeysWithValues: expressions.map { ($0.id, $0) })
        self.rangeSteps = rangeSteps
    }
}

/// Catalogue order for AU ids: numeric FACS codes first, then named features.
func auOrder(_ id: String) -> (Int, String) {
    if id.hasPrefix("AU"), let n = Int(id.dropFirst(2)) { return (n, id) }
    return (1000, id)
}
