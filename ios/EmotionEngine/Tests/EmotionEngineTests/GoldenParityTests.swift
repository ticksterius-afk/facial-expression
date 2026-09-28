import XCTest
@testable import EmotionEngine

/// Replays model/fixtures/sequences.json and requires the Swift engine to reproduce the
/// TypeScript engine's outputs in model/fixtures/golden.json (web/scripts/make-golden.ts).
final class GoldenParityTests: XCTestCase {
    struct Sequences: Decodable {
        struct Frame: Decodable { let t: Double; let m: [String: Double]?; let cmd: String? }
        struct Sequence: Decodable { let name: String; let platform: String; let frames: [Frame] }
        let sequences: [Sequence]
    }
    struct Golden: Decodable {
        struct Frame: Decodable {
            let t: Double
            let face: Bool
            let primary: String
            let complex: [String]
            let calibrated: Bool
            let scores: [String: Double]
            let aus: [String: Double]
            let pspi: Double
            let events: [String]
        }
        struct Sequence: Decodable { let name: String; let frames: [Frame] }
        let modelVersion: String
        let sequences: [Sequence]
    }

    func testMatchesTypeScriptEngine() throws {
        let model = try loadModel()
        let fixtures = repoRoot.appendingPathComponent("model/fixtures")
        let inputs = try JSONDecoder().decode(Sequences.self, from: Data(contentsOf: fixtures.appendingPathComponent("sequences.json")))
        let golden = try JSONDecoder().decode(Golden.self, from: Data(contentsOf: fixtures.appendingPathComponent("golden.json")))
        XCTAssertEqual(golden.modelVersion, model.version)
        XCTAssertEqual(inputs.sequences.count, golden.sequences.count)

        for (seq, expected) in zip(inputs.sequences, golden.sequences) {
            XCTAssertEqual(seq.name, expected.name)
            let engine = try EmotionEngine(model: model, platform: seq.platform)
            var mismatches = 0
            for (i, (frame, want)) in zip(seq.frames, expected.frames).enumerated() {
                if let cmd = frame.cmd, cmd.hasPrefix("calibrate:") {
                    engine.startCalibration(tMs: frame.t, durationSec: Double(cmd.dropFirst("calibrate:".count))!)
                }
                let got = engine.process(tMs: frame.t, frame.m)
                let at = "\(seq.name) frame \(i) t=\(frame.t)"
                XCTAssertEqual(got.face, want.face, at)
                XCTAssertEqual(got.primary.id, want.primary, at)
                XCTAssertEqual(got.complex.map(\.id), want.complex, at)
                XCTAssertEqual(got.calibrated, want.calibrated, at)
                XCTAssertEqual(got.events.map(\.tag), want.events, at)
                XCTAssertEqual(got.pspi, want.pspi, accuracy: 1e-4, at)
                for (k, v) in want.scores {
                    let g = try XCTUnwrap(got.scores[k], "\(at) missing score \(k)")
                    if abs(g - v) > 1e-5 { mismatches += 1; XCTFail("\(at) score \(k): swift \(g) vs ts \(v)") }
                }
                for (k, v) in want.aus {
                    let g = try XCTUnwrap(got.aus[k], "\(at) missing feature \(k)")
                    if abs(g - v) > 1e-5 { mismatches += 1; XCTFail("\(at) \(k): swift \(g) vs ts \(v)") }
                }
                if mismatches > 20 { return } // keep the log readable
            }
        }
    }
}
