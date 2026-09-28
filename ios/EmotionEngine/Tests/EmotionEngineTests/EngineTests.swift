import XCTest
@testable import EmotionEngine

final class EngineTests: XCTestCase {
    private func run(_ e: EmotionEngine, from t0: Double, ms: Double, _ face: (Double) -> [String: Double]?) -> (t: Double, frames: [FrameResult]) {
        var out: [FrameResult] = []
        var t = t0
        while t < t0 + ms {
            out.append(e.process(tMs: t, face(t)))
            t += 1000.0 / 30
        }
        return (t, out)
    }

    func testCalibrationRemovesRestingExpression() throws {
        let e = try EmotionEngine(model: loadModel(), platform: "arkit")
        let resting = arkitFace(e.cm, ["browDown{S}": 0.55, "eyeSquint{S}": 0.4])
        e.startCalibration(tMs: 0, durationSec: 1)
        var r = run(e, from: 0, ms: 1100) { _ in resting }
        XCTAssertTrue(r.frames.contains { $0.calibrationResult == .done })
        r = run(e, from: r.t, ms: 500) { _ in resting }
        XCTAssertLessThan(r.frames.last!.aus["AU4"]!, 0.05)
        XCTAssertEqual(r.frames.last!.primary.id, "neutral")
    }

    func testBriefExpressionIsLogged() throws {
        let e = try EmotionEngine(model: loadModel(), platform: "arkit")
        let surprise = arkitFace(e.cm, ["browInnerUp": 0.7, "browOuterUp{S}": 0.7, "eyeWide{S}": 0.6, "jawOpen": 0.45])
        var r = run(e, from: 0, ms: 1000) { _ in arkitFace(e.cm) }
        var events: [EngineEvent] = []
        r = run(e, from: r.t, ms: 200) { _ in surprise }
        events += r.frames.flatMap(\.events)
        r = run(e, from: r.t, ms: 800) { _ in arkitFace(e.cm) }
        events += r.frames.flatMap(\.events)
        XCTAssertEqual(events.map(\.tag), ["micro:surprise"])
    }

    func testRangeCalibrationScalesSmallBrowRaise() throws {
        let model = try loadModel()
        let e = try EmotionEngine(model: model, platform: "arkit")
        let rest = arkitFace(e.cm)
        let weak = arkitFace(e.cm, ["browInnerUp": 0.3, "browOuterUp{S}": 0.25])
        e.startCalibration(tMs: 0, durationSec: 1)
        var r = run(e, from: 0, ms: 1100) { _ in rest }
        r = run(e, from: r.t, ms: 800) { _ in weak }
        let before = r.frames.last!.aus["AU1"]!
        e.startRangeStep(tMs: r.t, stepId: "brows_up")
        let p = e.cm.params.range
        r = run(e, from: r.t, ms: (p.settleSec + p.holdSec) * 1000 + 100) { _ in weak }
        let done = r.frames.compactMap(\.range).first { if case .done = $0 { return true } else { return false } }
        guard case .done(let updated, _)? = done else { return XCTFail("range step did not finish") }
        XCTAssertTrue(updated.contains("browInnerUp|+"))
        XCTAssertGreaterThan(e.baseline.gain("browInnerUp", 1), 1.5)
        r = run(e, from: r.t, ms: 800) { _ in weak }
        XCTAssertGreaterThan(r.frames.last!.aus["AU1"]!, before + 0.2)
    }

    func testExtendedCatalogueOnlyWhenEnabled() throws {
        let model = try loadModel()
        let off = try EmotionEngine(model: model, platform: "arkit")
        let on = try EmotionEngine(model: model, platform: "arkit", extended: true)
        let sneer = arkitFace(off.cm, ["mouthUpperUpLeft": 0.6, "noseSneerLeft": 0.45])
        let a = run(off, from: 0, ms: 600) { _ in sneer }.frames.last!
        let b = run(on, from: 0, ms: 600) { _ in sneer }.frames.last!
        XCTAssertEqual(a.scores["sneer"], 0)
        XCTAssertGreaterThan(b.scores["sneer"]!, 0.3)
    }

    func testFaceLossDecaysToNeutral() throws {
        let e = try EmotionEngine(model: loadModel(), platform: "arkit")
        var r = run(e, from: 0, ms: 1000) { _ in arkitFace(e.cm, ["mouthSmile{S}": 0.8, "cheekSquint{S}": 0.5]) }
        XCTAssertEqual(r.frames.last!.primary.id, "happiness")
        r = run(e, from: r.t, ms: 1500) { _ in nil }
        XCTAssertFalse(r.frames.last!.face)
        XCTAssertEqual(r.frames.last!.primary.id, "neutral")
        XCTAssertLessThan(r.frames.last!.scores["happiness"]!, 0.05)
    }
}
