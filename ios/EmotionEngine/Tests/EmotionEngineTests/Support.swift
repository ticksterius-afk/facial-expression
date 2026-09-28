import Foundation
@testable import EmotionEngine

/// Repository root, found relative to this source file (works for `swift test` on macOS and Linux).
let repoRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent() // EmotionEngineTests
    .deletingLastPathComponent() // Tests
    .deletingLastPathComponent() // EmotionEngine
    .deletingLastPathComponent() // ios
    .deletingLastPathComponent() // repo

func loadModel() throws -> EmotionModel {
    try EmotionModel.load(from: Data(contentsOf: repoRoot.appendingPathComponent("model/emotion-model.json")))
}

/// A resting ARKit face with some blendshapes set; "{S}" keys set both sides.
func arkitFace(_ cm: CompiledModel, _ set: [String: Double] = [:]) -> [String: Double] {
    var m = Dictionary(uniqueKeysWithValues: cm.measurements.map { ($0.key, $0.rest) })
    for (k, v) in set {
        if k.contains("{S}") {
            m[k.replacingOccurrences(of: "{S}", with: "Left")] = v
            m[k.replacingOccurrences(of: "{S}", with: "Right")] = v
        } else {
            m[k] = v
        }
    }
    return m
}
