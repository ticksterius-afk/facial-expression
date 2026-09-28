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
            f["PERCLOS"] = 0; f["YAWN"] = 0; f["STILL"] = 1
            let primaries = cm.expressions.filter { $0.tier == "primary" }
            let best = primaries.max { scoreExpression(cm, $0, f) < scoreExpression(cm, $1, f) }!
            XCTAssertEqual(best.id, id)
        }
    }
}
