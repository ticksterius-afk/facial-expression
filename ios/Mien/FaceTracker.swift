import ARKit
import Combine
import EmotionEngine
import SwiftUI

/// A brief expression or yawn shown in the Log tab.
struct LoggedEvent: Identifiable {
    let id = UUID()
    let date: Date
    let emoji: String
    let title: String
    let detail: String
}

/// Runs ARKit face tracking on the TrueDepth camera and feeds every frame
/// (60 fps) through the shared EmotionEngine. SwiftUI state is published at a
/// lower rate to keep the UI smooth.
final class FaceTracker: NSObject, ObservableObject, ARSessionDelegate {
    static let calibrationKey = "calibration.arkit"
    static let gainsKey = "gains.arkit"
    static let extendedKey = "extended"

    let session = ARSession()
    let engine: EmotionEngine
    let supported = ARFaceTrackingConfiguration.isSupported

    @Published private(set) var output: FrameResult?
    @Published private(set) var calibrating = false
    @Published private(set) var calibrationProgress = 0.0
    @Published private(set) var lastCalibration: BaselineTracker.CalibrationStep?
    /// Index into `rangeSteps` while the personal range calibration runs.
    @Published private(set) var rangeIndex: Int?
    @Published private(set) var rangeProgress = 0.0
    @Published var rangeSummary: String?
    @Published private(set) var events: [LoggedEvent] = []
    @Published private(set) var timeline: [(t: TimeInterval, id: String)] = []
    @Published private(set) var fps = 0.0
    @Published private(set) var errorMessage: String?

    private var lastPublish: TimeInterval = 0
    private var lastFrameTime: TimeInterval = 0
    private var rangeUpdated = 0
    private var rangeWeak: [String] = []

    override init() {
        let model: EmotionModel
        do {
            model = try EmotionModel.bundled()
            engine = try EmotionEngine(model: model, platform: "arkit",
                                       extended: UserDefaults.standard.bool(forKey: Self.extendedKey))
        } catch {
            fatalError("Bundled emotion model is invalid: \(error)")
        }
        super.init()
        session.delegate = self
        if let saved = UserDefaults.standard.dictionary(forKey: Self.calibrationKey) as? [String: Double] {
            engine.baseline.setCalibration(saved)
        }
        if let gains = UserDefaults.standard.dictionary(forKey: Self.gainsKey) as? [String: Double] {
            engine.baseline.setGains(gains)
        }
    }

    var sensitivity: Double {
        get { engine.sensitivity }
        set { engine.sensitivity = newValue }
    }

    /// Whether the extended catalogue (triumph, frustration, anxiety, …) is scored and listed.
    var extended: Bool {
        get { engine.extended }
        set {
            engine.extended = newValue
            UserDefaults.standard.set(newValue, forKey: Self.extendedKey)
            objectWillChange.send()
        }
    }

    /// Guided maximal expressions that teach the engine how far this face moves.
    var rangeSteps: [CompiledRangeStep] { engine.cm.rangeSteps.filter { !$0.targets.isEmpty } }
    var hasRangeGains: Bool { !engine.baseline.rangeGains().isEmpty }

    func start() {
        guard supported else { return }
        let config = ARFaceTrackingConfiguration()
        config.maximumNumberOfTrackedFaces = 1
        config.isLightEstimationEnabled = false
        // Highest available frame rate (60 fps on TrueDepth devices).
        if let best = ARFaceTrackingConfiguration.supportedVideoFormats.max(by: { $0.framesPerSecond < $1.framesPerSecond }) {
            config.videoFormat = best
        }
        errorMessage = nil
        session.run(config, options: [.resetTracking, .removeExistingAnchors])
    }

    func pause() {
        session.pause()
    }

    func beginCalibration() {
        engine.startCalibration(tMs: lastFrameTime * 1000, durationSec: 3)
        calibrating = true
        calibrationProgress = 0
        lastCalibration = nil
    }

    func forgetCalibration() {
        engine.baseline.reset()
        engine.baseline.resetGains()
        UserDefaults.standard.removeObject(forKey: Self.calibrationKey)
        UserDefaults.standard.removeObject(forKey: Self.gainsKey)
        objectWillChange.send()
    }

    // MARK: Personal range calibration

    func beginRange() {
        rangeUpdated = 0
        rangeWeak = []
        rangeSummary = nil
        rangeIndex = 0
        startRangeStep()
    }

    func stopRange() { finishRange(completed: false) }

    private func startRangeStep() {
        guard let i = rangeIndex else { return }
        rangeProgress = 0
        engine.startRangeStep(tMs: lastFrameTime * 1000, stepId: rangeSteps[i].id)
    }

    private func finishRange(completed: Bool) {
        engine.baseline.cancelRangeStep()
        guard rangeIndex != nil else { return }
        rangeIndex = nil
        rangeProgress = 0
        UserDefaults.standard.set(engine.baseline.rangeGains(), forKey: Self.gainsKey)
        guard completed else { return }
        rangeSummary = rangeWeak.isEmpty
            ? "Range calibrated — \(rangeUpdated) signals tuned to your face."
            : "Range calibrated (\(rangeUpdated) signals). Little movement seen for: \(rangeWeak.joined(separator: "; "))."
    }

