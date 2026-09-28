import XCTest
@testable import EmotionEngine

final class ModelTests: XCTestCase {
    func testBundledModelMatchesRepositoryModel() throws {
        let bundled = try Data(contentsOf: XCTUnwrap(Bundle.module.url(forResource: "emotion-model", withExtension: "json")))
        let repo = try Data(contentsOf: repoRoot.appendingPathComponent("model/emotion-model.json"))
        XCTAssertEqual(bundled, repo, "Run `npm run sync:ios` in web/ after editing model/emotion-model.json")
    }

    func testCompilesForBothPlatforms() throws {
        let model = try EmotionModel.bundled()
        for platform in ["arkit", "mediapipe"] {
            XCTAssertNoThrow(try CompiledModel(model: model, platform: platform), platform)
        }
        XCTAssertThrowsError(try CompiledModel(model: model, platform: "nope"))
    }

    func testPrimaryPrototypes() throws {
        let cm = try CompiledModel(model: loadModel(), platform: "arkit")
        let base = DefaultBaseline(cm)
        let prototypes: [String: [String: Double]] = [
            "happiness": ["mouthSmile{S}": 0.8, "cheekSquint{S}": 0.5, "jawOpen": 0.1],
            "sadness": ["browInnerUp": 0.7, "browDown{S}": 0.35, "mouthFrown{S}": 0.55, "mouthShrugLower": 0.3],
            "surprise": ["browInnerUp": 0.7, "browOuterUp{S}": 0.7, "eyeWide{S}": 0.6, "jawOpen": 0.45],
            "anger": ["browDown{S}": 0.8, "eyeSquint{S}": 0.55, "eyeWide{S}": 0.25, "mouthPress{S}": 0.6, "mouthShrugLower": 0.3],
            "disgust": ["noseSneer{S}": 0.7, "mouthUpperUp{S}": 0.55, "browDown{S}": 0.35, "mouthShrugLower": 0.25],
        ]
        for (id, face) in prototypes {
            let aus = computeAUs(cm, withGaze(cm, arkitFace(cm, face)), base, 1)
            var f = aus
            f["PERCLOS"] = 0; f["YAWN"] = 0; f["STILL"] = 1; f["BLINKS"] = 0
            let primaries = cm.expressions.filter { $0.tier == "primary" }
            let best = primaries.max { scoreExpression(cm, $0, f) < scoreExpression(cm, $1, f) }!
            XCTAssertEqual(best.id, id)
        }
    }

    /// EMFACS partial fear faces (1+2+4+5, 5+20) count as fear only with both of their actions.
    func testPartialFearFaces() throws {
        let cm = try CompiledModel(model: loadModel(), platform: "arkit")
        let base = DefaultBaseline(cm)
        let primaries = cm.expressions.filter { $0.tier == "primary" }
        func scores(_ face: [String: Double]) -> [String: Double] {
            var f = computeAUs(cm, withGaze(cm, arkitFace(cm, face)), base, 1)
            f["PERCLOS"] = 0; f["YAWN"] = 0; f["STILL"] = 1; f["BLINKS"] = 0
            return Dictionary(uniqueKeysWithValues: primaries.map { ($0.id, scoreExpression(cm, $0, f)) })
        }
        let upperFace = ["browInnerUp": 0.65, "browOuterUp{S}": 0.4, "browDown{S}": 0.45, "eyeWide{S}": 0.6]
        let eyesAndLips = ["eyeWide{S}": 0.6, "mouthStretch{S}": 0.6]
        for face in [upperFace, eyesAndLips] {
            let s = scores(face)
            XCTAssertEqual(s.max { $0.value < $1.value }?.key, "fear", "\(face)")
        }
        for face in [["eyeWide{S}": 0.7], ["mouthStretch{S}": 0.7]] {
            XCTAssertLessThan(scores(face)["fear"]!, cm.params.display.primaryMin, "\(face)")
        }
    }
}