    private func handleRange(_ out: FrameResult) {
        guard let i = rangeIndex, let state = out.range else { return }
        switch state {
        case .progress(let p):
            rangeProgress = p
            return
        case .done(let updated, let weak):
            rangeUpdated += updated.count
            if !weak.isEmpty { rangeWeak.append(rangeSteps[i].prompt) }
        case .failed:
            break
        }
        if i + 1 < rangeSteps.count {
            rangeIndex = i + 1
            startRangeStep()
        } else {
            finishRange(completed: true)
        }
    }

    // MARK: ARSessionDelegate (delivered on the main queue)

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let t = frame.timestamp
        if lastFrameTime > 0 { fps = fps * 0.9 + 0.1 / max(0.001, t - lastFrameTime) }
        lastFrameTime = t

        var measurements: [String: Double]?
        if let face = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first, face.isTracked {
            measurements = Self.measurements(face: face, camera: frame.camera)
        }
        let out = engine.process(tMs: t * 1000, measurements)
        handle(out, at: t)
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        if let arError = error as? ARError, arError.code == .cameraUnauthorized {
            errorMessage = "Camera access is off. Enable it in Settings › Privacy & Security › Camera › Mien."
        } else {
            errorMessage = error.localizedDescription
        }
    }

    private func handle(_ out: FrameResult, at t: TimeInterval) {
        for ev in out.events { log(ev) }
        handleRange(out)
        if calibrating {
            calibrationProgress = out.calibrationProgress
            if let result = out.calibrationResult {
                calibrating = false
                lastCalibration = result
                if result == .done, let cal = engine.baseline.calibration() {
                    UserDefaults.standard.set(cal, forKey: Self.calibrationKey)
                }
            }
        }
        if t - lastPublish >= 1.0 / 12 {
            lastPublish = t
            output = out
            timeline.append((t, out.face ? out.primary.id : ""))
            while let first = timeline.first, t - first.t > 60 { timeline.removeFirst() }
        }
    }

    private func log(_ ev: EngineEvent) {
        let m = engine.cm
        switch ev {
        case .micro(_, let id, let peak, let ms):
            guard let e = m.byId[id] else { return }
            events.insert(LoggedEvent(date: Date(), emoji: e.emoji, title: "Brief \(e.name.lowercased())", detail: "\(Int(ms)) ms · peak \(Int(peak * 100))%"), at: 0)
        case .yawn(_, let ms):
            events.insert(LoggedEvent(date: Date(), emoji: "🥱", title: "Yawn", detail: String(format: "%.1f s", ms / 1000)), at: 0)
        case .blink:
            return
        }
        if events.count > 60 { events.removeLast(events.count - 60) }
    }

    // MARK: ARKit -> engine measurements

    /// Blendshape coefficients keyed like the model ("eyeBlink_L" -> "eyeBlinkLeft") plus head pose.
    static func measurements(face: ARFaceAnchor, camera: ARCamera) -> [String: Double] {
        var m: [String: Double] = [:]
        for (location, value) in face.blendShapes {
            m[modelKey(location.rawValue)] = value.doubleValue
        }
        let pose = headPose(face: face.transform, camera: camera.transform)
        m["pose.pitch"] = pose.pitch
        m["pose.yaw"] = pose.yaw
        m["pose.roll"] = pose.roll
        return m
    }

    static func modelKey(_ raw: String) -> String {
        if raw.hasSuffix("_L") { return String(raw.dropLast(2)) + "Left" }
        if raw.hasSuffix("_R") { return String(raw.dropLast(2)) + "Right" }
        return raw
    }

    /// Head pose in degrees, using the engine's conventions:
    /// pitch > 0 chin up and roll > 0 tilted towards the person's left shoulder (both relative
    /// to gravity, so they do not depend on how the phone is held); yaw > 0 turned towards the
    /// person's left, relative to the direction of the phone.
    static func headPose(face: simd_float4x4, camera: simd_float4x4) -> (pitch: Double, yaw: Double, roll: Double) {
        // ARKit face frame: +x = the face's own left, +y = up, +z = out of the face. World y = up (gravity alignment).
        let x = simd_normalize(simd_make_float3(face.columns.0))
        let z = simd_normalize(simd_make_float3(face.columns.2))
        let p = simd_make_float3(face.columns.3)
        let c = simd_make_float3(camera.columns.3)
        let up = SIMD3<Float>(0, 1, 0)
        let deg = { (r: Float) in Double(r) * 180 / .pi }
        let pitch = asin(max(-1, min(1, z.y)))
        let roll = asin(max(-1, min(1, -x.y)))
        var toCamera = c - p
        toCamera.y = 0
        var forward = z
        forward.y = 0
        guard simd_length(toCamera) > 1e-4, simd_length(forward) > 1e-4 else { return (deg(pitch), 0, deg(roll)) }
        toCamera = simd_normalize(toCamera)
        forward = simd_normalize(forward)
        let leftRef = simd_normalize(simd_cross(up, toCamera))
        let yaw = atan2(simd_dot(forward, leftRef), simd_dot(forward, toCamera))
        return (deg(pitch), deg(yaw), deg(roll))
    }
}
